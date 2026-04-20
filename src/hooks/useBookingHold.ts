/**
 * useBookingHold — submit-flow soft lock (issue #211).
 *
 * Acquires a hold when the form renders with a valid (resource, window)
 * and releases it on unmount, submit, or when the window/resource
 * changes. Keeps the two-user race (both open the same slot, both
 * submit) surfaced as a soft conflict through `hold-conflict` rather
 * than a save-time failure.
 *
 * Contract:
 *   - `enabled=false` skips acquisition entirely — use during initial
 *     form load before the user has committed to a slot.
 *   - Re-acquiring with the same holder is a TTL refresh (handled by the
 *     registry); safe on every window edit.
 *   - The hook is defensively async-tolerant: adapters that return a
 *     `Promise` are awaited. A failing acquire surfaces via `state.error`
 *     without throwing, so the form can still render (the conflict rule
 *     will still catch the race on submit).
 *
 * Host usage:
 *   const bus = useMemo(() => createHoldRegistry(), []);
 *   const hold = useBookingHold(bus, {
 *     resourceId, start, end, holderId,
 *     enabled: Boolean(resourceId && start && end),
 *   });
 *   // On submit success: `hold.release()` (or let unmount handle it).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  Hold,
  HoldRegistry,
  AcquireHoldError,
  AcquireHoldInput,
  AcquireHoldResult,
} from '../core/holds/holdRegistry';

// ─── Options / state ──────────────────────────────────────────────────────

/**
 * Minimal surface the hook consumes from a hold provider. Satisfied by
 * `HoldRegistry` (single-process) and by any adapter that implements
 * `acquireHold / releaseHold` on the v1 CalendarAdapter contract.
 */
export interface HoldProvider {
  acquire(input: AcquireHoldInput): AcquireHoldResult | Promise<AcquireHoldResult>;
  release(holdId: string): void | Promise<void>;
}

export interface UseBookingHoldOptions {
  readonly resourceId: string | null | undefined;
  readonly start: Date | string | number | null | undefined;
  readonly end: Date | string | number | null | undefined;
  readonly holderId: string;
  /** TTL in ms; defaults to the registry default (5 min). */
  readonly ttlMs?: number;
  /**
   * When false, any existing hold is released and no new hold is acquired.
   * Defaults to true. Use this to skip acquisition while the form is still
   * collecting a resource / window selection.
   */
  readonly enabled?: boolean;
  /**
   * Stable id passed to the registry so adapters that mirror holds to a
   * shared store can dedupe. Defaults to `undefined` (registry generates).
   */
  readonly holdId?: string;
}

export interface UseBookingHoldState {
  readonly hold: Hold | null;
  readonly error: AcquireHoldError | null;
  readonly status: 'idle' | 'acquiring' | 'held' | 'error' | 'released';
  /** Explicitly release the current hold. Safe to call more than once. */
  readonly release: () => void;
}

// ─── Implementation ───────────────────────────────────────────────────────

const EMPTY_STATE: UseBookingHoldState = {
  hold: null,
  error: null,
  status: 'idle',
  release: () => {},
};

function windowKey(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined,
): string {
  const s = start instanceof Date ? start.toISOString() : start != null ? String(start) : '';
  const e = end   instanceof Date ? end.toISOString()   : end   != null ? String(end)   : '';
  return `${s}→${e}`;
}

function releaseHoldSafely(provider: HoldProvider, holdId: string): void {
  try {
    const r = provider.release(holdId);
    if (r && typeof (r as Promise<void>).then === 'function') {
      (r as Promise<void>).catch(() => { /* best-effort */ });
    }
  } catch { /* best-effort */ }
}

export function useBookingHold(
  provider: HoldProvider | null | undefined,
  opts: UseBookingHoldOptions,
): UseBookingHoldState {
  const { resourceId, start, end, holderId, ttlMs, enabled = true, holdId } = opts;

  const [hold, setHold] = useState<Hold | null>(null);
  const [error, setError] = useState<AcquireHoldError | null>(null);
  const [status, setStatus] = useState<UseBookingHoldState['status']>('idle');

  // Live hold id. Cleared only when we explicitly release or a re-acquire
  // replaces it. The cleanup-then-new-body React lifecycle means we can't
  // rely on cleanup clearing this — handle transitions in the body.
  const heldIdRef = useRef<string | null>(null);

  const release = useCallback(() => {
    const id = heldIdRef.current;
    if (!id || !provider) return;
    heldIdRef.current = null;
    releaseHoldSafely(provider, id);
    setHold(null);
    setStatus('released');
  }, [provider]);

  useEffect(() => {
    const hadHold = heldIdRef.current !== null;

    if (!provider || !enabled || !resourceId || !start || !end || !holderId) {
      // Inputs became invalid — release the prior hold (if any) and park.
      if (hadHold && provider) {
        const prev = heldIdRef.current!;
        heldIdRef.current = null;
        releaseHoldSafely(provider, prev);
        setHold(null);
        setStatus('released');
      } else {
        setStatus('idle');
      }
      return;
    }

    // Release any prior hold in-place before re-acquiring. The registry
    // refreshes same-holder TTLs internally, but callers may have swapped
    // resource/window, and we want "released" visible on the old id.
    if (hadHold) {
      const prev = heldIdRef.current!;
      heldIdRef.current = null;
      releaseHoldSafely(provider, prev);
    }

    let cancelled = false;
    setStatus('acquiring');
    setError(null);

    Promise.resolve(
      provider.acquire({
        resourceId,
        window: { start, end },
        holderId,
        ...(ttlMs !== undefined ? { ttlMs } : {}),
        ...(holdId !== undefined ? { id: holdId } : {}),
      }),
    ).then(result => {
      if (cancelled) {
        if (result.ok === true) releaseHoldSafely(provider, result.hold.id);
        return;
      }
      if (result.ok === true) {
        heldIdRef.current = result.hold.id;
        setHold(result.hold);
        setStatus('held');
      } else if (result.ok === false) {
        setError(result.error);
        setStatus('error');
      }
    }).catch(err => {
      if (cancelled) return;
      setError({
        code: 'CONFLICTING_HOLD',
        message: err instanceof Error ? err.message : 'acquireHold failed',
      });
      setStatus('error');
    });

    return () => {
      cancelled = true;
    };
  }, [provider, enabled, resourceId, windowKey(start, end), holderId, ttlMs, holdId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release on unmount only — separate from the transitional effect above
  // so cleanup doesn't race with the acquiring effect's ref writes.
  useEffect(() => {
    return () => {
      const id = heldIdRef.current;
      if (id && provider) {
        heldIdRef.current = null;
        releaseHoldSafely(provider, id);
      }
    };
  }, [provider]);

  if (!provider) return EMPTY_STATE;

  return { hold, error, status, release };
}

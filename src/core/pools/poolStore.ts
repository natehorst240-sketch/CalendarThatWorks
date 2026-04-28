/**
 * CalendarEngine — poolStore (#212).
 *
 * Small localStorage adapter for `ResourcePool` maps. Lives alongside
 * the schema so any host (demo, examples, custom integrations) can
 * persist round-robin cursor advances across page reloads without
 * having to handle the Map<->JSON round-trip itself.
 *
 * Keyed by calendarId so multi-calendar demos don't collide.
 *
 * The store is defensive: any storage or parse failure yields an
 * empty map rather than throwing. That matches `profileStore.ts`
 * and keeps the demo booting even when localStorage is disabled
 * (private-mode Safari, etc.).
 */

import type { ResourcePool, PoolStrategy } from './resourcePoolSchema';

// ─── Storage key ─────────────────────────────────────────────────────────────

export function poolStorageKey(calendarId: string): string {
  return `wc-pools-${calendarId}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist the given pools map. Call after each engine state change
 * where the pools differ from what was last saved.
 */
export function savePools(
  calendarId: string,
  pools: ReadonlyMap<string, ResourcePool> | readonly ResourcePool[],
): void {
  try {
    const arr = Array.isArray(pools) ? pools : Array.from((pools as ReadonlyMap<string, ResourcePool>).values());
    localStorage.setItem(poolStorageKey(calendarId), JSON.stringify(arr));
  } catch { /* non-fatal: private mode, quota, serialization */ }
}

/**
 * Read pools previously saved for `calendarId`. Returns an empty
 * array when storage is empty, disabled, or corrupt.
 *
 * Malformed entries (unknown strategy, bad shape) are silently dropped
 * to keep the calendar booting after a bad deploy. Hosts that need
 * visibility into drops should call `loadPoolsDetailed` instead.
 */
export function loadPools(calendarId: string): ResourcePool[] {
  return loadPoolsDetailed(calendarId).pools;
}

export interface LoadPoolsResult {
  /** The valid pools recovered from storage. */
  readonly pools: ResourcePool[];
  /**
   * Count of entries that parsed as objects but failed shape
   * validation (e.g. unknown strategy, missing memberIds). A non-zero
   * value usually points at a schema migration the host hasn't run.
   */
  readonly dropped: number;
  /**
   * True iff the stored value couldn't be parsed at all (storage
   * disabled, JSON.parse threw, or the top-level value wasn't an
   * array). When this is true, `pools` is `[]` and `dropped` is `0`.
   */
  readonly storageError: boolean;
}

/**
 * Read pools and report any malformed entries. Same defensive
 * behavior as `loadPools` — never throws — but lets the host log or
 * surface "the cursor on pool `fleet-west` was dropped" instead of
 * losing the round-robin position silently.
 */
export function loadPoolsDetailed(calendarId: string): LoadPoolsResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(poolStorageKey(calendarId));
  } catch {
    return { pools: [], dropped: 0, storageError: true };
  }
  if (raw == null) return { pools: [], dropped: 0, storageError: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { pools: [], dropped: 0, storageError: true };
  }
  if (!Array.isArray(parsed)) return { pools: [], dropped: 0, storageError: true };

  const out: ResourcePool[] = [];
  let dropped = 0;
  for (const item of parsed) {
    const pool = coerce(item);
    if (pool) out.push(pool);
    else dropped++;
  }
  return { pools: out, dropped, storageError: false };
}

/** Remove the stored pools entry (e.g. on "reset demo" actions). */
export function clearPools(calendarId: string): void {
  try { localStorage.removeItem(poolStorageKey(calendarId)); } catch { /* ignore */ }
}

// ─── Internals ───────────────────────────────────────────────────────────────

const STRATEGIES: readonly PoolStrategy[] = ['first-available', 'least-loaded', 'round-robin'];

function coerce(item: unknown): ResourcePool | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || typeof r['name'] !== 'string') return null;
  if (!Array.isArray(r['memberIds']) || !r['memberIds'].every(m => typeof m === 'string')) return null;
  if (typeof r['strategy'] !== 'string' || !STRATEGIES.includes(r['strategy'] as PoolStrategy)) return null;
  const out: ResourcePool = {
    id:        r['id'],
    name:      r['name'],
    memberIds: r['memberIds'] as string[],
    strategy:  r['strategy'] as PoolStrategy,
    ...(typeof r['rrCursor'] === 'number'  ? { rrCursor: r['rrCursor'] } : {}),
    ...(typeof r['disabled'] === 'boolean' ? { disabled: r['disabled'] } : {}),
  };
  return out;
}

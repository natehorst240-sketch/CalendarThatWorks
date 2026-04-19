/**
 * useResourceLocations — orchestrates a `LocationProvider` across the
 * AssetsView sticky column.
 *
 * For each resource id:
 *   - If `provider.subscribe` exists, open a push subscription and let the
 *     provider feed updates through `onUpdate`.
 *   - Otherwise, call `fetchLocation` once immediately and then again on
 *     an interval of `refreshIntervalMs` (clamped to MIN_POLL_MS). Set
 *     `refreshIntervalMs: 0` to disable polling after the initial fetch
 *     (this is how ManualLocationProvider avoids re-reading meta on a timer).
 *
 * Lifecycle:
 *   - `provider.init?()` is called once per provider instance on mount.
 *   - `provider.dispose?()` is called on unmount / provider swap.
 *
 * Returns a Map<resourceId, LocationData | null> that is stable across
 * renders where no updates occurred.
 */
import { useEffect, useRef, useState } from 'react';
import type { LocationData, LocationProvider } from '../types/assets';

/**
 * Floor for provider poll intervals. Providers that advertise a shorter
 * `refreshIntervalMs` are clamped up to this value so a misbehaving plugin
 * can't hammer the host with sub-second fetch calls. `refreshIntervalMs: 0`
 * disables polling entirely (initial fetch only) and bypasses this floor.
 */
const MIN_POLL_MS = 5000;

/**
 * React hook that binds a `LocationProvider` to a list of resource ids and
 * returns a `Map<resourceId, LocationData | null>` suitable for rendering
 * the AssetsView sticky-column location banners.
 *
 * See the file-level docstring for the full lifecycle contract. Callers
 * should memoize `resourceIds` — changes to array identity (not content)
 * are tolerated via the join-based `idsKey`, but a stable upstream array
 * minimizes re-subscription churn.
 */
export function useResourceLocations(
  resourceIds: string[],
  provider: LocationProvider | null | undefined,
): Map<string, LocationData | null> {
  const [locations, setLocations] = useState<Map<string, LocationData | null>>(() => new Map());

  // Freeze the ids list into a stable array reference so effects don't
  // resubscribe on every render when the array contents are unchanged.
  const idsKey = resourceIds.join('\u0000');
  const idsRef = useRef<string[]>(resourceIds);
  idsRef.current = resourceIds;

  useEffect(() => {
    if (!provider) {
      setLocations(new Map());
      return;
    }

    let cancelled = false;
    const abort = new AbortController();
    const unsubs: Array<() => void> = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    /**
     * Commits a single resource's location into state. Bails out when the
     * effect has been torn down, and returns the previous Map reference
     * unchanged when the value for `resourceId` hasn't moved — so downstream
     * memoized selectors don't see a phantom identity change.
     */
    const update = (resourceId: string, data: LocationData | null) => {
      if (cancelled) return;
      setLocations(prev => {
        const prevData = prev.get(resourceId);
        if (prevData === data) return prev; // reference stable path
        const next = new Map(prev);
        next.set(resourceId, data);
        return next;
      });
    };

    /**
     * Runs a single `fetchLocation` call for `id`, forwarding the abort
     * signal so in-flight requests are cancelled on unmount. Failures are
     * coerced into an `{ status: 'error' }` LocationData so the UI can
     * surface a badge instead of hanging on stale text.
     */
    const runFetch = (id: string) => {
      provider.fetchLocation(id, abort.signal)
        .then(data => update(id, data))
        .catch(() => update(id, {
          text:   'Error',
          asOf:   new Date().toISOString(),
          status: 'error',
        }));
    };

    /**
     * Top-level orchestration for the effect: awaits optional `init()`,
     * computes the clamped poll interval, then for each id either opens a
     * push subscription or kicks off the fetch + interval polling pair.
     * Subscribed resources still do one eager fetch so the banner isn't
     * blank while waiting for the first pushed update.
     */
    const start = async () => {
      if (provider.init) {
        try { await provider.init(); } catch { /* ignore, per plugin contract */ }
      }
      if (cancelled) return;

      const pollMs = provider.refreshIntervalMs > 0
        ? Math.max(MIN_POLL_MS, provider.refreshIntervalMs)
        : 0;

      for (const id of idsRef.current) {
        if (provider.subscribe) {
          const off = provider.subscribe(id, (data) => update(id, data));
          if (typeof off === 'function') unsubs.push(off);
          // Optional: still do one-shot fetch so banners aren't empty while
          // we wait for the first push. Subscribers that push synchronously
          // will race — the latest value wins.
          runFetch(id);
          continue;
        }
        runFetch(id);
        if (pollMs > 0) {
          intervals.push(setInterval(() => runFetch(id), pollMs));
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      abort.abort();
      for (const off of unsubs) {
        try { off(); } catch { /* ignore */ }
      }
      for (const i of intervals) clearInterval(i);
      if (provider.dispose) {
        try { provider.dispose(); } catch { /* ignore */ }
      }
    };
  }, [provider, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return locations;
}

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
 */
export function loadPools(calendarId: string): ResourcePool[] {
  try {
    const raw = localStorage.getItem(poolStorageKey(calendarId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ResourcePool[] = [];
    for (const item of parsed) {
      const pool = coerce(item);
      if (pool) out.push(pool);
    }
    return out;
  } catch {
    return [];
  }
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
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  if (!Array.isArray(r.memberIds) || !r.memberIds.every(m => typeof m === 'string')) return null;
  if (typeof r.strategy !== 'string' || !STRATEGIES.includes(r.strategy as PoolStrategy)) return null;
  const out: ResourcePool = {
    id:        r.id,
    name:      r.name,
    memberIds: r.memberIds as string[],
    strategy:  r.strategy as PoolStrategy,
    ...(typeof r.rrCursor === 'number'  ? { rrCursor: r.rrCursor } : {}),
    ...(typeof r.disabled === 'boolean' ? { disabled: r.disabled } : {}),
  };
  return out;
}

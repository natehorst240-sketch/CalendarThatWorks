/**
 * Resource pool resolver — issue #212.
 *
 * Picks a concrete resource from a `ResourcePool` given a proposed
 * (window, event) and current engine state. Pure function — no side
 * effects, deterministic given identical input — so the submit-flow can
 * call it before holding or writing.
 *
 * Resolution is driven by the pool's `strategy`:
 *   - `first-available`: first member with no hard conflict on the window.
 *   - `least-loaded`: member with the smallest total assigned units in
 *     the window. Ties broken by member order (stable).
 *   - `round-robin`: cycles through members starting at `rrCursor + 1`,
 *     skipping any member that would produce a hard conflict. Returns
 *     an updated cursor so the host can persist it.
 *
 * Every strategy excludes members already in hard conflict — a pool
 * never resolves to a resource that would reject the booking anyway.
 * Soft conflicts (holds, min-rest warnings) do not disqualify.
 */
import type { Assignment } from '../engine/schema/assignmentSchema'
import type { ConflictEvent, ConflictRule } from '../conflictEngine'
import { evaluateConflicts } from '../conflictEngine'
import type { EngineResource } from '../engine/schema/resourceSchema'
import type { ResourcePool } from './resourcePoolSchema'

// ─── Types ────────────────────────────────────────────────────────────────

export interface ResolvePoolInput {
  readonly pool: ResourcePool
  /**
   * Proposed event shape (no resource set — the resolver fills it in).
   * The resolver tries the pool's members in strategy order and assigns
   * the first that doesn't produce a hard conflict.
   */
  readonly proposed: Omit<ConflictEvent, 'resource'>
  /** Currently-visible events to consult for conflict checks. */
  readonly events: readonly ConflictEvent[]
  /** Active rules — only hard-severity violations disqualify a candidate. */
  readonly rules: readonly ConflictRule[]
  readonly resources?: ReadonlyMap<string, EngineResource>
  readonly assignments?: ReadonlyMap<string, Assignment>
  /**
   * Strategy `least-loaded` only — extends the workload window past
   * `proposed.end` by this many milliseconds when scoring candidates.
   * The conflict check still uses the proposed window; `lookaheadMs`
   * only widens the load tally so a member that is free *now* but
   * already slammed an hour later can be deprioritized for fleet-style
   * dispatch.
   *
   * Defaults to `0` — the original window-local behavior.
   */
  readonly lookaheadMs?: number
  /**
   * When true, member ids that aren't present in `resources` are
   * filtered out of the candidate set before any scoring or conflict
   * check. Off by default to match the historical behavior — see
   * `validatePools` for the admin-time variant.
   *
   * `evaluated` reflects the post-filter list, so a typo'd id never
   * appears in audit trails. When the filter empties the candidate
   * list, the resolver returns `POOL_EMPTY`.
   *
   * Requires `resources` — `resolvePool` throws when `strictMembers`
   * is true and no registry is provided, so the strict contract can't
   * be silently disabled by a missing argument.
   */
  readonly strictMembers?: boolean
}

export type ResolvePoolErrorCode =
  | 'POOL_DISABLED'
  | 'POOL_EMPTY'
  | 'NO_AVAILABLE_MEMBER'

export interface ResolvePoolError {
  readonly code: ResolvePoolErrorCode
  readonly message: string
  readonly poolId: string
  /**
   * Members that were tried, in the order the strategy attempted them,
   * before the resolver gave up. Empty for `POOL_DISABLED` and
   * `POOL_EMPTY` (no member is ever attempted). Populated for
   * `NO_AVAILABLE_MEMBER` so callers can surface "tried A, B; both
   * conflicted" instead of a bare "no member available".
   */
  readonly evaluated: readonly string[]
}

export interface ResolvePoolSuccess {
  readonly ok: true
  readonly resourceId: string
  readonly strategy: ResourcePool['strategy']
  /** Updated round-robin cursor — undefined for non-rr strategies. */
  readonly rrCursor?: number
  /**
   * Members evaluated before the winner, in order. Useful for audit and
   * for surfacing "tried X, Y, then Z" in the conflict drawer.
   */
  readonly evaluated: readonly string[]
}

export type ResolvePoolResult =
  | ResolvePoolSuccess
  | { readonly ok: false; readonly error: ResolvePoolError }

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasHardConflict(
  proposed: ConflictEvent,
  input: ResolvePoolInput,
): boolean {
  const result = evaluateConflicts({
    proposed,
    events: input.events,
    rules: input.rules,
    resources: input.resources,
    assignments: input.assignments,
  })
  return !result.allowed
}

/** Half-open interval overlap — matches conflictEngine semantics. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function toTime(v: Date | string | number): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime()
}

function workloadFor(
  resourceId: string,
  windowStart: number,
  windowEnd: number,
  events: readonly ConflictEvent[],
  assignments: ReadonlyMap<string, Assignment> | undefined,
  lookaheadMs: number = 0,
): number {
  // Map from eventId → units contributed to this resource. When
  // assignments is provided we read explicit units; otherwise each
  // same-resource event counts as 100.
  const eventUnits = new Map<string, number>()
  if (assignments) {
    for (const a of assignments.values()) {
      if (a.resourceId !== resourceId) continue
      eventUnits.set(a.eventId, (eventUnits.get(a.eventId) ?? 0) + a.units)
    }
  }
  const tallyEnd = windowEnd + Math.max(0, lookaheadMs)
  let total = 0
  for (const ev of events) {
    const evResource = ev.resource ?? ''
    if (evResource !== resourceId) continue
    const es = toTime(ev.start)
    const ee = toTime(ev.end)
    if (!overlaps(es, ee, windowStart, tallyEnd)) continue
    total += assignments ? (eventUnits.get(ev.id) ?? 100) : 100
  }
  return total
}

// ─── Public API ──────────────────────────────────────────────────────────

export function resolvePool(input: ResolvePoolInput): ResolvePoolResult {
  const { pool } = input
  if (input.strictMembers && !input.resources) {
    // Programmer error — silently falling back to "all members ok"
    // would defeat the whole point of strict mode and reintroduce
    // the ghost-assignment risk it's supposed to prevent.
    throw new Error('resolvePool: strictMembers requires a `resources` registry')
  }
  if (pool.disabled) {
    return { ok: false, error: { code: 'POOL_DISABLED', message: `Pool "${pool.id}" is disabled.`, poolId: pool.id, evaluated: [] } }
  }
  if (pool.memberIds.length === 0) {
    return { ok: false, error: { code: 'POOL_EMPTY', message: `Pool "${pool.id}" has no members.`, poolId: pool.id, evaluated: [] } }
  }

  // Optional integrity filter: drop ids that aren't in the resource
  // registry before any scoring runs. Without this, the resolver was
  // happy to commit a typo'd or removed id as the winning resource,
  // which docs claimed wasn't possible.
  const validMembers = input.strictMembers && input.resources
    ? pool.memberIds.filter(id => input.resources!.has(id))
    : pool.memberIds
  if (validMembers.length === 0) {
    return { ok: false, error: { code: 'POOL_EMPTY', message: `Pool "${pool.id}" has no members.`, poolId: pool.id, evaluated: [] } }
  }

  const winStart    = toTime(input.proposed.start)
  const winEnd      = toTime(input.proposed.end)
  const lookaheadMs = input.lookaheadMs ?? 0
  const evaluated: string[] = []

  // Build the candidate order per strategy.
  let candidates: readonly string[]
  switch (pool.strategy) {
    case 'first-available':
      candidates = validMembers
      break
    case 'least-loaded': {
      const loaded = validMembers.map((id, i) => ({
        id,
        index: i,
        load: workloadFor(id, winStart, winEnd, input.events, input.assignments, lookaheadMs),
      }))
      loaded.sort((a, b) => a.load - b.load || a.index - b.index)
      candidates = loaded.map(m => m.id)
      break
    }
    case 'round-robin': {
      // Cursor is anchored to the original `pool.memberIds` ordering so
      // it stays stable across renders even if `strictMembers` removes
      // some entries on a given evaluation.
      const startAt = ((pool.rrCursor ?? -1) + 1) % pool.memberIds.length
      const ordered = [
        ...pool.memberIds.slice(startAt),
        ...pool.memberIds.slice(0, startAt),
      ]
      const allowed = new Set(validMembers)
      candidates = ordered.filter(id => allowed.has(id))
      break
    }
  }

  for (const candidate of candidates) {
    evaluated.push(candidate)
    const proposed: ConflictEvent = { ...input.proposed, resource: candidate }
    if (hasHardConflict(proposed, input)) continue
    const result: ResolvePoolSuccess = {
      ok: true,
      resourceId: candidate,
      strategy: pool.strategy,
      evaluated,
    }
    if (pool.strategy === 'round-robin') {
      const nextCursor = pool.memberIds.indexOf(candidate)
      // Invariant: every candidate originates from `pool.memberIds`, so
      // indexOf cannot return -1 on the current code path. Assert anyway
      // so a future refactor that projects candidates through a
      // transform fails loudly instead of persisting `rrCursor: -1`.
      if (nextCursor < 0) {
        throw new Error(`resolvePool: round-robin candidate "${candidate}" is not in pool "${pool.id}" memberIds`)
      }
      return { ...result, rrCursor: nextCursor }
    }
    return result
  }

  return {
    ok: false,
    error: {
      code: 'NO_AVAILABLE_MEMBER',
      message: `Pool "${pool.id}" has no available member for the requested window.`,
      poolId: pool.id,
      evaluated,
    },
  }
}

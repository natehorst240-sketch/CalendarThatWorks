/**
 * resolvePool — unit specs (issue #212).
 *
 * Pool resolution is a pure function that chooses a concrete resource
 * from a virtual pool before a booking is written. Strategy behavior
 * is pinned here so the submit-flow can rely on deterministic choices.
 */
import { describe, it, expect } from 'vitest'
import { resolvePool } from '../resolvePool'
import type { ResourcePool } from '../resourcePoolSchema'
import type { ConflictEvent, ConflictRule } from '../../conflictEngine'
import { makeAssignment } from '../../engine/schema/assignmentSchema'

const winStart = new Date(Date.UTC(2026, 3, 20, 9, 0))
const winEnd   = new Date(Date.UTC(2026, 3, 20, 11, 0))

const proposed: Omit<ConflictEvent, 'resource'> = {
  id: 'new',
  start: winStart,
  end: winEnd,
  category: 'flight',
}

const overlapRule: ConflictRule = { id: 'ovr', type: 'resource-overlap', severity: 'hard' }

describe('resolvePool — guard paths', () => {
  it('rejects disabled pools', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Disabled', memberIds: ['a'], strategy: 'first-available', disabled: true,
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result).toMatchObject({ ok: false, error: { code: 'POOL_DISABLED' } })
  })

  it('rejects empty pools', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Empty', memberIds: [], strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result).toMatchObject({ ok: false, error: { code: 'POOL_EMPTY' } })
  })

  it('rejects when every member is in hard conflict', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Full', memberIds: ['a', 'b'], strategy: 'first-available',
    }
    const events: ConflictEvent[] = [
      { id: 'e1', start: winStart, end: winEnd, resource: 'a' },
      { id: 'e2', start: winStart, end: winEnd, resource: 'b' },
    ]
    const result = resolvePool({ pool, proposed, events, rules: [overlapRule] })
    expect(result).toMatchObject({ ok: false, error: { code: 'NO_AVAILABLE_MEMBER' } })
  })
})

describe('resolvePool — first-available', () => {
  const pool: ResourcePool = {
    id: 'p', name: 'Drivers', memberIds: ['driver-1', 'driver-2', 'driver-3'],
    strategy: 'first-available',
  }

  it('picks the first member when none conflict', () => {
    const result = resolvePool({ pool, proposed, events: [], rules: [overlapRule] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('driver-1')
      expect(result.evaluated).toEqual(['driver-1'])
    }
  })

  it('skips members with hard conflicts and picks the next', () => {
    const events: ConflictEvent[] = [
      { id: 'e1', start: winStart, end: winEnd, resource: 'driver-1' },
    ]
    const result = resolvePool({ pool, proposed, events, rules: [overlapRule] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('driver-2')
      expect(result.evaluated).toEqual(['driver-1', 'driver-2'])
    }
  })

  it('preserves member order — does not permute', () => {
    const result = resolvePool({
      pool: { ...pool, memberIds: ['z', 'a', 'm'] },
      proposed, events: [], rules: [overlapRule],
    })
    expect(result.ok && result.resourceId).toBe('z')
  })
})

describe('resolvePool — least-loaded', () => {
  const pool: ResourcePool = {
    id: 'p', name: 'Rooms', memberIds: ['r1', 'r2', 'r3'], strategy: 'least-loaded',
  }

  it('picks the member with the lowest overlapping workload', () => {
    // r1 = 2 events, r2 = 1 event, r3 = 0 events.
    const events: ConflictEvent[] = [
      { id: 'a', start: winStart, end: winEnd, resource: 'r1' },
      { id: 'b', start: winStart, end: winEnd, resource: 'r1' },
      { id: 'c', start: winStart, end: winEnd, resource: 'r2' },
    ]
    const result = resolvePool({ pool, proposed, events, rules: [] })
    expect(result.ok && result.resourceId).toBe('r3')
  })

  it('uses Assignment units when provided', () => {
    // Restrict to r1 + r2 for this test: r1=50 units, r2=100 → r1 wins.
    const scopedPool: ResourcePool = { ...pool, memberIds: ['r1', 'r2'] }
    const events: ConflictEvent[] = [
      { id: 'half', start: winStart, end: winEnd, resource: 'r1' },
      { id: 'full', start: winStart, end: winEnd, resource: 'r2' },
    ]
    const assignments = new Map([
      ['asg-half', makeAssignment('asg-half', { eventId: 'half', resourceId: 'r1', units: 50 })],
      ['asg-full', makeAssignment('asg-full', { eventId: 'full', resourceId: 'r2', units: 100 })],
    ])
    const result = resolvePool({ pool: scopedPool, proposed, events, rules: [], assignments })
    expect(result.ok && result.resourceId).toBe('r1')
  })

  it('breaks ties by member order (stable)', () => {
    const events: ConflictEvent[] = []
    const result = resolvePool({ pool, proposed, events, rules: [] })
    expect(result.ok && result.resourceId).toBe('r1')
  })

  it('ignores events outside the proposed window', () => {
    const events: ConflictEvent[] = [
      {
        id: 'earlier', resource: 'r1',
        start: new Date(Date.UTC(2026, 3, 20, 6, 0)),
        end:   new Date(Date.UTC(2026, 3, 20, 7, 0)),
      },
    ]
    const result = resolvePool({ pool, proposed, events, rules: [] })
    expect(result.ok && result.resourceId).toBe('r1')
  })
})

describe('resolvePool — round-robin', () => {
  const pool: ResourcePool = {
    id: 'p', name: 'Agents', memberIds: ['a', 'b', 'c'], strategy: 'round-robin',
  }

  it('starts at index 0 when cursor is undefined', () => {
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('a')
      expect(result.rrCursor).toBe(0)
    }
  })

  it('advances past the previous cursor', () => {
    const result = resolvePool({
      pool: { ...pool, rrCursor: 0 },
      proposed, events: [], rules: [],
    })
    expect(result.ok && result.resourceId).toBe('b')
    if (result.ok) expect(result.rrCursor).toBe(1)
  })

  it('wraps around when the cursor reaches the end', () => {
    const result = resolvePool({
      pool: { ...pool, rrCursor: 2 },
      proposed, events: [], rules: [],
    })
    expect(result.ok && result.resourceId).toBe('a')
    if (result.ok) expect(result.rrCursor).toBe(0)
  })

  it('skips members in hard conflict and returns the chosen index as the new cursor', () => {
    const events: ConflictEvent[] = [
      { id: 'e1', start: winStart, end: winEnd, resource: 'b' },
    ]
    const result = resolvePool({
      pool: { ...pool, rrCursor: 0 }, // next = b, but b is busy → c
      proposed, events, rules: [overlapRule],
    })
    expect(result.ok && result.resourceId).toBe('c')
    if (result.ok) expect(result.rrCursor).toBe(2)
  })
})

describe('resolvePool — evaluated trail', () => {
  it('lists every member tried before the winner in order', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'X', memberIds: ['a', 'b', 'c', 'd'], strategy: 'first-available',
    }
    const events: ConflictEvent[] = [
      { id: 'e1', start: winStart, end: winEnd, resource: 'a' },
      { id: 'e2', start: winStart, end: winEnd, resource: 'b' },
    ]
    const result = resolvePool({ pool, proposed, events, rules: [overlapRule] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.evaluated).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty evaluated trail on POOL_DISABLED (no member attempted)', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Off', memberIds: ['a', 'b'], strategy: 'first-available', disabled: true,
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('POOL_DISABLED')
      expect(result.error.evaluated).toEqual([])
    }
  })

  it('returns an empty evaluated trail on POOL_EMPTY (no member to attempt)', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Empty', memberIds: [], strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('POOL_EMPTY')
      expect(result.error.evaluated).toEqual([])
    }
  })

  it('returns the full attempt list on NO_AVAILABLE_MEMBER', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Slammed', memberIds: ['a', 'b', 'c'], strategy: 'first-available',
    }
    const events: ConflictEvent[] = [
      { id: 'e1', start: winStart, end: winEnd, resource: 'a' },
      { id: 'e2', start: winStart, end: winEnd, resource: 'b' },
      { id: 'e3', start: winStart, end: winEnd, resource: 'c' },
    ]
    const result = resolvePool({ pool, proposed, events, rules: [overlapRule] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NO_AVAILABLE_MEMBER')
      expect(result.error.evaluated).toEqual(['a', 'b', 'c'])
    }
  })
})

describe('resolvePool — round-robin cursor normalization', () => {
  it('wraps a stale cursor that points past the end of the member list', () => {
    // Pool was 5 members when cursor was stored as 4; members have
    // since been trimmed to 3. `((4 ?? -1) + 1) % 3 === 2` → start at c.
    const pool: ResourcePool = {
      id: 'p', name: 'Shrunk', memberIds: ['a', 'b', 'c'],
      strategy: 'round-robin', rrCursor: 4,
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('c')
      expect(result.rrCursor).toBe(2)
    }
  })
})

describe('resolvePool — least-loaded lookaheadMs', () => {
  // r1 is free in [9,11) but loaded at [11,13); r2 is free in [9,11)
  // and free for the rest of the day. Without lookahead they tie and
  // declared order picks r1; with a 2h lookahead the tie breaks for r2.
  const pool: ResourcePool = {
    id: 'p', name: 'Trucks', memberIds: ['r1', 'r2'], strategy: 'least-loaded',
  }
  const adjacentEvent: ConflictEvent = {
    id: 'adj', resource: 'r1',
    start: new Date(Date.UTC(2026, 3, 20, 11, 0)),
    end:   new Date(Date.UTC(2026, 3, 20, 13, 0)),
  }

  it('ignores adjacent load by default (window-local)', () => {
    const result = resolvePool({ pool, proposed, events: [adjacentEvent], rules: [] })
    expect(result.ok && result.resourceId).toBe('r1')
  })

  it('counts adjacent load when lookaheadMs widens the tally', () => {
    const result = resolvePool({
      pool, proposed, events: [adjacentEvent], rules: [],
      lookaheadMs: 2 * 60 * 60 * 1000,
    })
    expect(result.ok && result.resourceId).toBe('r2')
  })
})

describe('resolvePool — strictMembers filters unknown ids', () => {
  // Build a minimal EngineResource map. Keys are what the resolver
  // checks; the value shape is irrelevant for the filter path.
  const knownResources = new Map([
    ['r1', { id: 'r1', label: 'R1' } as unknown as import('../../engine/schema/resourceSchema').EngineResource],
    ['r3', { id: 'r3', label: 'R3' } as unknown as import('../../engine/schema/resourceSchema').EngineResource],
  ])

  it('drops typo\'d / removed ids before strategy runs', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Mixed', memberIds: ['ghost', 'r1', 'r3'],
      strategy: 'first-available',
    }
    const result = resolvePool({
      pool, proposed, events: [], rules: [],
      resources: knownResources, strictMembers: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('r1')
      expect(result.evaluated).toEqual(['r1']) // ghost never appears
    }
  })

  it('returns POOL_EMPTY when every id is unknown under strictMembers', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'AllGhost', memberIds: ['gone', 'also-gone'],
      strategy: 'first-available',
    }
    const result = resolvePool({
      pool, proposed, events: [], rules: [],
      resources: knownResources, strictMembers: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('POOL_EMPTY')
  })

  it('passes through unknown ids without strictMembers (default behavior)', () => {
    // Documents the historical contract: unknown ids are *not*
    // filtered by default; the resolver tries them and a
    // first-available strategy will commit one as the winner.
    const pool: ResourcePool = {
      id: 'p', name: 'Mixed', memberIds: ['ghost', 'r1'],
      strategy: 'first-available',
    }
    const result = resolvePool({
      pool, proposed, events: [], rules: [], resources: knownResources,
    })
    expect(result.ok && result.resourceId).toBe('ghost')
  })

  it('throws when strictMembers is set without a resources registry', () => {
    // Silent fallback to "all members ok" would defeat the whole
    // point of strict mode — the resolver must surface the
    // misconfiguration loudly so a missing arg can't reintroduce
    // the ghost-assignment risk.
    const pool: ResourcePool = {
      id: 'p', name: 'NoRegistry', memberIds: ['r1'],
      strategy: 'first-available',
    }
    expect(() => resolvePool({
      pool, proposed, events: [], rules: [], strictMembers: true,
    })).toThrow(/strictMembers/)
  })

  it('rebases round-robin candidates so unknown ids are skipped without losing rotation', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Rotation', memberIds: ['r1', 'ghost', 'r3'],
      strategy: 'round-robin', rrCursor: 0,
    }
    const result = resolvePool({
      pool, proposed, events: [], rules: [],
      resources: knownResources, strictMembers: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('r3')        // skip ghost, advance to r3
      expect(result.rrCursor).toBe(2)              // cursor anchored to original list
    }
  })
})

describe('resolvePool — v2 query pools (#386)', () => {
  // Build a registry where capabilities + capacity vary per resource
  // so query filters have something meaningful to chew on.
  type R = import('../../engine/schema/resourceSchema').EngineResource
  const reefer80 = { id: 't1', name: 'T1', meta: { type: 'vehicle', capabilities: { refrigerated: true,  capacity_lbs: 80000 } } } as unknown as R
  const reefer60 = { id: 't2', name: 'T2', meta: { type: 'vehicle', capabilities: { refrigerated: true,  capacity_lbs: 60000 } } } as unknown as R
  const dry80    = { id: 't3', name: 'T3', meta: { type: 'vehicle', capabilities: { refrigerated: false, capacity_lbs: 80000 } } } as unknown as R
  const driver   = { id: 'd1', name: 'D1', meta: { type: 'person',  capabilities: { cdl: true } } } as unknown as R
  const registry = new Map<string, R>([reefer80, reefer60, dry80, driver].map(r => [r.id, r]))

  const reefer80kQuery = {
    op: 'and' as const,
    clauses: [
      { op: 'eq'  as const, path: 'type',                      value:  'vehicle' },
      { op: 'eq'  as const, path: 'capabilities.refrigerated', value:  true },
      { op: 'gte' as const, path: 'capabilities.capacity_lbs', value:  80000 },
    ],
  }

  it('query pools resolve against the live registry, not memberIds', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'NearbyReefers', type: 'query',
      memberIds: [],          // intentionally empty: query is the source
      query: reefer80kQuery,
      strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [], resources: registry })
    expect(result.ok && result.resourceId).toBe('t1')
    if (result.ok) {
      expect(result.evaluated).toEqual(['t1'])
      expect(result.queryExcluded?.map(x => x.id).sort()).toEqual(['d1', 't2', 't3'])
    }
  })

  it('hybrid pools intersect memberIds with the query result', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'OurReefers', type: 'hybrid',
      memberIds: ['t2', 't3'],         // both in the curated list, neither match query
      query: reefer80kQuery,
      strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [], resources: registry })
    // t1 matches the query but isn't in memberIds → excluded.
    // t2 is in memberIds but capacity is too low → excluded.
    // t3 is in memberIds but isn't refrigerated → excluded.
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('POOL_EMPTY')
      // Query exclusion trail still surfaces so the host can render
      // "matched 1 resource but it isn't in your fleet" UX.
      expect(result.queryExcluded).toBeDefined()
    }
  })

  it('hybrid pools succeed when the intersection is non-empty', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'PrimaryReefers', type: 'hybrid',
      memberIds: ['t1', 't2'],         // t1 matches query, t2 doesn't
      query: reefer80kQuery,
      strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [], resources: registry })
    expect(result.ok && result.resourceId).toBe('t1')
  })

  it('query pools support round-robin with cursor anchored to the matched array', () => {
    // All three vehicles match a relaxed query; round-robin should
    // rotate through them in registry order regardless of memberIds.
    const allVehicles = { op: 'eq' as const, path: 'type', value: 'vehicle' }
    const pool: ResourcePool = {
      id: 'p', name: 'AnyTruck', type: 'query', memberIds: [],
      query: allVehicles, strategy: 'round-robin',
    }
    const r1 = resolvePool({ pool, proposed, events: [], rules: [], resources: registry })
    expect(r1.ok && r1.resourceId).toBe('t1')
    if (r1.ok) expect(r1.rrCursor).toBe(0)

    const next = resolvePool({
      pool: { ...pool, rrCursor: 0 },
      proposed, events: [], rules: [], resources: registry,
    })
    expect(next.ok && next.resourceId).toBe('t2')
  })

  it('query pools without a registry are a programmer error', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'NoRegistry', type: 'query', memberIds: [],
      query: reefer80kQuery, strategy: 'first-available',
    }
    expect(() => resolvePool({ pool, proposed, events: [], rules: [] }))
      .toThrow(/`resources` registry/)
  })

  it('query/hybrid pools without a query are a programmer error', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'TypedNoQuery', type: 'query', memberIds: [],
      strategy: 'first-available',
    }
    expect(() => resolvePool({ pool, proposed, events: [], rules: [], resources: registry }))
      .toThrow(/no query/)
  })

  it('an empty query result yields POOL_EMPTY plus the explanation trail', () => {
    const impossible = { op: 'eq' as const, path: 'type', value: 'helicopter' }
    const pool: ResourcePool = {
      id: 'p', name: 'NoneMatch', type: 'query', memberIds: [],
      query: impossible, strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [], resources: registry })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('POOL_EMPTY')
      // The trail names every registry resource that failed, with
      // the failed clause path — that's the readiness explainability.
      expect(result.queryExcluded?.length).toBe(registry.size)
    }
  })

  it('manual pools are unaffected by the v2 plumbing (no queryExcluded surfaced)', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Legacy', memberIds: ['t1', 't2'],
      strategy: 'first-available',
    }
    const result = resolvePool({ pool, proposed, events: [], rules: [] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resourceId).toBe('t1')
      expect(result.queryExcluded).toBeUndefined()
    }
  })
})

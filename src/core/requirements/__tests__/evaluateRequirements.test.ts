/**
 * `evaluateRequirements` — runtime consumer for the
 * `CalendarConfig.requirements` templates (#386).
 */
import { describe, it, expect } from 'vitest'
import { evaluateRequirements } from '../evaluateRequirements'
import type { ConfigRequirement } from '../../config/calendarConfig'
import type { Assignment } from '../../engine/schema/assignmentSchema'
import type { EngineEvent } from '../../engine/schema/eventSchema'
import type { EngineResource } from '../../engine/schema/resourceSchema'
import type { ResourcePool } from '../../pools/resourcePoolSchema'

const r = (id: string, meta: Record<string, unknown> = {}): EngineResource =>
  ({ id, name: id.toUpperCase(), meta } as EngineResource)

const a = (id: string, eventId: string, resourceId: string): Assignment =>
  ({ id, eventId, resourceId, units: 100 })

const mapBy = <T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> =>
  new Map(items.map(x => [x.id, x] as const))

const event = (id: string, category: string | null): Pick<EngineEvent, 'id' | 'category'> => ({ id, category })

describe('evaluateRequirements — no template / no category', () => {
  it('reports satisfied + noTemplate when event.category is null', () => {
    const out = evaluateRequirements({
      event: event('e1', null),
      requirements: [],
      resources: new Map(),
      assignments: new Map(),
    })
    expect(out).toEqual({ satisfied: true, missing: [], noTemplate: true })
  })

  it('reports satisfied + noTemplate when no template matches the category', () => {
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'maintenance', requires: [{ role: 'tech', count: 1 }] }],
      resources: new Map(),
      assignments: new Map(),
    })
    expect(out).toEqual({ satisfied: true, missing: [], noTemplate: true })
  })
})

describe('evaluateRequirements — role slots', () => {
  const requirements: ConfigRequirement[] = [
    { eventType: 'load', requires: [{ role: 'driver', count: 2 }] },
  ]
  const resources = mapBy([
    r('alice', { roles: ['driver'] }),
    r('bob',   { roles: ['driver', 'dispatcher'] }),
    r('carol', { roles: ['dispatcher'] }),
    r('truck', { /* no roles meta */ }),
  ])

  it('counts assignments whose resource is tagged with the required role', () => {
    const assignments = mapBy([a('a1', 'e1', 'alice'), a('a2', 'e1', 'bob')])
    const out = evaluateRequirements({ event: event('e1', 'load'), requirements, resources, assignments })
    expect(out.satisfied).toBe(true)
    expect(out.missing).toEqual([])
  })

  it('reports a role shortfall with the correct missing count', () => {
    const assignments = mapBy([a('a1', 'e1', 'alice')])
    const out = evaluateRequirements({ event: event('e1', 'load'), requirements, resources, assignments })
    expect(out.satisfied).toBe(false)
    expect(out.missing).toEqual([{ kind: 'role', role: 'driver', required: 2, assigned: 1, missing: 1 }])
  })

  it('ignores assignments to other events', () => {
    const assignments = mapBy([
      a('a1', 'e1', 'alice'),
      a('a2', 'e2', 'bob'),     // different event
    ])
    const out = evaluateRequirements({ event: event('e1', 'load'), requirements, resources, assignments })
    expect(out.satisfied).toBe(false)
    expect(out.missing[0]?.assigned).toBe(1)
  })

  it('ignores resources without a roles tag (driver requires the meta)', () => {
    const assignments = mapBy([a('a1', 'e1', 'truck')])  // no roles meta
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ role: 'driver', count: 1 }] }],
      resources, assignments,
    })
    expect(out.satisfied).toBe(false)
    expect(out.missing[0]?.assigned).toBe(0)
  })

  it('counts resources tagged with multiple roles toward each matching slot', () => {
    // Bob is both driver + dispatcher. The event needs 1 of each;
    // a single Bob assignment satisfies both slots.
    const assignments = mapBy([a('a1', 'e1', 'bob')])
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver', count: 1 },
          { role: 'dispatcher', count: 1 },
        ],
      }],
      resources, assignments,
    })
    expect(out.satisfied).toBe(true)
  })
})

describe('evaluateRequirements — pool slots', () => {
  const truck = (id: string, refrigerated = false) =>
    r(id, { type: 'vehicle', capabilities: { refrigerated } })

  const resources = mapBy([
    truck('t1'),
    truck('t2'),
    truck('reefer-1', true),
    truck('reefer-2', true),
  ])

  const fleetPool: ResourcePool = {
    id: 'fleet', name: 'Fleet',
    memberIds: ['t1', 't2'],
    strategy: 'first-available',
  }
  const reeferPool: ResourcePool = {
    id: 'reefers', name: 'Reefers',
    type: 'query', memberIds: [],
    query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
    strategy: 'first-available',
  }

  it('counts assignments whose resource is in the manual pool', () => {
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'fleet', count: 1 }] }],
      resources,
      pools: mapBy([fleetPool]),
      assignments: mapBy([a('a1', 'e1', 't1')]),
    })
    expect(out.satisfied).toBe(true)
  })

  it('reports a shortfall with required / assigned / missing counts', () => {
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'fleet', count: 2 }] }],
      resources,
      pools: mapBy([fleetPool]),
      assignments: mapBy([a('a1', 'e1', 't1')]),
    })
    expect(out.satisfied).toBe(false)
    expect(out.missing).toEqual([{ kind: 'pool', pool: 'fleet', required: 2, assigned: 1, missing: 1 }])
  })

  it('runs the query for query pools', () => {
    // Two reefer assignments → query pool requirement of 2 is met
    // even though `memberIds: []` would say "no members" if we only
    // looked there.
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'reefers', count: 2 }] }],
      resources,
      pools: mapBy([reeferPool]),
      assignments: mapBy([
        a('a1', 'e1', 'reefer-1'),
        a('a2', 'e1', 'reefer-2'),
      ]),
    })
    expect(out.satisfied).toBe(true)
  })

  it('intersects memberIds with the query for hybrid pools', () => {
    const hybrid: ResourcePool = {
      id: 'curated-reefers', name: 'Curated Reefers',
      type: 'hybrid', memberIds: ['reefer-1'],     // only one curated
      query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
      strategy: 'first-available',
    }
    // reefer-2 matches the query but isn't in memberIds → doesn't
    // count toward the hybrid pool slot.
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'curated-reefers', count: 1 }] }],
      resources,
      pools: mapBy([hybrid]),
      assignments: mapBy([a('a1', 'e1', 'reefer-2')]),
    })
    expect(out.satisfied).toBe(false)
    expect(out.missing[0]?.assigned).toBe(0)
  })

  it('flags poolUnknown when the slot references a pool not in the map', () => {
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'ghost', count: 1 }] }],
      resources,
      pools: mapBy([fleetPool]),
      assignments: new Map(),
    })
    expect(out.satisfied).toBe(false)
    expect(out.missing[0]).toMatchObject({ kind: 'pool', pool: 'ghost', poolUnknown: true, assigned: 0 })
  })

  it('treats a query/hybrid pool with no query as zero members (defensive)', () => {
    const broken: ResourcePool = {
      id: 'broken', name: 'Broken',
      type: 'query', memberIds: [],
      strategy: 'first-available',
      // no query — parseConfig drops these at load time, but a host
      // that constructs runtime pools directly might still hand one in.
    }
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'broken', count: 1 }] }],
      resources,
      pools: mapBy([broken]),
      assignments: mapBy([a('a1', 'e1', 't1')]),  // assignment exists, but pool has no members
    })
    expect(out.satisfied).toBe(false)
    expect(out.missing[0]?.assigned).toBe(0)
  })
})

describe('evaluateRequirements — mixed slots', () => {
  it('reports every shortfall in input order', () => {
    const resources = mapBy([
      r('alice', { roles: ['driver'] }),
      r('truck', {}),
    ])
    const pool: ResourcePool = {
      id: 'fleet', name: 'Fleet', memberIds: ['truck'], strategy: 'first-available',
    }
    const out = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver', count: 2 },
          { pool: 'fleet',  count: 2 },
        ],
      }],
      resources,
      pools: mapBy([pool]),
      assignments: mapBy([a('a1', 'e1', 'alice'), a('a2', 'e1', 'truck')]),
    })
    expect(out.satisfied).toBe(false)
    expect(out.missing).toEqual([
      { kind: 'role', role: 'driver', required: 2, assigned: 1, missing: 1 },
      { kind: 'pool', pool: 'fleet',  required: 2, assigned: 1, missing: 1 },
    ])
  })
})

describe('evaluateRequirements — proposedLocation passthrough', () => {
  it('feeds proposedLocation into evaluateQuery so distance pools resolve', () => {
    const SLC = { lat: 40.7608, lon: -111.8910 }
    const reefer = (id: string, lat: number, lon: number) =>
      r(id, { capabilities: { refrigerated: true }, location: { lat, lon } })
    const resources = mapBy([
      reefer('near', SLC.lat, SLC.lon),
      reefer('far',  37.6189, -122.3750),  // SFO — ~600 mi away
    ])
    const pool: ResourcePool = {
      id: 'nearby', name: 'Nearby Reefers', type: 'query', memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'eq',     path: 'meta.capabilities.refrigerated', value: true },
          { op: 'within', path: 'meta.location', from: { kind: 'proposed' }, miles: 50 },
        ],
      },
      strategy: 'first-available',
    }
    // Without proposedLocation, the within(proposed) clause fails-closed
    // and no resource matches → assigning 'near' doesn't satisfy the slot.
    const withoutLoc = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'nearby', count: 1 }] }],
      resources,
      pools: mapBy([pool]),
      assignments: mapBy([a('a1', 'e1', 'near')]),
    })
    expect(withoutLoc.satisfied).toBe(false)
    // With proposedLocation, the same data resolves correctly.
    const withLoc = evaluateRequirements({
      event: event('e1', 'load'),
      requirements: [{ eventType: 'load', requires: [{ pool: 'nearby', count: 1 }] }],
      resources,
      pools: mapBy([pool]),
      assignments: mapBy([a('a1', 'e1', 'near')]),
      proposedLocation: SLC,
    })
    expect(withLoc.satisfied).toBe(true)
  })
})

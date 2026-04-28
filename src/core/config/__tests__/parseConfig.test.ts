/**
 * `parseConfig` — defensive unmarshalling for the standard
 * config.json shape (#386 wizard).
 */
import { describe, it, expect } from 'vitest'
import { parseConfig } from '../parseConfig'

describe('parseConfig — root shape', () => {
  it('returns an empty config + a single error for non-object roots', () => {
    expect(parseConfig(null)).toEqual({ config: {}, errors: ['root: expected an object'], dropped: 0 })
    expect(parseConfig([])).toEqual({ config: {}, errors: ['root: expected an object'], dropped: 0 })
    expect(parseConfig(7)).toEqual({ config: {}, errors: ['root: expected an object'], dropped: 0 })
    expect(parseConfig(undefined)).toEqual({ config: {}, errors: ['root: expected an object'], dropped: 0 })
  })

  it('accepts an empty object as a valid (empty) config', () => {
    expect(parseConfig({})).toEqual({ config: {}, errors: [], dropped: 0 })
  })

  it('reads profile when it is a string', () => {
    const r = parseConfig({ profile: 'trucking' })
    expect(r.config.profile).toBe('trucking')
    expect(r.errors).toEqual([])
  })

  it('logs an error for non-string profile', () => {
    const r = parseConfig({ profile: 42 })
    expect(r.config.profile).toBeUndefined()
    expect(r.errors).toContain('profile: expected string, ignoring')
  })
})

describe('parseConfig — labels', () => {
  it('keeps known and unknown string keys, drops non-string values', () => {
    const r = parseConfig({
      labels: { resource: 'Truck', event: 'Load', custom: 'X', bogus: 5 },
    })
    expect(r.config.labels).toEqual({ resource: 'Truck', event: 'Load', custom: 'X' })
    expect(r.errors).toContain('labels.bogus: expected string, ignoring')
  })

  it('rejects a non-object labels block', () => {
    const r = parseConfig({ labels: 'oops' })
    expect(r.config.labels).toBeUndefined()
    expect(r.errors).toContain('labels: expected object, ignoring')
  })
})

describe('parseConfig — resourceTypes / roles', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const r = parseConfig({
      resourceTypes: [
        { id: 'vehicle', label: 'Truck' },
        { id: 'person',  label: 'Driver' },
        { id: 'broken' }, // missing label
        'wrong shape',
      ],
    })
    expect(r.config.resourceTypes).toEqual([
      { id: 'vehicle', label: 'Truck' },
      { id: 'person',  label: 'Driver' },
    ])
    expect(r.dropped).toBe(2)
    expect(r.errors).toContain('resourceTypes[2]: expected { id: string, label: string }, dropping')
  })

  it('logs an error and yields [] when the section is not an array', () => {
    const r = parseConfig({ roles: { drivers: [] } })
    expect(r.config.roles).toEqual([])
    expect(r.errors).toContain('roles: expected array, ignoring')
  })
})

describe('parseConfig — resources', () => {
  it('preserves type, capabilities, and location when present', () => {
    const r = parseConfig({
      resources: [
        {
          id: 't1', name: 'Truck 1', type: 'vehicle',
          capabilities: { refrigerated: true, capacity_lbs: 80000 },
          location: { lat: 40.76, lon: -111.89 },
          meta: { vin: 'XYZ' },
        },
      ],
    })
    expect(r.config.resources).toEqual([{
      id: 't1', name: 'Truck 1', type: 'vehicle',
      capabilities: { refrigerated: true, capacity_lbs: 80000 },
      location: { lat: 40.76, lon: -111.89 },
      meta: { vin: 'XYZ' },
    }])
  })

  it('drops malformed coordinate objects rather than letting them through', () => {
    const r = parseConfig({
      resources: [
        { id: 't1', name: 'T1', location: { lat: 40.76, lon: 'oops' } },
      ],
    })
    expect(r.config.resources![0]!.location).toBeUndefined()
    expect(r.dropped).toBe(0) // the resource itself stays; just the bad coord is ignored
  })

  it('drops resources missing id or name', () => {
    const r = parseConfig({
      resources: [
        { id: 't1' },                       // missing name
        { name: 'NoId' },                   // missing id
        { id: 't2', name: 'T2' },
      ],
    })
    expect(r.config.resources!.map(x => x.id)).toEqual(['t2'])
    expect(r.dropped).toBe(2)
  })
})

describe('parseConfig — pools', () => {
  it('round-trips a query pool with strategy + type + query', () => {
    const r = parseConfig({
      pools: [{
        id: 'reefers', name: 'Reefers', type: 'query', memberIds: [],
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'closest',
      }],
    })
    expect(r.config.pools![0]).toEqual({
      id: 'reefers', name: 'Reefers', type: 'query', memberIds: [],
      query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
      strategy: 'closest',
    })
  })

  it('drops pools with an invalid strategy', () => {
    const r = parseConfig({
      pools: [{ id: 'p', name: 'P', memberIds: ['x'], strategy: 'first-came' }],
    })
    expect(r.config.pools).toEqual([])
    expect(r.dropped).toBe(1)
  })

  it('ignores an unknown type but keeps the pool with the rest of its fields', () => {
    const r = parseConfig({
      pools: [{ id: 'p', name: 'P', memberIds: ['x'], strategy: 'round-robin', type: 'graphql' }],
    })
    expect(r.config.pools![0]).toEqual({
      id: 'p', name: 'P', memberIds: ['x'], strategy: 'round-robin',
    })
    expect(r.errors.some(e => e.includes('type'))).toBe(true)
  })

  it('drops query/hybrid pools that omit `query` (defensive contract)', () => {
    // Accepting these would let resolvePool throw at runtime — which
    // is exactly what the defensive parse contract is meant to prevent.
    const r = parseConfig({
      pools: [
        { id: 'q',  name: 'Q',  memberIds: [],    strategy: 'first-available', type: 'query' },
        { id: 'h',  name: 'H',  memberIds: ['x'], strategy: 'first-available', type: 'hybrid' },
        { id: 'ok', name: 'OK', memberIds: [],    strategy: 'first-available',
          type: 'query',
          query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true } },
      ],
    })
    expect(r.config.pools!.map(p => p.id)).toEqual(['ok'])
    expect(r.dropped).toBe(2)
    expect(r.errors.some(e => e.includes('type "query" requires a query'))).toBe(true)
    expect(r.errors.some(e => e.includes('type "hybrid" requires a query'))).toBe(true)
  })
})

describe('parseConfig — requirements', () => {
  it('parses role and pool slots with counts', () => {
    const r = parseConfig({
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver', count: 1 },
          { pool: 'any_truck', count: 1 },
        ],
      }],
    })
    expect(r.config.requirements).toEqual([{
      eventType: 'load',
      requires: [
        { role: 'driver', count: 1 },
        { pool: 'any_truck', count: 1 },
      ],
    }])
  })

  it('drops the whole requirement when every slot is malformed', () => {
    const r = parseConfig({
      requirements: [{
        eventType: 'load',
        requires: [{ broken: true }],
      }],
    })
    expect(r.config.requirements).toEqual([])
    expect(r.dropped).toBe(1)
  })

  it('keeps valid slots and drops just the malformed ones when mixed', () => {
    const r = parseConfig({
      requirements: [{
        eventType: 'load',
        requires: [{ role: 'driver', count: 1 }, { broken: true }],
      }],
    })
    expect(r.config.requirements![0]!.requires).toEqual([{ role: 'driver', count: 1 }])
    expect(r.errors.some(e => e.includes('requires[1]'))).toBe(true)
  })
  it('round-trips slot severity (#450)', () => {
    const r = parseConfig({
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver',     count: 1, severity: 'hard' },
          { pool: 'note-taker', count: 1, severity: 'soft' },
        ],
      }],
    })
    expect(r.config.requirements).toEqual([{
      eventType: 'load',
      requires: [
        { role: 'driver',     count: 1, severity: 'hard' },
        { pool: 'note-taker', count: 1, severity: 'soft' },
      ],
    }])
  })

  it('ignores an unknown severity value while keeping the slot', () => {
    const r = parseConfig({
      requirements: [{
        eventType: 'load',
        requires: [{ role: 'driver', count: 1, severity: 'maybe' }],
      }],
    })
    // Slot survives; severity is dropped (treated as default 'hard' by the engine).
    expect(r.config.requirements?.[0]?.requires).toEqual([{ role: 'driver', count: 1 }])
    expect(r.errors.some(e => e.includes('severity'))).toBe(true)
  })
})

describe('parseConfig — events (seed)', () => {
  it('keeps id/title/start/end and the optional resource hooks', () => {
    const r = parseConfig({
      events: [{
        id: 'e1', title: 'Run', start: '2026-04-20T09:00:00Z', end: '2026-04-20T10:00:00Z',
        resourcePoolId: 'pool-1',
      }],
    })
    expect(r.config.events![0]).toEqual({
      id: 'e1', title: 'Run', start: '2026-04-20T09:00:00Z', end: '2026-04-20T10:00:00Z',
      resourcePoolId: 'pool-1',
    })
  })

  it('drops events missing any of the required string fields', () => {
    const r = parseConfig({
      events: [
        { id: 'e1', title: 'OK',   start: '2026-04-20', end: '2026-04-21' },
        { id: 'e2', title: 'Bad' /* no start/end */ },
      ],
    })
    expect(r.config.events!.length).toBe(1)
    expect(r.dropped).toBe(1)
  })
})

describe('parseConfig — settings', () => {
  it('whitelists the conflictMode values', () => {
    expect(parseConfig({ settings: { conflictMode: 'block' } }).config.settings).toEqual({ conflictMode: 'block' })
    expect(parseConfig({ settings: { conflictMode: 'soft'  } }).config.settings).toEqual({ conflictMode: 'soft' })
    expect(parseConfig({ settings: { conflictMode: 'off'   } }).config.settings).toEqual({ conflictMode: 'off' })

    const bad = parseConfig({ settings: { conflictMode: 'maybe' } })
    expect(bad.config.settings).toEqual({})
    expect(bad.errors.some(e => e.includes('conflictMode'))).toBe(true)
  })

  it('keeps a string timezone', () => {
    const r = parseConfig({ settings: { timezone: 'America/Denver' } })
    expect(r.config.settings).toEqual({ timezone: 'America/Denver' })
  })
})

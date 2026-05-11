/**
 * `serializeConfig` + round-trip via `parseConfig` (#386 wizard).
 */
import { describe, it, expect } from 'vitest'
import { serializeConfig } from '../serializeConfig'
import { parseConfig } from '../parseConfig'
import type { CalendarConfig } from '../calendarConfig'

describe('serializeConfig — section omission', () => {
  it('emits an empty object for an empty config (no noisy stubs)', () => {
    expect(serializeConfig({})).toEqual({})
  })

  it('omits each missing section rather than emitting empty arrays', () => {
    const out = serializeConfig({ profile: 'trucking' })
    expect(out).toEqual({ profile: 'trucking' })
    // Spot-check that no section keys leaked through.
    expect(Object.keys(out)).toEqual(['profile'])
  })
})

describe('serializeConfig — section shapes', () => {
  it('serializes labels as a plain string map', () => {
    expect(serializeConfig({
      labels: { resource: 'Truck', event: 'Load' },
    })).toEqual({ labels: { resource: 'Truck', event: 'Load' } })
  })

  it('serializes resources with all optional fields when present', () => {
    const out = serializeConfig({
      resources: [{
        id: 't1', name: 'Truck 1', type: 'vehicle',
        capabilities: { refrigerated: true, capacity_lbs: 80000 },
        location: { lat: 40.76, lon: -111.89 },
        meta: { vin: 'XYZ' },
      }],
    })
    expect(out).toEqual({
      resources: [{
        id: 't1', name: 'Truck 1', type: 'vehicle',
        capabilities: { refrigerated: true, capacity_lbs: 80000 },
        location: { lat: 40.76, lon: -111.89 },
        meta: { vin: 'XYZ' },
      }],
    })
  })

  it('serializes pools with strategy + type + query in a single pass', () => {
    expect(serializeConfig({
      pools: [{
        id: 'reefers', name: 'Reefers', type: 'query', memberIds: [],
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'closest',
      }],
    })).toEqual({
      pools: [{
        id: 'reefers', name: 'Reefers', type: 'query', memberIds: [],
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'closest',
      }],
    })
  })

  it('discriminates role vs. pool slots in requirements', () => {
    expect(serializeConfig({
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver',    count: 1 },
          { pool: 'any_truck', count: 1 },
        ],
      }],
    })).toEqual({
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver',    count: 1 },
          { pool: 'any_truck', count: 1 },
        ],
      }],
    })
  })
})

describe('serializeConfig — branch coverage', () => {
  it('filters non-string values from labels (serializeLabels FALSE branch)', () => {
    const out = serializeConfig({ labels: { resource: 'Truck', badKey: 42 as any } })
    expect(out['labels']).toEqual({ resource: 'Truck' })
    expect((out['labels'] as any)['badKey']).toBeUndefined()
  })

  it('serializes pool with rrCursor and disabled fields', () => {
    const out = serializeConfig({
      pools: [{
        id: 'p', name: 'Pool', memberIds: ['a', 'b'],
        strategy: 'round-robin', rrCursor: 1, disabled: true,
      }],
    })
    const pool = (out['pools'] as any[])[0]
    expect(pool.rrCursor).toBe(1)
    expect(pool.disabled).toBe(true)
  })

  it('includes severity on requirement slots that specify one', () => {
    const out = serializeConfig({
      requirements: [{
        eventType: 'load',
        requires: [{ role: 'driver', count: 1, severity: 'soft' }],
      }],
    })
    const slot = (out['requirements'] as any[])[0].requires[0]
    expect(slot.severity).toBe('soft')
  })

  it('serializes seed events: eventType absent, resourceId present, meta present', () => {
    const out = serializeConfig({
      events: [
        { id: 'e1', title: 'Run', start: '2026-04-20T09:00Z', end: '2026-04-20T10:00Z',
          resourceId: 'truck-1', meta: { priority: 'high' } },
        { id: 'e2', title: 'Idle', start: '2026-04-21T09:00Z', end: '2026-04-21T10:00Z' },
      ],
    })
    const events = out['events'] as any[]
    expect(events[0].resourceId).toBe('truck-1')
    expect(events[0].meta).toEqual({ priority: 'high' })
    expect(events[0].eventType).toBeUndefined()
    expect(events[1].resourceId).toBeUndefined()
    expect(events[1].meta).toBeUndefined()
  })
})

describe('serializeConfig + parseConfig — round-trip', () => {
  it('round-trips a fully populated config losslessly', () => {
    const config: CalendarConfig = {
      profile: 'trucking',
      labels: { resource: 'Truck', event: 'Load', location: 'Depot' },
      resourceTypes: [
        { id: 'vehicle', label: 'Truck' },
        { id: 'person',  label: 'Driver' },
      ],
      roles: [
        { id: 'driver',     label: 'Driver' },
        { id: 'dispatcher', label: 'Dispatcher' },
      ],
      resources: [
        {
          id: 't1', name: 'Truck 101', type: 'vehicle',
          capabilities: { refrigerated: true, capacity_lbs: 80000 },
          location: { lat: 40.7608, lon: -111.8910 },
          meta: { vin: 'XYZ' },
        },
      ],
      pools: [
        {
          id: 'nearby_reefers', name: 'Nearby Reefers',
          type: 'query', memberIds: [],
          query: {
            op: 'and',
            clauses: [
              { op: 'eq',     path: 'meta.capabilities.refrigerated', value: true },
              { op: 'within', path: 'meta.location', from: { kind: 'proposed' }, miles: 50 },
            ],
          },
          strategy: 'closest',
        },
      ],
      requirements: [
        {
          eventType: 'load',
          requires: [
            { role: 'driver',           count: 1 },
            { pool: 'nearby_reefers',   count: 1 },
          ],
        },
      ],
      events: [
        {
          id: 'e1', title: 'SLC → Denver',
          start: '2026-04-20T09:00:00Z',
          end:   '2026-04-20T18:00:00Z',
          eventType: 'load',
          resourcePoolId: 'nearby_reefers',
        },
      ],
      settings: { conflictMode: 'block', timezone: 'America/Denver' },
    }

    const wire = serializeConfig(config)
    const json = JSON.parse(JSON.stringify(wire))
    const round = parseConfig(json)

    expect(round.errors).toEqual([])
    expect(round.dropped).toBe(0)
    expect(round.config).toEqual(config)
  })

  it('round-trips an empty config without losing or inventing fields', () => {
    const round = parseConfig(serializeConfig({}))
    expect(round.config).toEqual({})
    expect(round.errors).toEqual([])
  })
})

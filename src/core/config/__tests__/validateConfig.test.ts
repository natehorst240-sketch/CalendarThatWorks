/**
 * `validateConfig` — cross-section integrity checks (#386).
 */
import { describe, it, expect } from 'vitest'
import { validateConfig } from '../validateConfig'
import type { CalendarConfig } from '../calendarConfig'

describe('validateConfig — empty + clean', () => {
  it('accepts an empty config', () => {
    expect(validateConfig({})).toEqual({ ok: true, issues: [] })
  })

  it('accepts a fully-populated, internally-consistent config', () => {
    const config: CalendarConfig = {
      profile: 'trucking',
      labels: { resource: 'Truck' },
      resourceTypes: [{ id: 'vehicle', label: 'Truck' }],
      roles:         [{ id: 'driver',  label: 'Driver' }],
      resources: [
        { id: 't1', name: 'Truck 1', type: 'vehicle' },
        { id: 't2', name: 'Truck 2', type: 'vehicle' },
      ],
      pools: [{
        id: 'fleet', name: 'Fleet', memberIds: ['t1', 't2'],
        strategy: 'first-available',
      }],
      requirements: [{
        eventType: 'load',
        requires: [
          { role: 'driver', count: 1 },
          { pool: 'fleet',  count: 1 },
        ],
      }],
      events: [{
        id: 'e1', title: 'Run', start: '2026-04-20T09:00:00Z', end: '2026-04-20T18:00:00Z',
        eventType: 'load',
        resourcePoolId: 'fleet',
      }],
      settings: { conflictMode: 'block', timezone: 'America/Denver' },
    }
    expect(validateConfig(config)).toEqual({ ok: true, issues: [] })
  })
})

describe('validateConfig — resources', () => {
  it('flags resources with an unknown type id', () => {
    const r = validateConfig({
      resourceTypes: [{ id: 'vehicle', label: 'Truck' }],
      resources:     [{ id: 't1', name: 'Truck 1', type: 'aircraft' }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual([{
      severity: 'error',
      kind: 'unknown-resource-type',
      section: 'resources',
      path: 'resources[0].type',
      resourceId: 't1',
      typeId: 'aircraft',
    }])
  })

  it('skips the check when type is omitted', () => {
    const r = validateConfig({
      resourceTypes: [{ id: 'vehicle', label: 'Truck' }],
      resources:     [{ id: 't1', name: 'Truck 1' }],   // no type
    })
    expect(r.ok).toBe(true)
  })
})

describe('validateConfig — pools', () => {
  it('flags pool members not in the resource registry', () => {
    const r = validateConfig({
      resources: [{ id: 't1', name: 'T1' }],
      pools: [{ id: 'fleet', name: 'Fleet', memberIds: ['t1', 'ghost'], strategy: 'first-available' }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual([{
      severity: 'error',
      kind: 'unknown-pool-member',
      section: 'pools',
      path: 'pools[0].memberIds[1]',
      poolId: 'fleet',
      memberId: 'ghost',
    }])
  })

  it('reports each unknown member separately, in order', () => {
    const r = validateConfig({
      resources: [{ id: 't1', name: 'T1' }],
      pools: [{ id: 'fleet', name: 'Fleet', memberIds: ['ghost-a', 't1', 'ghost-b'], strategy: 'first-available' }],
    })
    expect(r.issues.map(i => i.kind === 'unknown-pool-member' ? i.memberId : null))
      .toEqual(['ghost-a', 'ghost-b'])
  })
})

describe('validateConfig — requirements', () => {
  it('flags unknown role references', () => {
    const r = validateConfig({
      roles: [{ id: 'driver', label: 'Driver' }],
      requirements: [{
        eventType: 'load',
        requires: [{ role: 'pilot', count: 1 }],
      }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues[0]).toEqual({
      severity: 'error',
      kind: 'unknown-requirement-role',
      section: 'requirements',
      path: 'requirements[0].requires[0].role',
      eventType: 'load',
      roleId: 'pilot',
    })
  })

  it('flags unknown pool references', () => {
    const r = validateConfig({
      pools: [{ id: 'fleet', name: 'Fleet', memberIds: [], strategy: 'first-available' }],
      requirements: [{
        eventType: 'load',
        requires: [{ pool: 'aircraft', count: 1 }],
      }],
    })
    expect(r.issues[0]).toMatchObject({
      kind: 'unknown-requirement-pool',
      poolId: 'aircraft',
      eventType: 'load',
    })
  })

  it('walks every slot of every requirement (mixed kinds + indices)', () => {
    const r = validateConfig({
      roles: [{ id: 'driver', label: 'Driver' }],
      pools: [{ id: 'fleet',  name: 'Fleet', memberIds: [], strategy: 'first-available' }],
      requirements: [
        {
          eventType: 'load',
          requires: [
            { role: 'driver',   count: 1 },   // ok
            { role: 'pilot',    count: 1 },   // ❌
            { pool: 'fleet',    count: 1 },   // ok
            { pool: 'aircraft', count: 1 },   // ❌
          ],
        },
      ],
    })
    expect(r.issues.map(i => i.path)).toEqual([
      'requirements[0].requires[1].role',
      'requirements[0].requires[3].pool',
    ])
  })
})

describe('validateConfig — events', () => {
  it('flags events whose resourceId is unknown', () => {
    const r = validateConfig({
      resources: [{ id: 't1', name: 'T1' }],
      events: [{ id: 'e1', title: 'X', start: '2026-04-20T09:00:00Z', end: '2026-04-20T10:00:00Z', resourceId: 'ghost' }],
    })
    expect(r.issues[0]).toMatchObject({ kind: 'unknown-event-resource', resourceId: 'ghost', eventId: 'e1' })
  })

  it('flags events whose resourcePoolId is unknown', () => {
    const r = validateConfig({
      pools: [{ id: 'fleet', name: 'Fleet', memberIds: [], strategy: 'first-available' }],
      events: [{ id: 'e1', title: 'X', start: '2026-04-20T09:00:00Z', end: '2026-04-20T10:00:00Z', resourcePoolId: 'ghost' }],
    })
    expect(r.issues[0]).toMatchObject({ kind: 'unknown-event-pool', poolId: 'ghost', eventId: 'e1' })
  })

  it('does not flag events that omit both resource hooks (drafts are valid)', () => {
    expect(validateConfig({
      events: [{ id: 'e1', title: 'X', start: '2026-04-20T09:00:00Z', end: '2026-04-20T10:00:00Z' }],
    })).toEqual({ ok: true, issues: [] })
  })
})

describe('validateConfig — duplicate ids', () => {
  it('catches duplicates in every catalog section', () => {
    const r = validateConfig({
      resourceTypes: [{ id: 'vehicle', label: 'Truck' }, { id: 'vehicle', label: 'Trailer' }],
      roles:         [{ id: 'driver',  label: 'Driver' }, { id: 'driver',  label: 'Driver II' }],
      resources:     [{ id: 't1', name: 'A' }, { id: 't1', name: 'B' }],
      pools:         [{ id: 'p',  name: 'P', memberIds: [], strategy: 'first-available' },
                      { id: 'p',  name: 'P2', memberIds: [], strategy: 'first-available' }],
    })
    const dups = r.issues.filter(i => i.kind === 'duplicate-id').map(i => i.kind === 'duplicate-id' ? `${i.section}/${i.id}` : '')
    expect(dups).toEqual([
      'resourceTypes/vehicle',
      'roles/driver',
      'resources/t1',
      'pools/p',
    ])
  })
})

describe('validateConfig — error vs ok summary', () => {
  it('returns ok:true when there are no error-severity issues', () => {
    const r = validateConfig({})
    expect(r.ok).toBe(true)
  })

  it('returns ok:false when any error is present', () => {
    const r = validateConfig({
      requirements: [{ eventType: 'x', requires: [{ role: 'unknown', count: 1 }] }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBe(1)
  })
})

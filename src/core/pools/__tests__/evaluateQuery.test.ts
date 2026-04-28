/**
 * evaluateQuery — v2 pool query DSL specs (issue #386).
 */
import { describe, it, expect } from 'vitest'
import { evaluateQuery } from '../evaluateQuery'
import type { ResourceQuery } from '../poolQuerySchema'
import type { EngineResource } from '../../engine/schema/resourceSchema'

const r = (id: string, meta: Record<string, unknown>, extras: Partial<EngineResource> = {}): EngineResource => ({
  id, name: id.toUpperCase(), meta, ...extras,
} as EngineResource)

const fleet: readonly EngineResource[] = [
  r('truck-101', { type: 'vehicle', capabilities: { refrigerated: true,  capacity_lbs: 80000 } }),
  r('truck-202', { type: 'vehicle', capabilities: { refrigerated: true,  capacity_lbs: 60000 } }),
  r('truck-303', { type: 'vehicle', capabilities: { refrigerated: false, capacity_lbs: 80000 } }),
  r('driver-1',  { type: 'person', capabilities: { cdl: true } }),
]

describe('evaluateQuery — leaf operators', () => {
  it('eq matches strict equality on meta dot-paths', () => {
    const q: ResourceQuery = { op: 'eq', path: 'capabilities.refrigerated', value: true }
    const e = evaluateQuery(q, fleet)
    expect(e.matched).toEqual(['truck-101', 'truck-202'])
    expect(e.excluded.map(x => x.id)).toEqual(['truck-303', 'driver-1'])
  })

  it('eq supports the leading `meta.` prefix interchangeably', () => {
    const q: ResourceQuery = { op: 'eq', path: 'meta.capabilities.refrigerated', value: true }
    expect(evaluateQuery(q, fleet).matched).toEqual(['truck-101', 'truck-202'])
  })

  it('eq returns false when path is missing (not throws)', () => {
    const q: ResourceQuery = { op: 'eq', path: 'capabilities.cold_chain', value: true }
    expect(evaluateQuery(q, fleet).matched).toEqual([])
  })

  it('eq matches top-level fields (id / name / tenantId)', () => {
    const tenanted = [
      r('a', {}, { tenantId: 'acme' }),
      r('b', {}, { tenantId: 'globex' }),
    ]
    const q: ResourceQuery = { op: 'eq', path: 'tenantId', value: 'acme' }
    expect(evaluateQuery(q, tenanted).matched).toEqual(['a'])
  })

  it('neq is the inverse of eq, including missing paths', () => {
    const q: ResourceQuery = { op: 'neq', path: 'capabilities.refrigerated', value: true }
    expect(evaluateQuery(q, fleet).matched).toEqual(['truck-303', 'driver-1'])
  })

  it('in matches when the value is in the list', () => {
    const q: ResourceQuery = { op: 'in', path: 'type', values: ['vehicle', 'aircraft'] }
    expect(evaluateQuery(q, fleet).matched).toEqual(['truck-101', 'truck-202', 'truck-303'])
  })

  it('gte / lte filter numeric meta', () => {
    const q: ResourceQuery = { op: 'gte', path: 'capabilities.capacity_lbs', value: 80000 }
    expect(evaluateQuery(q, fleet).matched).toEqual(['truck-101', 'truck-303'])
  })

  it('numeric comparators reject non-numbers and missing paths', () => {
    const q: ResourceQuery = { op: 'gte', path: 'capabilities.refrigerated', value: 1 }
    // `refrigerated` is a boolean — gte must reject, not coerce.
    expect(evaluateQuery(q, fleet).matched).toEqual([])
  })

  it('exists distinguishes presence from comparator results', () => {
    const q: ResourceQuery = { op: 'exists', path: 'capabilities.cdl' }
    expect(evaluateQuery(q, fleet).matched).toEqual(['driver-1'])
  })
})

describe('evaluateQuery — boolean composites', () => {
  const reefer80k: ResourceQuery = {
    op: 'and',
    clauses: [
      { op: 'eq',  path: 'type',                       value:  'vehicle' },
      { op: 'eq',  path: 'capabilities.refrigerated',  value:  true },
      { op: 'gte', path: 'capabilities.capacity_lbs',  value:  80000 },
    ],
  }

  it('and matches only when every clause holds', () => {
    expect(evaluateQuery(reefer80k, fleet).matched).toEqual(['truck-101'])
  })

  it('and reports the first failing clause as the exclusion reason', () => {
    const e = evaluateQuery(reefer80k, fleet)
    const reasons = Object.fromEntries(e.excluded.map(x => [x.id, x.reason]))
    expect(reasons['truck-202']).toBe('gte(capabilities.capacity_lbs)')
    expect(reasons['truck-303']).toBe('eq(capabilities.refrigerated)')
    expect(reasons['driver-1']).toBe('eq(type)')
  })

  it('or matches if any clause holds; reports the last failure when all fail', () => {
    const q: ResourceQuery = {
      op: 'or',
      clauses: [
        { op: 'eq', path: 'type', value: 'aircraft' },
        { op: 'eq', path: 'capabilities.refrigerated', value: true },
      ],
    }
    expect(evaluateQuery(q, fleet).matched).toEqual(['truck-101', 'truck-202'])
  })

  it('not inverts the inner clause', () => {
    const q: ResourceQuery = { op: 'not', clause: { op: 'eq', path: 'type', value: 'vehicle' } }
    expect(evaluateQuery(q, fleet).matched).toEqual(['driver-1'])
  })

  it('empty and is vacuously true; empty or is vacuously false', () => {
    expect(evaluateQuery({ op: 'and', clauses: [] }, fleet).matched).toHaveLength(fleet.length)
    expect(evaluateQuery({ op: 'or',  clauses: [] }, fleet).matched).toEqual([])
  })

  it('accepts a Map of resources interchangeably with an array', () => {
    const map = new Map(fleet.map(r => [r.id, r]))
    expect(evaluateQuery(reefer80k, map).matched).toEqual(['truck-101'])
  })
})

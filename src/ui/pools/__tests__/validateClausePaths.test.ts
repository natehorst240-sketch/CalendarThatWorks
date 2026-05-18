/**
 * `validateClausePaths` — soft path-existence check (#452).
 */
import { describe, it, expect } from 'vitest'
import { validateClausePaths } from '../validateClausePaths'
import type { ResourceQuery } from 'works-calendar-engine'
import type { EngineResource } from 'works-calendar-engine'

const r = (id: string, meta: Record<string, unknown> = {}): EngineResource =>
  ({ id, name: id.toUpperCase(), meta } as EngineResource)

const fleet: readonly EngineResource[] = [
  r('t1', { capabilities: { refrigerated: true,  capacity_lbs: 80000 }, location: { lat: 40, lon: -111 } }),
  r('t2', { capabilities: { refrigerated: false, capacity_lbs: 60000 } }),
]

describe('validateClausePaths', () => {
  it('returns ok when every leaf path resolves on at least one resource', () => {
    const q: ResourceQuery = { op: 'eq', path: 'meta.capabilities.refrigerated', value: true }
    const r = validateClausePaths(q, fleet)
    expect(r.ok).toBe(true)
    expect(r.unresolved).toEqual([])
    expect(r.byPath.size).toBe(0)
  })

  it('flags a typo on the leaf path', () => {
    const q: ResourceQuery = { op: 'eq', path: 'meta.capabilities.refridgerated', value: true }
    const out = validateClausePaths(q, fleet)
    expect(out.ok).toBe(false)
    expect(out.unresolved.map(u => u.path)).toEqual(['meta.capabilities.refridgerated'])
    expect(out.byPath.has('meta.capabilities.refridgerated')).toBe(true)
  })

  it('walks AND/OR composites and reports each unresolved leaf', () => {
    const q: ResourceQuery = {
      op: 'and',
      clauses: [
        { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },         // resolves
        { op: 'gte', path: 'meta.capabilities.capacity_kg',  value: 80000 },        // typo (lbs vs kg)
        { op: 'eq',  path: 'meta.bogus',                     value: 'x' },           // unknown
      ],
    }
    const out = validateClausePaths(q, fleet)
    expect(out.unresolved.map(u => u.path)).toEqual([
      'meta.capabilities.capacity_kg',
      'meta.bogus',
    ])
  })

  it('walks NOT to its inner clause', () => {
    const q: ResourceQuery = {
      op: 'not',
      clause: { op: 'eq', path: 'meta.absent', value: 1 },
    }
    expect(validateClausePaths(q, fleet).unresolved.map(u => u.path)).toEqual(['meta.absent'])
  })

  it('counts repeated paths but reports each path once', () => {
    const q: ResourceQuery = {
      op: 'and',
      clauses: [
        { op: 'gte', path: 'meta.bogus', value: 1 },
        { op: 'lte', path: 'meta.bogus', value: 5 },
      ],
    }
    const out = validateClausePaths(q, fleet)
    expect(out.unresolved.length).toBe(1)
    expect(out.unresolved[0]?.count).toBe(2)
  })

  it('treats top-level fields (id, name, tenantId, …) as resolvable', () => {
    const q: ResourceQuery = { op: 'eq', path: 'name', value: 'T1' }
    expect(validateClausePaths(q, fleet).ok).toBe(true)
  })

  it('handles the within op (its `path` participates like any leaf)', () => {
    const q: ResourceQuery = {
      op: 'within', path: 'meta.location',
      from: { kind: 'point', lat: 40, lon: -111 }, miles: 50,
    }
    expect(validateClausePaths(q, fleet).ok).toBe(true)

    const bad: ResourceQuery = {
      op: 'within', path: 'meta.absent.location',
      from: { kind: 'point', lat: 40, lon: -111 }, miles: 50,
    }
    expect(validateClausePaths(bad, fleet).ok).toBe(false)
  })

  it('skips empty path strings (avoid noise on blank leaves)', () => {
    const q: ResourceQuery = { op: 'eq', path: '', value: '' }
    expect(validateClausePaths(q, fleet).ok).toBe(true)
  })

  it('accepts a Map of resources interchangeably with an array', () => {
    const map = new Map(fleet.map(x => [x.id, x]))
    const q: ResourceQuery = { op: 'eq', path: 'meta.bogus', value: 1 }
    expect(validateClausePaths(q, map)).toEqual(validateClausePaths(q, fleet))
  })
})

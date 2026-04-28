/**
 * poolSummary — pure plain-English description of a pool (#386 UI).
 */
import { describe, it, expect } from 'vitest'
import { summarizePool, summarizeQuery } from '../poolSummary'
import type { ResourcePool } from '../../../core/pools/resourcePoolSchema'
import type { ResourceQuery } from '../../../core/pools/poolQuerySchema'

const base = (patch: Partial<ResourcePool> & Pick<ResourcePool, 'id' | 'name'>): ResourcePool => ({
  memberIds: [],
  strategy: 'first-available',
  ...patch,
})

describe('summarizePool — type label', () => {
  it('labels a manual pool', () => {
    const s = summarizePool(base({ id: 'p', name: 'Drivers' }))
    expect(s.typeLabel).toBe('Manual pool')
    expect(s.headline).toMatch(/^Manual pool/)
  })

  it('labels a query pool', () => {
    const s = summarizePool(base({ id: 'p', name: 'Reefers', type: 'query' }))
    expect(s.typeLabel).toBe('Query pool')
  })

  it('labels a hybrid pool', () => {
    const s = summarizePool(base({ id: 'p', name: 'Curated reefers', type: 'hybrid' }))
    expect(s.typeLabel).toBe('Hybrid pool')
  })

  it('falls back to bare "Pool" for unknown type strings (defensive)', () => {
    const s = summarizePool({ ...base({ id: 'p', name: 'X' }), type: 'graphql' as any })
    expect(s.typeLabel).toBe('Pool')
  })
})

describe('summarizePool — clauses', () => {
  it('counts members on a manual pool', () => {
    const s = summarizePool(base({ id: 'p', name: 'D', memberIds: ['a', 'b', 'c'] }))
    expect(s.clauseLabels).toEqual(['3 members'])
  })

  it('renders capability + radius clauses for a query pool', () => {
    const pool = base({
      id: 'p', name: 'Nearby reefers', type: 'query',
      query: {
        op: 'and',
        clauses: [
          { op: 'eq',     path: 'meta.capabilities.refrigerated', value: true },
          { op: 'within', path: 'meta.location', from: { kind: 'proposed' }, miles: 50 },
        ],
      },
    })
    const s = summarizePool(pool)
    expect(s.clauseLabels).toEqual(['refrigerated', 'within 50 mi of event'])
    expect(s.headline).toContain('refrigerated')
    expect(s.headline).toContain('within 50 mi')
  })

  it('appends curated-member count for a hybrid pool', () => {
    const pool = base({
      id: 'p', name: 'Our reefers', type: 'hybrid',
      memberIds: ['t1', 't2'],
      query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
    })
    const s = summarizePool(pool)
    expect(s.clauseLabels).toContain('refrigerated')
    expect(s.clauseLabels).toContain('limited to 2 curated members')
  })
})

describe('summarizeQuery — leaf operators', () => {
  it('renders eq with boolean true as a bare capability name', () => {
    expect(summarizeQuery({ op: 'eq', path: 'capabilities.refrigerated', value: true }))
      .toEqual(['refrigerated'])
  })

  it('renders eq with boolean false as "not <capability>"', () => {
    expect(summarizeQuery({ op: 'eq', path: 'capabilities.refrigerated', value: false }))
      .toEqual(['not refrigerated'])
  })

  it('renders numeric gte naturally', () => {
    expect(summarizeQuery({ op: 'gte', path: 'capabilities.capacity_lbs', value: 80000 }))
      .toEqual(['capacity lbs ≥ 80,000'])
  })

  it('renders within with a literal point', () => {
    expect(summarizeQuery({
      op: 'within', path: 'meta.location',
      from: { kind: 'point', lat: 40.7608, lon: -111.8910 }, miles: 50,
    })).toEqual(['within 50 mi of 40.76, -111.89'])
  })

  it('renders within with kind: proposed against the event', () => {
    expect(summarizeQuery({
      op: 'within', path: 'meta.location', from: { kind: 'proposed' }, km: 100,
    })).toEqual(['within 100 km of event'])
  })

  it('flattens nested ANDs into a single phrase list', () => {
    const q: ResourceQuery = {
      op: 'and',
      clauses: [
        { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },
        { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000 },
      ],
    }
    expect(summarizeQuery(q)).toEqual(['refrigerated', 'capacity lbs ≥ 80,000'])
  })

  it('renders OR as "any of …" so meaning isn\'t lost', () => {
    const q: ResourceQuery = {
      op: 'or',
      clauses: [
        { op: 'eq', path: 'type', value: 'vehicle' },
        { op: 'eq', path: 'type', value: 'aircraft' },
      ],
    }
    expect(summarizeQuery(q)).toEqual(['any of: type = vehicle / type = aircraft'])
  })

  it('renders NOT as "not (…)"', () => {
    const q: ResourceQuery = {
      op: 'not',
      clause: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
    }
    expect(summarizeQuery(q)).toEqual(['not (refrigerated)'])
  })
})

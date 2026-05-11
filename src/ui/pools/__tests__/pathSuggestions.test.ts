/**
 * derivePathSuggestions — meta-path inference for the v2
 * advanced-rules editor's autocomplete (#386).
 */
import { describe, it, expect } from 'vitest'
import { derivePathSuggestions } from '../pathSuggestions'
import type { EngineResource } from '../../../core/engine/schema/resourceSchema'

const r = (id: string, meta: Record<string, unknown> = {}): EngineResource =>
  ({ id, name: id.toUpperCase(), meta } as EngineResource)

describe('derivePathSuggestions', () => {
  it('returns the top-level field set even for an empty registry', () => {
    expect(derivePathSuggestions([])).toEqual([
      'capacity', 'color', 'id', 'name', 'tenantId', 'timezone',
    ])
  })

  it('walks meta and collects nested dotted paths', () => {
    const fleet = [
      r('t1', { capabilities: { refrigerated: true,  capacity_lbs: 80000 }, location: { lat: 40, lon: -111 } }),
    ]
    const out = derivePathSuggestions(fleet)
    expect(out).toContain('meta.capabilities')
    expect(out).toContain('meta.capabilities.refrigerated')
    expect(out).toContain('meta.capabilities.capacity_lbs')
    expect(out).toContain('meta.location')
    expect(out).toContain('meta.location.lat')
  })

  it('dedups across multiple resources', () => {
    const fleet = [
      r('t1', { capabilities: { refrigerated: true } }),
      r('t2', { capabilities: { refrigerated: true } }),
    ]
    const out = derivePathSuggestions(fleet)
    expect(out.filter(p => p === 'meta.capabilities.refrigerated')).toEqual(['meta.capabilities.refrigerated'])
  })

  it('treats arrays and primitives as leaves (no recursion)', () => {
    const fleet = [r('t1', { tags: ['fast', 'big'], notes: 'free text' })]
    const out = derivePathSuggestions(fleet)
    expect(out).toContain('meta.tags')
    expect(out).toContain('meta.notes')
    // Array indices / nested values shouldn't surface as paths.
    expect(out.find(p => p.startsWith('meta.tags.'))).toBeUndefined()
  })

  it('returns sorted output for stable datalist ordering', () => {
    const fleet = [r('t1', { z_last: 1, a_first: 2 })]
    const out = derivePathSuggestions(fleet)
    const sorted = [...out].sort()
    expect(out).toEqual(sorted)
  })

  it('accepts a Map and an array interchangeably', () => {
    const fleet = [r('t1', { capabilities: { refrigerated: true } })]
    const map = new Map(fleet.map(x => [x.id, x]))
    expect(derivePathSuggestions(map)).toEqual(derivePathSuggestions(fleet))
  })

  it('returns [] for undefined input', () => {
    expect(derivePathSuggestions(undefined)).toEqual([])
  })

  it('skips walkInto when resource has no meta', () => {
    // Covers the if (r.meta) false branch
    const noMeta = { id: 'r1', name: 'R1', meta: null } as unknown as EngineResource
    const out = derivePathSuggestions([noMeta])
    expect(out).toEqual(['capacity', 'color', 'id', 'name', 'tenantId', 'timezone'])
  })

  it('stops recursing at MAX_DEPTH (depth=5)', () => {
    // 5 levels of nesting: meta → a → b → c → d → e triggers the depth guard
    const fleet = [r('t1', { a: { b: { c: { d: { e: { f: 'too deep' } } } } } })]
    const out = derivePathSuggestions(fleet)
    expect(out).toContain('meta.a.b.c.d.e')
    expect(out.find(p => p.startsWith('meta.a.b.c.d.e.'))).toBeUndefined()
  })

  it('caps the suggestion set at MAX_SUGGESTIONS (200) and stops early', () => {
    // Create a resource with enough meta keys to hit the 200-path cap
    const bigMeta: Record<string, unknown> = {}
    for (let i = 0; i < 210; i++) bigMeta[`key_${i}`] = i
    const fleet = [r('r1', bigMeta), r('r2', { extra: 1 })]
    const out = derivePathSuggestions(fleet)
    // Result must be capped at 200
    expect(out.length).toBeLessThanOrEqual(200)
  })
})

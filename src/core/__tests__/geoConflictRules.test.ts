import { describe, it, expect } from 'vitest'
import {
  evaluateGeoConflicts,
  type GeoTravelFeasibilityRule,
  type GeoEventInput,
} from '../conflicts/geoConflictRules'

const RULE: GeoTravelFeasibilityRule = {
  id: 'travel',
  type: 'geo-travel-feasibility',
  maxSpeedKph: 800,
}

// Coordinates: SEA (47.45, -122.31), DEN (39.86, -104.67) — ~1644 km
const SEA = { lat: 47.45, lon: -122.31 }
const DEN = { lat: 39.86, lon: -104.67 }

function evt(
  id: string,
  start: string,
  end: string,
  resource: string,
  coords: { lat: number; lon: number } | null,
): GeoEventInput {
  return { id, start, end, resource, meta: coords ? { coords } : {} }
}

describe('evaluateGeoConflicts — travel feasibility', () => {
  it('flags a gap that is too short for the distance', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    const v = evaluateGeoConflicts([RULE], proposed, [other])
    expect(v.length).toBe(1)
    expect(v[0]!.severity).toBe('soft')
    expect(v[0]!.details.distanceKm).toBeGreaterThan(1500)
    // 1644 km / 800 kph ≈ 123 min required, gap is 30 min
    expect(v[0]!.details.requiredGapMinutes).toBeGreaterThan(120)
    expect(v[0]!.details.actualGapMinutes).toBe(30)
  })

  it('passes when gap is comfortably above travel time', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-21T00:00', '2026-04-21T01:00', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('skips events on a different resource', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-2', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('does not fire when events overlap in time (resource-overlap territory)', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T14:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:00', '2026-04-20T15:00', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('honors minGapMinutes even when distance is zero', () => {
    const turnaround: GeoTravelFeasibilityRule = { ...RULE, minGapMinutes: 30 }
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:10', '2026-04-20T14:00', 'ac-1', SEA)
    const v = evaluateGeoConflicts([turnaround], proposed, [other])
    expect(v.length).toBe(1)
    expect(v[0]!.details.requiredGapMinutes).toBe(30)
    expect(v[0]!.details.actualGapMinutes).toBe(10)
  })

  it('skips when proposed event has no coordinates', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', null)
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('respects ignoreCategories', () => {
    const rule: GeoTravelFeasibilityRule = { ...RULE, ignoreCategories: ['ferry'] }
    const proposed = { ...evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA), category: 'ferry' }
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([rule], proposed, [other])).toEqual([])
  })

  it('returns empty array when rules is empty', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([], proposed, [other])).toEqual([])
  })

  it('skips self when other.id === proposed.id', () => {
    const proposed = evt('same', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('same', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('skips when other.resource is null', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other: GeoEventInput = { ...evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN), resource: null }
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('skips when proposed.resource is null', () => {
    const proposed: GeoEventInput = { ...evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA), resource: null }
    const other = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('skips when other has no coordinates', () => {
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', null)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('uses severity: hard when rule specifies it', () => {
    const hardRule: GeoTravelFeasibilityRule = { ...RULE, severity: 'hard' }
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    const v = evaluateGeoConflicts([hardRule], proposed, [other])
    expect(v.length).toBe(1)
    expect(v[0]!.severity).toBe('hard')
  })

  it('returns null violation when gap minutes cannot be computed (invalid timestamp)', () => {
    const proposed: GeoEventInput = {
      id: 'p', start: 'not-a-date', end: '2026-04-20T13:00', resource: 'ac-1',
      meta: { coords: { lat: SEA.lat, lon: SEA.lon } },
    }
    const other = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })

  it('returns no violation when requiredGapMinutes is 0 (same coords, no minGapMinutes)', () => {
    const zeroRule: GeoTravelFeasibilityRule = { ...RULE, minGapMinutes: 0 }
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    // Same coords as proposed → distanceKm = 0 → travelMinutes = 0 → required = 0 → skip
    const other = evt('o', '2026-04-20T13:10', '2026-04-20T14:00', 'ac-1', SEA)
    expect(evaluateGeoConflicts([zeroRule], proposed, [other])).toEqual([])
  })

  it('resolves coords from direct meta.lat/lon instead of meta.coords', () => {
    const proposed: GeoEventInput = {
      id: 'p', start: '2026-04-20T12:00', end: '2026-04-20T13:00', resource: 'ac-1',
      meta: { lat: SEA.lat, lon: SEA.lon },
    }
    const other: GeoEventInput = {
      id: 'o', start: '2026-04-20T13:30', end: '2026-04-20T14:30', resource: 'ac-1',
      meta: { lat: DEN.lat, lon: DEN.lon },
    }
    const v = evaluateGeoConflicts([RULE], proposed, [other])
    expect(v.length).toBe(1)
    expect(v[0]!.details.distanceKm).toBeGreaterThan(1500)
  })

  it('resolves coords using meta.lng as longitude fallback', () => {
    const proposed: GeoEventInput = {
      id: 'p', start: '2026-04-20T12:00', end: '2026-04-20T13:00', resource: 'ac-1',
      meta: { coords: { lat: SEA.lat, lng: SEA.lon } },
    }
    const other: GeoEventInput = {
      id: 'o', start: '2026-04-20T13:30', end: '2026-04-20T14:30', resource: 'ac-1',
      meta: { coords: { lat: DEN.lat, lng: DEN.lon } },
    }
    const v = evaluateGeoConflicts([RULE], proposed, [other])
    expect(v.length).toBe(1)
  })

  it('handles numeric timestamps correctly', () => {
    const proposed: GeoEventInput = {
      id: 'p',
      start: new Date('2026-04-20T12:00Z').getTime(),
      end:   new Date('2026-04-20T13:00Z').getTime(),
      resource: 'ac-1',
      meta: { coords: { lat: SEA.lat, lon: SEA.lon } },
    }
    const other: GeoEventInput = {
      id: 'o',
      start: new Date('2026-04-20T13:30Z').getTime(),
      end:   new Date('2026-04-20T14:30Z').getTime(),
      resource: 'ac-1',
      meta: { coords: { lat: DEN.lat, lon: DEN.lon } },
    }
    const v = evaluateGeoConflicts([RULE], proposed, [other])
    expect(v.length).toBe(1)
  })

  it('computes gap when b ends before a starts (b precedes a)', () => {
    // proposed starts after other ends — gap computed as aStart - bEnd
    const proposed = evt('p', '2026-04-20T14:00', '2026-04-20T15:00', 'ac-1', SEA)
    const other    = evt('o', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', DEN)
    // 60 min gap, distance 1644 km requires ~123 min → violation
    const v = evaluateGeoConflicts([RULE], proposed, [other])
    expect(v.length).toBe(1)
    expect(v[0]!.details.actualGapMinutes).toBe(60)
  })

  it('returns empty when proposed has no meta property at all', () => {
    const noMeta: GeoEventInput = {
      id: 'p', start: '2026-04-20T12:00', end: '2026-04-20T13:00', resource: 'ac-1',
      // no meta
    }
    const other = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], noMeta, [other])).toEqual([])
  })

  it('returns no violation when coords contain non-finite values', () => {
    const nanCoords: GeoEventInput = {
      id: 'p', start: '2026-04-20T12:00', end: '2026-04-20T13:00', resource: 'ac-1',
      meta: { coords: { lat: NaN, lon: -122.31 } },
    }
    const other = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], nanCoords, [other])).toEqual([])
  })

  it('resolves direct meta.lat/lng (lng fallback for flat coords)', () => {
    const proposed: GeoEventInput = {
      id: 'p', start: '2026-04-20T12:00', end: '2026-04-20T13:00', resource: 'ac-1',
      meta: { lat: SEA.lat, lng: SEA.lon },
    }
    const other: GeoEventInput = {
      id: 'o', start: '2026-04-20T13:30', end: '2026-04-20T14:30', resource: 'ac-1',
      meta: { lat: DEN.lat, lng: DEN.lon },
    }
    const v = evaluateGeoConflicts([RULE], proposed, [other])
    expect(v.length).toBe(1)
  })

  it('skips ignoreCategories check when proposed.category is absent', () => {
    const rule: GeoTravelFeasibilityRule = { ...RULE, ignoreCategories: ['ferry'] }
    const proposed = evt('p', '2026-04-20T12:00', '2026-04-20T13:00', 'ac-1', SEA)
    // proposed has no category — the ignoreCategories predicate should be false
    const other = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    const v = evaluateGeoConflicts([rule], proposed, [other])
    // category is not in ignoreCategories → violation should still be raised
    expect(v.length).toBe(1)
  })

  it('handles an NaN/Infinity numeric timestamp', () => {
    const proposed: GeoEventInput = {
      id: 'p', start: Infinity, end: new Date('2026-04-20T13:00Z').getTime(),
      resource: 'ac-1', meta: { coords: { lat: SEA.lat, lon: SEA.lon } },
    }
    const other = evt('o', '2026-04-20T13:30', '2026-04-20T14:30', 'ac-1', DEN)
    expect(evaluateGeoConflicts([RULE], proposed, [other])).toEqual([])
  })
})

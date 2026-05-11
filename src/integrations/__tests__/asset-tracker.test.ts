import { describe, expect, it } from 'vitest'
import {
  createAssetTrackerIntegration,
  isValidPosition,
  mapPositionToResourceMeta,
  positionToResourceTrackingMeta,
  type AssetTrackerLikeRegistry,
  type AssetTrackerPosition,
} from '../asset-tracker'

const samplePosition: AssetTrackerPosition = {
  id: 'truck-101',
  lat: 40.7608,
  lon: -111.891,
  altitude: 1300,
  heading: 90,
  speed: 65,
  timestamp: 1714329600,
  source: 'samsara',
  label: 'Truck 101',
}

describe('asset-tracker integration subpath', () => {
  it('validates normalized positions', () => {
    expect(isValidPosition(samplePosition)).toBe(true)
    expect(isValidPosition({ ...samplePosition, lat: 120 })).toBe(false)
  })

  it('maps position to tracking meta through both APIs', () => {
    const direct = positionToResourceTrackingMeta(samplePosition, 1714329660, 120)
    const alias = mapPositionToResourceMeta(samplePosition, 1714329660, 120)
    expect(alias).toEqual(direct)
  })

  it('creates location adapter from registry getById()', () => {
    const registry: AssetTrackerLikeRegistry = {
      getById: (id) => (id === 'truck-101' ? samplePosition : null),
    }
    const integration = createAssetTrackerIntegration(registry, { nowSeconds: () => 1714329660 })
    const loc = integration.locationAdapter.resolve({ id: 'truck-101', name: 'Truck 101' })
    expect(loc).toMatchObject({ lat: 40.7608, lon: -111.891, altitude: 1300, speed: 65 })
    expect((loc?.meta as any).tracking.stale).toBe(false)
  })

  it('supports positions() fallback', () => {
    const registry: AssetTrackerLikeRegistry = { positions: () => [samplePosition] }
    const integration = createAssetTrackerIntegration(registry)
    const loc = integration.locationAdapter.resolve({ id: 'truck-101', name: 'Truck 101' })
    expect(loc?.lat).toBe(40.7608)
  })

  it('returns null when getById returns null', () => {
    const registry: AssetTrackerLikeRegistry = { getById: () => null }
    const integration = createAssetTrackerIntegration(registry)
    const loc = integration.locationAdapter.resolve({ id: 'no-such-truck', name: 'Ghost' })
    expect(loc).toBeNull()
  })

  it('returns null for a position not in the positions() registry', () => {
    const registry: AssetTrackerLikeRegistry = { positions: () => [samplePosition] }
    const integration = createAssetTrackerIntegration(registry)
    const loc = integration.locationAdapter.resolve({ id: 'unknown', name: 'Unknown' })
    expect(loc).toBeNull()
  })

  it('returns null for an invalid position (lat > 90)', () => {
    const bad = { ...samplePosition, lat: 999 }
    const registry: AssetTrackerLikeRegistry = { getById: () => bad }
    const integration = createAssetTrackerIntegration(registry)
    const loc = integration.locationAdapter.resolve({ id: 'truck-101', name: 'Truck 101' })
    expect(loc).toBeNull()
  })

  it('uses positions() index cache on repeated calls with same reference', () => {
    const arr = [samplePosition]
    const registry: AssetTrackerLikeRegistry = { positions: () => arr }
    const integration = createAssetTrackerIntegration(registry)
    const loc1 = integration.locationAdapter.resolve({ id: 'truck-101', name: 'Truck' })
    const loc2 = integration.locationAdapter.resolve({ id: 'truck-101', name: 'Truck' })
    expect(loc1?.lat).toBe(40.7608)
    expect(loc2?.lat).toBe(40.7608)
  })

  it('uses custom resourceIdFromPosition when provided', () => {
    const registry: AssetTrackerLikeRegistry = { positions: () => [samplePosition] }
    const integration = createAssetTrackerIntegration(registry, {
      resourceIdFromPosition: (p) => `custom-${p.id}`,
    })
    const loc = integration.locationAdapter.resolve({ id: 'custom-truck-101', name: 'Truck' })
    expect(loc?.lat).toBe(40.7608)
  })

  it('omits optional fields when position has no altitude/heading/speed', () => {
    const minimal: AssetTrackerPosition = {
      id: 'bus-1', lat: 37.77, lon: -122.42, timestamp: 1714329600, source: 'gps',
    }
    const registry: AssetTrackerLikeRegistry = { getById: () => minimal }
    const integration = createAssetTrackerIntegration(registry, { nowSeconds: () => 1714329660 })
    const loc = integration.locationAdapter.resolve({ id: 'bus-1', name: 'Bus' })
    expect(loc).not.toBeNull()
    expect(loc!).not.toHaveProperty('altitude')
    expect(loc!).not.toHaveProperty('heading')
    expect(loc!).not.toHaveProperty('speed')
  })

  it('omits upstream meta when position.meta is absent', () => {
    const noMeta: AssetTrackerPosition = {
      id: 'van-1', lat: 37.77, lon: -122.42, timestamp: 1714329600, source: 'gps',
    }
    const registry: AssetTrackerLikeRegistry = { getById: () => noMeta }
    const integration = createAssetTrackerIntegration(registry, { nowSeconds: () => 1714329660 })
    const loc = integration.locationAdapter.resolve({ id: 'van-1', name: 'Van' })
    expect((loc?.meta as any).upstream).toBeUndefined()
  })

  it('includes upstream meta when position.meta is present', () => {
    const withMeta: AssetTrackerPosition = {
      ...samplePosition, meta: { fleet: 'logistics-A' },
    }
    const registry: AssetTrackerLikeRegistry = { getById: () => withMeta }
    const integration = createAssetTrackerIntegration(registry, { nowSeconds: () => 1714329660 })
    const loc = integration.locationAdapter.resolve({ id: 'truck-101', name: 'Truck' })
    expect((loc?.meta as any).upstream).toEqual({ fleet: 'logistics-A' })
  })

  it('uses default id "asset-tracker" when options.id is absent', () => {
    const registry: AssetTrackerLikeRegistry = {}
    const integration = createAssetTrackerIntegration(registry)
    expect(integration.locationAdapter.id).toBe('asset-tracker')
  })

  it('uses custom id when options.id is provided', () => {
    const registry: AssetTrackerLikeRegistry = {}
    const integration = createAssetTrackerIntegration(registry, { id: 'samsara-feed' })
    expect(integration.locationAdapter.id).toBe('samsara-feed')
  })

  it('returns null when registry has neither getById nor positions', () => {
    const registry: AssetTrackerLikeRegistry = {}
    const integration = createAssetTrackerIntegration(registry)
    const loc = integration.locationAdapter.resolve({ id: 'any', name: 'Any' })
    expect(loc).toBeNull()
  })
})

import type { EngineResource } from 'works-calendar-engine'
import type { ResourceLocationAdapter, ResourceLocation } from 'works-calendar-engine'
import type {
  GeoPoint,
  ResourceTrackingMeta,
  AssetTrackerPosition,
} from 'works-calendar-engine'
import type { WorksCalendarMapAdapter } from '../core/geo/mapAdapterTypes'
import { isValidPosition } from 'works-calendar-engine'
import { positionToResourceTrackingMeta } from 'works-calendar-engine'

export type { GeoPoint, ResourceTrackingMeta, AssetTrackerPosition, WorksCalendarMapAdapter }
export { isValidPosition, positionToResourceTrackingMeta }

export interface AssetTrackerLikeRegistry {
  readonly getById?: (id: string) => AssetTrackerPosition | null | undefined
  readonly positions?: () => Iterable<AssetTrackerPosition>
}

export interface AssetMapIntegrationOptions {
  readonly id?: string
  readonly staleThresholdSeconds?: number
  readonly nowSeconds?: () => number
  readonly resourceIdFromPosition?: (position: AssetTrackerPosition) => string
}

export interface AssetTrackerIntegration {
  readonly locationAdapter: ResourceLocationAdapter
  readonly mapPositionToResourceMeta: (position: AssetTrackerPosition) => ResourceTrackingMeta | null
}

export function mapPositionToResourceMeta(
  position: AssetTrackerPosition,
  nowSeconds: number,
  staleThresholdSeconds: number,
): ResourceTrackingMeta | null {
  return positionToResourceTrackingMeta(position, nowSeconds, staleThresholdSeconds)
}

export function createAssetTrackerIntegration(
  registry: AssetTrackerLikeRegistry,
  options: AssetMapIntegrationOptions = {},
): AssetTrackerIntegration {
  const staleThresholdSeconds = options.staleThresholdSeconds ?? 120
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000))
  const resourceIdFromPosition = options.resourceIdFromPosition ?? ((p: AssetTrackerPosition) => p.id)

  // Index cache. The previous version rebuilt this Map on every
  // resolve() call — O(N) per asset, so O(N×P) per attachLocations
  // pass for fleets sized N with P positions. The cache is keyed on the
  // identity of the iterable returned by `registry.positions()`: in-
  // memory snapshots that return the same array reference build the
  // index exactly once, while live feeds that return a fresh iterator
  // each call (e.g. generators) still rebuild on demand and stay
  // current. This cache is also bypassed entirely when the registry
  // exposes `getById`, since that path doesn't need the index.
  let cachedIterable: Iterable<AssetTrackerPosition> | null = null
  let cachedMap: ReadonlyMap<string, AssetTrackerPosition> | null = null

  const byResourceId = (): ReadonlyMap<string, AssetTrackerPosition> => {
    if (typeof registry.positions !== 'function') {
      return cachedMap ?? (cachedMap = new Map())
    }
    const iterable = registry.positions()
    if (cachedIterable === iterable && cachedMap) return cachedMap
    const map = new Map<string, AssetTrackerPosition>()
    for (const pos of iterable) {
      map.set(resourceIdFromPosition(pos), pos)
    }
    cachedIterable = iterable
    cachedMap = map
    return map
  }

  return {
    locationAdapter: {
      id: options.id ?? 'asset-tracker',
      resolve(resource: EngineResource): ResourceLocation | null {
        const pos = lookupPosition(registry, resource.id, byResourceId)
        if (!pos || !isValidPosition(pos)) return null
        return {
          lat: pos.lat,
          lon: pos.lon,
          ...(pos.altitude != null ? { altitude: pos.altitude } : {}),
          ...(pos.heading != null ? { heading: pos.heading } : {}),
          ...(pos.speed != null ? { speed: pos.speed } : {}),
          timestamp: pos.timestamp,
          source: pos.source,
          meta: {
            tracking: mapPositionToResourceMeta(pos, nowSeconds(), staleThresholdSeconds),
            label: pos.label,
            ...(pos.meta ? { upstream: pos.meta } : {}),
          },
        }
      },
    },
    mapPositionToResourceMeta: (position) =>
      mapPositionToResourceMeta(position, nowSeconds(), staleThresholdSeconds),
  }
}

function lookupPosition(
  registry: AssetTrackerLikeRegistry,
  resourceId: string,
  // Lazy: only invoked when `getById` is absent, so callers that pass
  // a registry with a fast lookup path never pay to build the fallback
  // index.
  indexed: () => ReadonlyMap<string, AssetTrackerPosition>,
): AssetTrackerPosition | null {
  if (typeof registry.getById === 'function') return registry.getById(resourceId) ?? null
  return indexed().get(resourceId) ?? null
}

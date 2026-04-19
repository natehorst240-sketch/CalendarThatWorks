/**
 * ManualLocationProvider — default `LocationProvider` implementation.
 *
 * Reads location data from resource meta (no network, no polling).
 * Hosts that don't want to wire a live feed pass a resources array or a
 * resolver function, and this provider returns whatever is already on
 * `resource.meta[metaKey]`. `refreshIntervalMs` is 0 so AssetsView never
 * polls — the provider simply re-reads meta whenever `fetchLocation` is
 * called.
 *
 * Shape accepted on `resource.meta[metaKey]`:
 *   - string                          → { text, asOf: now, status: 'unknown' }
 *   - { text, coords?, asOf?, status?, meta? }  (full LocationData)
 *   - null / undefined                → status: 'unknown'
 *
 * Usage:
 *   const provider = createManualLocationProvider({
 *     resources: [
 *       { id: 'N121AB', meta: { location: 'KPHX' } },
 *       { id: 'N505CD', meta: { location: { text: 'Depot 3', status: 'live', asOf: ... } } },
 *     ],
 *   });
 *
 *   // OR with a dynamic resolver:
 *   createManualLocationProvider({
 *     getResource: (id) => myResourceStore.get(id),
 *   });
 */
import type {
  LocationData,
  LocationProvider,
  ManualLocationProviderOptions,
} from '../types/assets';

interface ResourceLike {
  id: string;
  meta?: Record<string, unknown>;
}

export interface CreateManualLocationProviderOptions extends ManualLocationProviderOptions {
  /** Static lookup — simplest case; ignored if `getResource` is provided. */
  resources?: ResourceLike[];
  /** Dynamic resolver — called on every fetch. Return null if unknown. */
  getResource?: (resourceId: string) => ResourceLike | null | undefined;
}

/** Builds a fresh LocationData placeholder for resources with no meta match. */
const UNKNOWN_LOCATION = (): LocationData => ({
  text:   'Unknown',
  asOf:   new Date().toISOString(),
  status: 'unknown',
});

/**
 * Normalizes whatever value the host placed on `resource.meta[metaKey]` into
 * a LocationData. Strings are wrapped as `{ text, status: 'unknown' }`;
 * objects with a `text` string are passed through with defaults filled in;
 * null / malformed values fall through to the Unknown placeholder.
 */
function toLocationData(raw: unknown): LocationData {
  if (raw == null) return UNKNOWN_LOCATION();

  if (typeof raw === 'string') {
    return {
      text:   raw,
      asOf:   new Date().toISOString(),
      status: 'unknown',
    };
  }

  if (typeof raw === 'object') {
    const obj = raw as Partial<LocationData> & Record<string, unknown>;
    const text = typeof obj.text === 'string' ? obj.text : null;
    if (!text) return UNKNOWN_LOCATION();
    return {
      text,
      coords: obj.coords as LocationData['coords'] | undefined,
      asOf:   typeof obj.asOf === 'string' ? obj.asOf : new Date().toISOString(),
      status: (obj.status as LocationData['status']) ?? 'unknown',
      meta:   obj.meta as Record<string, unknown> | undefined,
    };
  }

  return UNKNOWN_LOCATION();
}

/**
 * Factory for the zero-config default LocationProvider. Accepts either a
 * static `resources` array or a dynamic `getResource` resolver; both read
 * the location off `resource.meta[metaKey]` (default key: 'location').
 * `refreshIntervalMs` is 0 so AssetsView never polls — meta is re-read on
 * demand when AssetsView calls `fetchLocation`.
 */
export function createManualLocationProvider(
  options: CreateManualLocationProviderOptions = {},
): LocationProvider {
  const { metaKey = 'location', resources, getResource } = options;

  const staticMap = new Map<string, ResourceLike>();
  if (resources) {
    for (const r of resources) {
      if (r?.id) staticMap.set(String(r.id), r);
    }
  }

  const resolve = (resourceId: string): ResourceLike | null | undefined => {
    if (getResource) return getResource(resourceId);
    return staticMap.get(String(resourceId));
  };

  return {
    id: 'manual',
    refreshIntervalMs: 0,
    fetchLocation(resourceId) {
      const resource = resolve(resourceId);
      return Promise.resolve(toLocationData(resource?.meta?.[metaKey]));
    },
  };
}

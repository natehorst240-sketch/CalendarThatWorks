/**
 * Build the dispatch view's render-time data from the calendar's existing
 * event + asset streams. The view itself is asset-agnostic — it just needs:
 *
 *   - a list of unique assets (sidebar rows)
 *   - their stops over time (map markers + breadcrumbs)
 *   - the facilities those stops happen at (anchor circles on the map)
 *
 * Position lives in `event.meta.lat / event.meta.lng`. Facility identity
 * in `event.meta.facilityCode` (string). Stop kind in
 * `event.meta.stopType` ('arrival' | 'departure'). These are the
 * conventions the truck demo uses; any host can populate the same fields
 * for their domain (planes, crews, drones).
 */
import type { NormalizedEvent } from 'works-calendar-engine';
import type {
  DispatchAsset,
  DispatchFacility,
  DispatchSegment,
  DispatchStop,
} from './types';

/** Stable color fallback when an asset doesn't supply meta.color. */
const FALLBACK_PALETTE = [
  '#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#2980b9',
  '#8e44ad', '#c0392b', '#d35400', '#16a085', '#2c3e50',
];

interface RawAssetEntry {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly meta?: Record<string, unknown>;
}

function pickColor(meta: Record<string, unknown> | undefined, index: number): string {
  const m = meta?.['color'];
  if (typeof m === 'string' && m.startsWith('#')) return m;
  return FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]!;
}

function extractCoord(event: NormalizedEvent, key: 'lat' | 'lng'): number | null {
  const v = event.meta?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function extractFacility(event: NormalizedEvent): { code: string; name: string } | null {
  const code = event.meta?.['facilityCode'];
  if (typeof code !== 'string' || !code) return null;
  const name = event.meta?.['facilityName'];
  return {
    code,
    name: typeof name === 'string' && name ? name : code,
  };
}

function extractStopKind(event: NormalizedEvent): 'arrival' | 'departure' {
  const v = event.meta?.['stopType'];
  return v === 'departure' ? 'departure' : 'arrival';
}

export interface DerivedDispatchData {
  readonly assets: DispatchAsset[];
  readonly facilities: DispatchFacility[];
  readonly stopsByAsset: ReadonlyMap<string, DispatchStop[]>;
  readonly segmentsByAsset: ReadonlyMap<string, DispatchSegment[]>;
}

export function deriveDispatchData(
  events: readonly NormalizedEvent[],
  assets: readonly RawAssetEntry[] = [],
): DerivedDispatchData {
  // ── Assets ── union of declared assets and event.resource ids ──
  const assetIndex = new Map<string, DispatchAsset>();
  assets.forEach((a, i) => {
    assetIndex.set(a.id, { id: a.id, name: a.label, color: pickColor(a.meta, i) });
  });
  events.forEach((ev) => {
    const id = ev.resource;
    if (!id || assetIndex.has(id)) return;
    assetIndex.set(id, { id, name: id, color: pickColor(undefined, assetIndex.size) });
  });

  // ── Facilities ── unique by code, location pulled from the first event mentioning them
  const facilityIndex = new Map<string, DispatchFacility>();
  for (const ev of events) {
    const f = extractFacility(ev);
    if (!f || facilityIndex.has(f.code)) continue;
    const lat = extractCoord(ev, 'lat');
    const lng = extractCoord(ev, 'lng');
    if (lat == null || lng == null) continue;
    facilityIndex.set(f.code, { code: f.code, name: f.name, lat, lng });
  }

  // ── Stops ── one per event with valid coords; sorted by time per asset
  const stopsByAsset = new Map<string, DispatchStop[]>();
  for (const ev of events) {
    if (!ev.resource) continue;
    const lat = extractCoord(ev, 'lat');
    const lng = extractCoord(ev, 'lng');
    if (lat == null || lng == null) continue;
    const facility = extractFacility(ev);
    if (!facility) continue;
    const list = stopsByAsset.get(ev.resource) ?? [];
    list.push({
      event: ev,
      assetId: ev.resource,
      facilityCode: facility.code,
      time: ev.start,
      lat,
      lng,
      kind: extractStopKind(ev),
    });
    stopsByAsset.set(ev.resource, list);
  }
  for (const list of stopsByAsset.values()) {
    list.sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  // ── Segments ── pair adjacent stops that move between facilities
  const segmentsByAsset = new Map<string, DispatchSegment[]>();
  for (const [assetId, stops] of stopsByAsset) {
    const segs: DispatchSegment[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i]!;
      const b = stops[i + 1]!;
      if (a.facilityCode === b.facilityCode) continue;
      segs.push({ assetId, from: a, to: b });
    }
    segmentsByAsset.set(assetId, segs);
  }

  return {
    assets: Array.from(assetIndex.values()),
    facilities: Array.from(facilityIndex.values()),
    stopsByAsset,
    segmentsByAsset,
  };
}

/** Interpolate an asset's position between its adjacent stops at time `t`. */
export function positionAt(
  stops: readonly DispatchStop[] | undefined,
  t: Date,
): { lat: number; lng: number; facilityCode?: string; moving: boolean } | null {
  if (!stops || stops.length === 0) return null;
  const tMs = t.getTime();
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (tMs <= first.time.getTime()) {
    return { lat: first.lat, lng: first.lng, facilityCode: first.facilityCode, moving: false };
  }
  if (tMs >= last.time.getTime()) {
    return { lat: last.lat, lng: last.lng, facilityCode: last.facilityCode, moving: false };
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (tMs < a.time.getTime() || tMs > b.time.getTime()) continue;
    if (a.facilityCode === b.facilityCode) {
      return { lat: a.lat, lng: a.lng, facilityCode: a.facilityCode, moving: false };
    }
    const span = b.time.getTime() - a.time.getTime();
    const p = span === 0 ? 0 : (tMs - a.time.getTime()) / span;
    return {
      lat: a.lat + (b.lat - a.lat) * p,
      lng: a.lng + (b.lng - a.lng) * p,
      moving: true,
    };
  }
  return null;
}

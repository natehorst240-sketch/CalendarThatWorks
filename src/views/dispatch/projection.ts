/**
 * Fixed-bounds linear lat/lng → SVG projection per zoom layer.
 *
 * No tiles, no WebGL — each layer has its own bounds and projects
 * coordinates into the SVG viewBox with straight interpolation.
 * Adding a new layer = new bounds entry + (eventually) a hand-traced
 * background SVG.
 */

import type { LayerBounds, MapLayer } from './types';

// SW US corridor default — the truck demo dataset is calibrated to this.
// Host apps with different geography override via DispatchView props.
export const REGION_BOUNDS: LayerBounds = {
  sw: { lat: 31.0, lng: -119.5 },
  ne: { lat: 37.5, lng: -106.0 },
};

export const STATE_BOUNDS: LayerBounds = {
  sw: { lat: 31.3, lng: -114.9 },
  ne: { lat: 37.1, lng: -109.0 },
};

export const FIVE_K_BOUNDS: LayerBounds = {
  sw: { lat: 32.9, lng: -112.7 },
  ne: { lat: 34.0, lng: -111.4 },
};

export const ONE_K_BOUNDS: LayerBounds = {
  sw: { lat: 33.40, lng: -112.13 },
  ne: { lat: 33.50, lng: -112.02 },
};

export const DEFAULT_LAYER_BOUNDS: Record<MapLayer, LayerBounds> = {
  region: REGION_BOUNDS,
  state: STATE_BOUNDS,
  '5k': FIVE_K_BOUNDS,
  '1k': ONE_K_BOUNDS,
};

export function project(
  bounds: LayerBounds,
  lat: number,
  lng: number,
  w: number,
  h: number,
): [number, number] {
  const x = ((lng - bounds.sw.lng) / (bounds.ne.lng - bounds.sw.lng)) * w;
  const y = h - ((lat - bounds.sw.lat) / (bounds.ne.lat - bounds.sw.lat)) * h;
  return [x, y];
}

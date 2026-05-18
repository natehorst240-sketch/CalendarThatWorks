/**
 * OpenStreetMap raster tile helpers for the tactical map background.
 *
 * Computes the slippy-map tiles that cover a given lat/lng bounds at a
 * chosen zoom, returning each tile's image URL plus its NW/SE lat/lng
 * corners so the caller can project them into SVG coordinates and
 * lay the tile as an <image> element.
 *
 * No dependencies. Tiles are served by OpenStreetMap's standard CDN
 * — fine for demo / light embedded use; production hosts should swap
 * in their own tile URL via the `tileUrl` template.
 */

import type { LayerBounds, MapLayer } from './types';

export interface TileRect {
  /** Image URL for this tile. */
  readonly url: string;
  /** NW corner lat/lng. */
  readonly nw: { lat: number; lng: number };
  /** SE corner lat/lng. */
  readonly se: { lat: number; lng: number };
  /** Slippy-map z / x / y — handy for keys and debugging. */
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

/** Per-layer default zoom — chosen to land ~6–25 tiles inside the bounds. */
export const DEFAULT_LAYER_ZOOM: Record<MapLayer, number> = {
  region: 5,
  state: 6,
  '5k': 9,
  '1k': 12,
};

const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function lng2tileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

function lat2tileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

function tileX2lng(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileY2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tilesForBounds(
  bounds: LayerBounds,
  zoom: number,
  tileUrl: string = DEFAULT_TILE_URL,
): TileRect[] {
  const xMin = Math.floor(lng2tileX(bounds.sw.lng, zoom));
  const xMax = Math.floor(lng2tileX(bounds.ne.lng, zoom));
  // y is inverted: NE lat → top tile, SW lat → bottom tile
  const yMin = Math.floor(lat2tileY(bounds.ne.lat, zoom));
  const yMax = Math.floor(lat2tileY(bounds.sw.lat, zoom));

  const max = 2 ** zoom;
  const tiles: TileRect[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const wrappedX = ((x % max) + max) % max;
      if (y < 0 || y >= max) continue;
      tiles.push({
        url: tileUrl
          .replace('{z}', String(zoom))
          .replace('{x}', String(wrappedX))
          .replace('{y}', String(y)),
        nw: { lat: tileY2lat(y, zoom), lng: tileX2lng(x, zoom) },
        se: { lat: tileY2lat(y + 1, zoom), lng: tileX2lng(x + 1, zoom) },
        z: zoom,
        x: wrappedX,
        y,
      });
    }
  }
  return tiles;
}

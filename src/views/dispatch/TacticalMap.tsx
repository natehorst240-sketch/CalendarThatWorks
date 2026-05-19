/**
 * Tactical map — fixed-zoom SVG projection of asset positions, breadcrumb
 * trails between stops, and animated conflict pulses at facilities.
 *
 * Ported from `demo/app/src/components/TacticalMap.tsx`. Asset-agnostic:
 * works for trucks, planes, employees, anything with a lat/lng-tagged
 * event stream.
 */
import { useMemo } from 'react';
import { project, DEFAULT_LAYER_BOUNDS } from './projection';
import { positionAt } from './deriveData';
import { DEFAULT_LAYER_ZOOM, tilesForBounds } from './tileLayer';
import type {
  DispatchAsset,
  DispatchConflict,
  DispatchFacility,
  DispatchSegment,
  DispatchStop,
  MapLayer,
} from './types';

interface Props {
  readonly assets: readonly DispatchAsset[];
  readonly facilities: readonly DispatchFacility[];
  readonly stopsByAsset: ReadonlyMap<string, DispatchStop[]>;
  readonly segmentsByAsset: ReadonlyMap<string, DispatchSegment[]>;
  readonly conflicts: readonly DispatchConflict[];
  readonly selectedDate: Date;
  readonly selectedAsset: string | null;
  readonly onSelectAsset: (id: string) => void;
  readonly layer: MapLayer;
  /** Render an OSM raster tile basemap underneath. Default true. */
  readonly showTiles?: boolean;
  /** Override the slippy-map tile URL ({z}/{x}/{y}). */
  readonly tileUrl?: string;
}

const VW = 1000;
const VH = 800;

export function TacticalMap({
  assets,
  facilities,
  stopsByAsset,
  segmentsByAsset,
  conflicts,
  selectedDate,
  selectedAsset,
  onSelectAsset,
  layer,
  showTiles = true,
  tileUrl,
}: Props) {
  const bounds = DEFAULT_LAYER_BOUNDS[layer];
  const proj = (lat: number, lng: number): [number, number] =>
    project(bounds, lat, lng, VW, VH);

  const tiles = useMemo(
    () =>
      showTiles
        ? tilesForBounds(bounds, DEFAULT_LAYER_ZOOM[layer], tileUrl)
        : [],
    [bounds, layer, showTiles, tileUrl],
  );

  const conflictsAtTime = useMemo(() => {
    const dayStart = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    return conflicts.filter((c) => {
      const t = c.timeA.getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    });
  }, [conflicts, selectedDate]);

  const assetColorById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) m.set(a.id, a.color);
    return m;
  }, [assets]);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full" style={{ background: '#e8dcc8' }}>
      <defs>
        <filter id="dispatch-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves={2} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2} />
        </filter>
        {/* Soft drop shadow for the arched breadcrumbs to read as
            lifted above the ground plane. */}
        <filter id="dispatch-arch-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={1.2} />
          <feOffset dy={1.5} result="off" />
          <feComponentTransfer>
            <feFuncA type="linear" slope={0.35} />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={VW} height={VH} fill="#e8dcc8" />

      {/* OSM raster tile basemap — each tile is placed by projecting its
          NW/SE corners through the current layer's bounds. Tiles render
          in their natural OSM colors so labels stay legible; a translucent
          warm overlay below the data layer ties them to the dispatch
          parchment palette without softening the map text. */}
      {tiles.length > 0 && (
        <>
          <g>
            {tiles.map((t) => {
              const [x1, y1] = proj(t.nw.lat, t.nw.lng);
              const [x2, y2] = proj(t.se.lat, t.se.lng);
              const w = x2 - x1;
              const h = y2 - y1;
              return (
                <image
                  key={`${t.z}-${t.x}-${t.y}`}
                  href={t.url}
                  x={x1}
                  y={y1}
                  width={w}
                  height={h}
                  preserveAspectRatio="none"
                  crossOrigin="anonymous"
                  style={{ imageRendering: 'auto' }}
                />
              );
            })}
          </g>
          {/* Faint parchment wash — pulls the OSM palette toward the
              dispatch theme without blurring the underlying labels. */}
          <rect width={VW} height={VH} fill="#e8dcc8" opacity={0.22} />
        </>
      )}

      {/* Layer-name watermark for the non-region zoom presets, since the
          hand-traced state outlines are gone now. */}
      {layer !== 'region' && (
        <text
          x={VW / 2}
          y={36}
          textAnchor="middle"
          fontFamily="serif"
          fontSize={12}
          fill="#5a3e2b"
          letterSpacing={2}
          opacity={0.55}
        >
          {layer.toUpperCase()} VIEW
        </text>
      )}

      {/* Breadcrumb segments — rendered as a quadratic Bezier arch that
          lifts off the ground plane, giving an origin→destination "flight
          path" feel without needing real road routing. Past legs render
          solid + colored; future legs dashed + dim. A faint shadow ellipse
          under each apex reinforces the 3D read.

          Off-screen culling: at zoomed-in layers (5k / 1k) most segments
          have endpoints far outside the viewBox. The arches still need to
          render when they cross the visible area, but segments whose
          entire bounding box sits beyond a generous margin are dropped.
          Avoids painting hundreds of paths with multi-thousand-pixel
          coordinates — combined with the SVG ink filter that was crashing
          iOS Safari when switching from region → 5k. */}
      {assets.flatMap((asset) => {
        const segs = segmentsByAsset.get(asset.id) ?? [];
        const isSelected = asset.id === selectedAsset;
        const baseOpacity = selectedAsset ? (isSelected ? 1 : 0.015) : 0.35;
        return segs.map((seg, i) => {
          const [x1, y1] = proj(seg.from.lat, seg.from.lng);
          const [x2, y2] = proj(seg.to.lat, seg.to.lng);
          const MARGIN = 200;
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);
          if (maxX < -MARGIN || minX > VW + MARGIN || maxY < -MARGIN || minY > VH + MARGIN) {
            return null;
          }
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          // Arch height scales with leg length, capped so cross-region
          // hops don't balloon off-screen. Always bowed upward (−y).
          const archH = Math.min(Math.max(len * 0.22, 12), 80);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          // Perpendicular unit vector, biased upward (negative y) so the
          // arch consistently lifts toward the top of the viewBox.
          const nx = len === 0 ? 0 : -dy / len;
          const ny = len === 0 ? -1 : dx / len;
          const upBias = ny < 0 ? 1 : -1;
          const cx = midX + nx * archH * upBias;
          const cy = midY + ny * archH * upBias;
          const past = seg.to.time.getTime() <= selectedDate.getTime();
          const stroke = isSelected ? 2.5 : 1.5;
          const opacity = past
            ? isSelected
              ? 1
              : (0.55 * baseOpacity) / 0.35
            : isSelected
              ? 0.55
              : (0.18 * baseOpacity) / 0.35;
          const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
          return (
            <g key={`${asset.id}-${i}`} opacity={opacity}>
              {/* Ground shadow — slim ellipse along the great-circle base. */}
              {(isSelected || !selectedAsset) && (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#3d2b1f"
                  strokeWidth={0.8}
                  strokeDasharray="1,4"
                  opacity={0.25}
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={asset.color}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={past ? 'none' : '5,4'}
                {...(isSelected ? { filter: 'url(#dispatch-arch-shadow)' } : {})}
              />
            </g>
          );
        });
      })}

      {/* Conflict pulses at facilities with engine-detected violations today */}
      {(() => {
        const byFac: Record<string, number> = {};
        for (const c of conflictsAtTime) {
          byFac[c.facilityCode] = (byFac[c.facilityCode] ?? 0) + 1;
        }
        return Object.entries(byFac).map(([code, count]) => {
          const fac = facilities.find((f) => f.code === code);
          if (!fac) return null;
          const [x, y] = proj(fac.lat, fac.lng);
          return (
            <g key={`conflict-${code}`}>
              <circle cx={x} cy={y} r={20} fill="none" stroke="#c0392b" strokeWidth={2} strokeDasharray="4,3" opacity={0.4}>
                <animate attributeName="r" values="16;24;16" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx={x} cy={y} r={10} fill="#c0392b" opacity={0.9} stroke="#fff" strokeWidth={1.5} />
              <text y={y - 14} x={x} textAnchor="middle" fontSize={9} fill="#c0392b" fontWeight="bold" fontFamily="sans-serif">
                {count}
              </text>
            </g>
          );
        });
      })()}

      {/* Facility anchors */}
      {facilities.map((fac) => {
        const [x, y] = proj(fac.lat, fac.lng);
        return (
          <g key={fac.code} transform={`translate(${x},${y})`}>
            <circle r={8} fill="#fff" stroke="#3d2b1f" strokeWidth={1.5} filter="url(#dispatch-ink)" />
            <text y={-12} textAnchor="middle" fontFamily="serif" fontSize={12} fill="#3d2b1f" fontWeight="bold">
              {fac.code}
            </text>
            {fac.capacity != null && (
              <text y={20} textAnchor="middle" fontFamily="sans-serif" fontSize={8} fill="#5a3e2b">
                {fac.capacity} docks
              </text>
            )}
          </g>
        );
      })}

      {/* Asset markers — interpolated position at the selected time */}
      {assets.map((asset) => {
        const pos = positionAt(stopsByAsset.get(asset.id), selectedDate);
        if (!pos) return null;
        const [x, y] = proj(pos.lat, pos.lng);
        const isSelected = asset.id === selectedAsset;
        const color = assetColorById.get(asset.id) ?? '#3d2b1f';
        return (
          <g
            key={asset.id}
            transform={`translate(${x},${y})`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAsset(isSelected ? '' : asset.id);
            }}
            style={{ cursor: 'pointer', opacity: selectedAsset ? (isSelected ? 1 : 0.15) : 1 }}
          >
            <circle
              r={isSelected ? 12 : selectedAsset ? 4 : 7}
              fill={color}
              stroke="#fff"
              strokeWidth={isSelected ? 3 : 1.5}
              filter="url(#dispatch-ink)"
            >
              {isSelected && <animate attributeName="r" values="10;14;10" dur="1.5s" repeatCount="indefinite" />}
            </circle>
            {(isSelected || !selectedAsset) && (
              <text y={-16} textAnchor="middle" fontFamily="sans-serif" fontSize={isSelected ? 11 : 9} fill="#3d2b1f" fontWeight="bold">
                {asset.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

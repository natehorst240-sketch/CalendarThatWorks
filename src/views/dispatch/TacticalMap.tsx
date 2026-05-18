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
}: Props) {
  const bounds = DEFAULT_LAYER_BOUNDS[layer];
  const proj = (lat: number, lng: number): [number, number] =>
    project(bounds, lat, lng, VW, VH);

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
      </defs>

      <rect width={VW} height={VH} fill="#e8dcc8" />

      {/* Hand-traced background only renders for the region layer; other layers
          get a dashed-bounds frame placeholder until per-layer SVGs land. */}
      {layer === 'region' && (
        <g filter="url(#dispatch-ink)" opacity={0.3}>
          {/* AZ / NM / CA / NV outlines — first-pass tracings */}
          <path d="M 380 380 L 420 200 L 520 180 L 580 380 L 520 520 L 420 500 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
          <path d="M 580 380 L 520 180 L 720 160 L 780 360 L 720 500 L 620 480 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
          <path d="M 80 100 L 180 80 L 220 200 L 180 400 L 100 500 L 60 400 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
          <path d="M 220 200 L 320 180 L 380 380 L 320 420 L 220 400 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
        </g>
      )}
      {layer !== 'region' && (
        <g opacity={0.4}>
          <rect x={20} y={20} width={VW - 40} height={VH - 40} fill="none" stroke="#5a3e2b" strokeWidth={1} strokeDasharray="6,4" />
          <text x={VW / 2} y={50} textAnchor="middle" fontFamily="serif" fontSize={14} fill="#5a3e2b" letterSpacing={2}>
            {layer.toUpperCase()} VIEW
          </text>
        </g>
      )}

      {/* Breadcrumb segments — solid + colored for past travel, dashed + faded for future */}
      {assets.flatMap((asset) => {
        const segs = segmentsByAsset.get(asset.id) ?? [];
        const isSelected = asset.id === selectedAsset;
        const opacity = selectedAsset ? (isSelected ? 1 : 0.015) : 0.35;
        return segs.map((seg, i) => {
          const [x1, y1] = proj(seg.from.lat, seg.from.lng);
          const [x2, y2] = proj(seg.to.lat, seg.to.lng);
          const past = seg.to.time.getTime() <= selectedDate.getTime();
          return (
            <line
              key={`${asset.id}-${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={asset.color}
              strokeWidth={isSelected ? 3 : 1.5}
              strokeDasharray={past ? 'none' : '4,3'}
              opacity={past ? (isSelected ? 1 : 0.5 * opacity / 0.35) : (isSelected ? 0.5 : 0.15 * opacity / 0.35)}
              filter="url(#dispatch-ink)"
            />
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

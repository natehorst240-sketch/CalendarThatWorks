import { useMemo } from "react";
import {
  FACILITIES, TRUCKS, TRUCK_ROUTES,
  project, LAYER_BOUNDS,
  ALL_CONFLICTS, getTruckPositionAtTime,
} from "@/data/trucks";
import type { MapLayer, RouteSegment, LayerBounds } from "@/data/trucks";

interface Props {
  selectedDate: Date;
  selectedTruck: string | null;
  onSelectTruck: (id: string) => void;
  layer: MapLayer;
}

const VW = 1000;
const VH = 800;

export default function TacticalMap({ selectedDate, selectedTruck, onSelectTruck, layer }: Props) {
  const bounds = LAYER_BOUNDS[layer];
  const proj = (lat: number, lng: number): [number, number] => project(bounds, lat, lng, VW, VH);
  const conflictsAtTime = useMemo(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    return ALL_CONFLICTS.filter((c) => {
      const t = new Date(c.timeA);
      return t >= dayStart && t < dayEnd;
    });
  }, [selectedDate]);



  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="w-full h-full"
      style={{ background: "#e8dcc8" }}
    >
      <defs>
        <filter id="ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves={2} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={2} />
        </filter>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Parchment texture overlay */}
      <rect width={VW} height={VH} fill="#e8dcc8" />
      <rect width={VW} height={VH} fill="url(#grain)" opacity={0.08} />

      {/* Background paths — currently hand-traced against region viewBox coords.
          Re-projecting them per layer is a bigger refactor (need lat/lng source
          data); for state/5k/1k they'd render wrong, so gate on region only. */}
      {layer === "region" && (
        <>
          {/* State boundaries (simplified) */}
          <g filter="url(#ink)" opacity={0.3}>
            {/* Arizona */}
            <path d="M 380 380 L 420 200 L 520 180 L 580 380 L 520 520 L 420 500 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
            {/* New Mexico */}
            <path d="M 580 380 L 520 180 L 720 160 L 780 360 L 720 500 L 620 480 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
            {/* California */}
            <path d="M 80 100 L 180 80 L 220 200 L 180 400 L 100 500 L 60 400 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
            {/* Nevada */}
            <path d="M 220 200 L 320 180 L 380 380 L 320 420 L 220 400 Z" fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
          </g>

          {/* Highway corridors */}
          <g filter="url(#ink)" opacity={0.35}>
            <polyline points={["180,400","280,380","380,380","450,380","580,380","720,500"].join(" ")} fill="none" stroke="#5a3e2b" strokeWidth={2} />
            <polyline points={"180,400 280,380 380,380 520,180 720,160"} fill="none" stroke="#5a3e2b" strokeWidth={2} />
            <polyline points={"120,500 180,400 280,380 320,220 380,380"} fill="none" stroke="#5a3e2b" strokeWidth={2} />
            <line x1={380} y1={380} x2={520} y2={180} stroke="#5a3e2b" strokeWidth={1.5} />
            <polyline points={"120,500 200,480 320,420 380,380"} fill="none" stroke="#5a3e2b" strokeWidth={1.5} />
          </g>
        </>
      )}

      {/* Off-region layers — show the bounds as a faint frame so the user
          knows what they're looking at while we build out per-layer SVGs. */}
      {layer !== "region" && (
        <g opacity={0.4}>
          <rect x={20} y={20} width={VW - 40} height={VH - 40} fill="none" stroke="#5a3e2b" strokeWidth={1} strokeDasharray="6,4" />
          <text x={VW / 2} y={50} textAnchor="middle" fontFamily="serif" fontSize={14} fill="#5a3e2b" letterSpacing={2}>
            {layer.toUpperCase()} VIEW
          </text>
        </g>
      )}

      {/* Route segments (breadcrumbs) — ONLY traveled path up to selected time */}
      {TRUCK_ROUTES.map((route) => {
        if (route.weekIndex > 0) return null;
        const isSelected = route.truck.id === selectedTruck;
        const opacity = selectedTruck ? (isSelected ? 1 : 0.015) : 0.35;
        // Filter: only show segments where depart <= selectedDate
        const traveledSegments = route.segments.filter((seg) => new Date(seg.depart).getTime() <= selectedDate.getTime());
        if (traveledSegments.length === 0) return null;
        return (
          <g key={route.truck.id} opacity={opacity}>
            {traveledSegments.map((seg, i) => (
              <SegmentLine key={i} seg={seg} color={route.truck.color} isSelected={isSelected} selectedDate={selectedDate} bounds={bounds} />
            ))}
          </g>
        );
      })}

      {/* Conflict overlay — render at the FACILITY where conflicts occur */}
      {(() => {
        const facConflicts: Record<string, number> = {};
        for (const c of conflictsAtTime) {
          facConflicts[c.facility] = (facConflicts[c.facility] || 0) + 1;
        }
        return Object.entries(facConflicts).map(([fac, count]) => {
          const facility = FACILITIES[fac];
          if (!facility) return null;
          const [x, y] = proj(facility.lat, facility.lng);
          return (
            <g key={`conflict-${fac}`}>
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

      {/* Facility markers */}
      {Object.values(FACILITIES).map((fac) => {
        const [x, y] = proj(fac.lat, fac.lng);
        return (
          <g key={fac.code} transform={`translate(${x},${y})`}>
            <circle r={8} fill="#fff" stroke="#3d2b1f" strokeWidth={1.5} filter="url(#ink)" />
            <text y={-12} textAnchor="middle" fontFamily="serif" fontSize={12} fill="#3d2b1f" fontWeight="bold">
              {fac.code}
            </text>
            <text y={20} textAnchor="middle" fontFamily="sans-serif" fontSize={8} fill="#5a3e2b">
              {fac.docks} docks
            </text>
          </g>
        );
      })}

      {/* Truck position markers */}
      {TRUCKS.map((truck) => {
        const pos = getTruckPositionAtTime(truck.id, selectedDate);
        if (!pos) return null;
        const [x, y] = proj(pos.lat, pos.lng);
        const isSelected = truck.id === selectedTruck;
        return (
          <g
            key={truck.id}
            transform={`translate(${x},${y})`}
            onClick={(e) => { e.stopPropagation(); onSelectTruck(isSelected ? "" : truck.id); }}
            style={{ cursor: "pointer", opacity: selectedTruck ? (isSelected ? 1 : 0.15) : 1 }}
          >
            <circle r={isSelected ? 12 : (selectedTruck ? 4 : 7)} fill={truck.color} stroke="#fff" strokeWidth={isSelected ? 3 : 1.5} filter="url(#ink)">
              {isSelected && <animate attributeName="r" values="10;14;10" dur="1.5s" repeatCount="indefinite" />}
            </circle>
            {(isSelected || !selectedTruck) && (
              <text y={-16} textAnchor="middle" fontFamily="sans-serif" fontSize={isSelected ? 11 : 9} fill="#3d2b1f" fontWeight="bold">
                {truck.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SegmentLine({ seg, color, isSelected, selectedDate, bounds }: { seg: RouteSegment; color: string; isSelected: boolean; selectedDate: Date; bounds: LayerBounds }) {
  const [x1, y1] = project(bounds, seg.fromLat, seg.fromLng, VW, VH);
  const [x2, y2] = project(bounds, seg.toLat, seg.toLng, VW, VH);
  const arriveTime = new Date(seg.arrive).getTime();
  const isFullyPast = arriveTime <= selectedDate.getTime();
  const stroke = isFullyPast ? color : color;
  const dash = isFullyPast ? "none" : "4,3";
  const opacity = isFullyPast ? (isSelected ? 1 : 0.5) : (isSelected ? 0.5 : 0.15);

  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={stroke} strokeWidth={isSelected ? 3 : 1.5} strokeDasharray={dash} opacity={opacity}
      filter="url(#ink)"
    />
  );
}

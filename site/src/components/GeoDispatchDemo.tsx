import { useState } from 'react';

// ─── Map geometry ─────────────────────────────────────────────────────────────
// Simplified PNW state outlines in a 530×340 viewBox.
const WA_PATH = 'M 30,20 L 370,20 L 370,145 L 310,145 L 310,110 L 190,110 L 190,145 L 30,145 Z';
const OR_PATH = 'M 30,145 L 310,145 L 310,270 L 30,270 Z';
const ID_PATH = 'M 310,20 L 430,20 L 430,110 L 490,110 L 490,320 L 310,320 L 310,270 L 310,145 Z';

// ─── City coordinates ─────────────────────────────────────────────────────────
const CITIES = {
  seattle:  { x: 85,  y: 80,  label: 'Seattle'  },
  portland: { x: 75,  y: 185, label: 'Portland' },
  boise:    { x: 400, y: 235, label: 'Boise'    },
  spokane:  { x: 310, y: 80,  label: 'Spokane'  },
  eugene:   { x: 70,  y: 225, label: 'Eugene'   },
} as const;

type CityKey = keyof typeof CITIES;

// ─── Trucks ───────────────────────────────────────────────────────────────────
const TRUCKS = [
  { id: 't1', name: 'Cascade Freight #1', base: 'seattle'  as CityKey, hazmat: true,  initialStatus: 'Available' },
  { id: 't2', name: 'Columbia Haul #2',   base: 'portland' as CityKey, hazmat: false, initialStatus: 'Available' },
  { id: 't3', name: 'High Desert #3',     base: 'boise'    as CityKey, hazmat: true,  initialStatus: 'On a run'  },
];

// ─── Step definitions ─────────────────────────────────────────────────────────
type TruckState = 'idle' | 'active' | 'dimmed' | 'enroute';

interface ArcDef {
  from: CityKey;
  to: CityKey;
  color: string;
  dim: boolean;
}

interface RequestDef {
  city: CityKey;
  label: string;
  hazmat: boolean;
  resolved: boolean;
}

interface StepDef {
  heading: string;
  subheading: string;
  requests: RequestDef[];
  truckStates: Record<string, TruckState>;
  truckStatuses: Record<string, string>;
  arcs: ArcDef[];
  cta: string;
  annotation?: string;
}

const STEPS: StepDef[] = [
  {
    heading: 'Three trucks. Real constraints.',
    subheading: 'Watch the dispatcher resolve two incoming requests — one hazmat, one standard.',
    requests: [],
    truckStates:   { t1: 'idle', t2: 'idle', t3: 'idle' },
    truckStatuses: { t1: 'Available', t2: 'Available', t3: 'On a run' },
    arcs: [],
    cta: 'Incoming request →',
  },
  {
    heading: 'Hazmat load — Spokane',
    subheading: 'Request requires a certified hazmat driver. System evaluates all available trucks.',
    requests: [{ city: 'spokane', label: 'Hazmat shipment', hazmat: true, resolved: false }],
    truckStates:   { t1: 'idle', t2: 'idle', t3: 'idle' },
    truckStatuses: { t1: 'Available · Hazmat ✓', t2: 'Available · No cert', t3: 'On a run' },
    arcs: [],
    cta: 'Run feasibility check →',
  },
  {
    heading: 'Two trucks eliminated immediately',
    subheading: 'Columbia Haul lacks hazmat cert. High Desert is already dispatched. Only Cascade Freight qualifies.',
    requests: [{ city: 'spokane', label: 'Hazmat shipment', hazmat: true, resolved: false }],
    truckStates:   { t1: 'active', t2: 'dimmed', t3: 'dimmed' },
    truckStatuses: { t1: 'Qualified →', t2: 'No hazmat cert ✗', t3: 'On a run ✗' },
    arcs: [
      { from: 'seattle',  to: 'spokane', color: '#22c55e', dim: false },
      { from: 'portland', to: 'spokane', color: '#ef4444', dim: true  },
      { from: 'boise',    to: 'spokane', color: '#ef4444', dim: true  },
    ],
    cta: 'Dispatch Cascade Freight #1 →',
    annotation: 'Cascade Freight #1 is closest and certified',
  },
  {
    heading: 'Cascade Freight #1 dispatched',
    subheading: 'En route to Spokane. Second request incoming: standard freight to Eugene.',
    requests: [
      { city: 'spokane', label: 'Hazmat shipment',  hazmat: true,  resolved: true  },
      { city: 'eugene',  label: 'Standard freight', hazmat: false, resolved: false },
    ],
    truckStates:   { t1: 'enroute', t2: 'active', t3: 'dimmed' },
    truckStatuses: { t1: 'En Route → Spokane', t2: 'Available — closest', t3: 'On a run' },
    arcs: [
      { from: 'seattle', to: 'spokane', color: '#6366f1', dim: false },
    ],
    cta: 'Dispatch Columbia Haul #2 →',
    annotation: 'No hazmat needed — Columbia Haul is 12 miles away',
  },
  {
    heading: '2 dispatches. 0 conflicts.',
    subheading: 'Both requests resolved. Constraints checked, nearest qualified truck assigned each time.',
    requests: [
      { city: 'spokane', label: 'Hazmat shipment',  hazmat: true,  resolved: true },
      { city: 'eugene',  label: 'Standard freight', hazmat: false, resolved: true },
    ],
    truckStates:   { t1: 'enroute', t2: 'enroute', t3: 'dimmed' },
    truckStatuses: { t1: 'En Route → Spokane', t2: 'En Route → Eugene', t3: 'On a run' },
    arcs: [
      { from: 'seattle',  to: 'spokane', color: '#6366f1', dim: false },
      { from: 'portland', to: 'eugene',  color: '#22c55e', dim: false },
    ],
    cta: 'Restart →',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function GeoDispatchDemo() {
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  function advance() {
    if (isLast) setStep(0);
    else setStep(s => s + 1);
  }

  return (
    <div>
      <div className="mb-10 text-center lg:text-left">
        <div className="text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-3">
          Geo dispatch engine
        </div>
        <h2 className="text-4xl font-bold mb-3">{current.heading}</h2>
        <p className="text-white/60 text-lg max-w-2xl">{current.subheading}</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* SVG Map */}
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0d0d1a] p-4">
          <svg viewBox="0 0 530 340" className="w-full" style={{ maxHeight: 400 }}>
            {/* State fills */}
            <path d={WA_PATH} fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="1.5" />
            <path d={OR_PATH} fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="1.5" />
            <path d={ID_PATH} fill="#1a1a2e" stroke="#2d2d4e" strokeWidth="1.5" />

            {/* State labels */}
            <text x="170" y="90"  fill="#3d3d5e" fontSize="14" fontWeight="600" textAnchor="middle">Washington</text>
            <text x="170" y="215" fill="#3d3d5e" fontSize="14" fontWeight="600" textAnchor="middle">Oregon</text>
            <text x="400" y="200" fill="#3d3d5e" fontSize="14" fontWeight="600" textAnchor="middle">Idaho</text>

            {/* Route arcs */}
            {current.arcs.map((arc, i) => {
              const from = CITIES[arc.from];
              const to   = CITIES[arc.to];
              const mx   = (from.x + to.x) / 2;
              const my   = (from.y + to.y) / 2 - 40;
              return (
                <path
                  key={i}
                  d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={arc.dim ? 1 : 2}
                  strokeOpacity={arc.dim ? 0.3 : 0.8}
                  strokeDasharray={arc.dim ? '4 4' : undefined}
                />
              );
            })}

            {/* Request pins */}
            {current.requests.map(req => {
              const city = CITIES[req.city];
              return (
                <g key={req.city}>
                  {!req.resolved && (
                    <>
                      <circle cx={city.x} cy={city.y} r="8" fill="#f97316" opacity="0.4">
                        <animate attributeName="r"       from="8"  to="20" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    </>
                  )}
                  <circle cx={city.x} cy={city.y} r="6" fill={req.resolved ? '#22c55e' : '#f97316'} />
                  {req.hazmat && !req.resolved && (
                    <text x={city.x} y={city.y - 12} fill="#f97316" fontSize="10" textAnchor="middle" fontWeight="bold">
                      ⚠ HAZMAT
                    </text>
                  )}
                  {req.resolved && (
                    <text x={city.x} y={city.y - 12} fill="#22c55e" fontSize="10" textAnchor="middle">✓</text>
                  )}
                </g>
              );
            })}

            {/* Truck markers */}
            {TRUCKS.map(truck => {
              const city  = CITIES[truck.base];
              const state = current.truckStates[truck.id]!;
              const color =
                state === 'active'  ? '#22c55e' :
                state === 'enroute' ? '#6366f1' :
                state === 'dimmed'  ? '#374151' :
                '#94a3b8';
              return (
                <g key={truck.id} opacity={state === 'dimmed' ? 0.35 : 1}>
                  <circle
                    cx={city.x} cy={city.y} r="10"
                    fill={color} fillOpacity="0.2"
                    stroke={color} strokeWidth="1.5"
                  />
                  <text x={city.x} y={city.y + 4} textAnchor="middle" fontSize="10">🚛</text>
                  <text x={city.x} y={city.y + 22} fill={color} fontSize="9" textAnchor="middle" fontWeight="500">
                    {city.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {TRUCKS.map(truck => {
            const state  = current.truckStates[truck.id]!;
            const status = current.truckStatuses[truck.id]!;
            const borderColor =
              state === 'active'  ? 'border-green-500/60'  :
              state === 'enroute' ? 'border-indigo-500/60' :
              state === 'dimmed'  ? 'border-white/5'       :
              'border-white/10';
            const textColor =
              state === 'active'  ? 'text-green-400'  :
              state === 'enroute' ? 'text-indigo-400' :
              'text-white/30';
            return (
              <div
                key={truck.id}
                className={`rounded-xl border ${borderColor} bg-white/5 p-3 transition-all duration-300`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${state === 'dimmed' ? 'text-white/30' : 'text-white'}`}>
                    {truck.name}
                  </span>
                  {truck.hazmat && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      HAZMAT
                    </span>
                  )}
                </div>
                <div className={`text-xs ${textColor}`}>{status}</div>
              </div>
            );
          })}

          {current.annotation && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-300">
              ℹ {current.annotation}
            </div>
          )}

          <button
            onClick={advance}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all bg-brand-600 hover:bg-brand-500 text-white mt-2"
          >
            {current.cta}
          </button>

          {/* Step dots */}
          <div className="flex justify-center gap-2 pt-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'bg-brand-400 w-4' : 'bg-white/20 w-1.5'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

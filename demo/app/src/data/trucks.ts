import {
  evaluateConflicts,
  type ConflictEvent,
  type EngineResource,
  type CapacityOverflowRule,
} from "works-calendar-engine";

// ── Types ───────────────────────────────────────────────────────────────────

export interface Facility {
  code: string;
  name: string;
  lat: number;
  lng: number;
  docks: number;
}

export interface Truck {
  id: string;
  name: string;
  hub: string;
  type: "dry_van" | "reefer" | "flatbed";
  capacity: number;
  color: string;
}

export interface RouteSegment {
  from: string;
  to: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  depart: string; // ISO
  arrive: string; // ISO
  distanceMiles: number;
  status: "historical" | "scheduled";
}

export interface TruckRoute {
  truck: Truck;
  weekIndex: number;
  segments: RouteSegment[];
}

export interface DockConflict {
  facility: string;
  truckA: string;
  truckB: string;
  timeA: string;
  timeB: string;
  hoursApart: number;
}

export interface MapStop {
  facility: string;
  type: "departure" | "arrival";
  time: string;
  lat: number;
  lng: number;
  truckId: string;
}

// ── Facilities ──────────────────────────────────────────────────────────────

export const FACILITIES: Record<string, Facility> = {
  PHX: { code: "PHX", name: "Phoenix DC", lat: 33.4484, lng: -112.074, docks: 6 },
  TUS: { code: "TUS", name: "Tucson Hub", lat: 32.2226, lng: -110.975, docks: 4 },
  ABQ: { code: "ABQ", name: "Albuquerque DC", lat: 35.0844, lng: -106.65, docks: 5 },
  ELP: { code: "ELP", name: "El Paso Terminal", lat: 31.7619, lng: -106.485, docks: 4 },
  LAS: { code: "LAS", name: "Las Vegas Hub", lat: 36.1699, lng: -115.14, docks: 5 },
  LAX: { code: "LAX", name: "Los Angeles DC", lat: 34.0522, lng: -118.244, docks: 8 },
  SAN: { code: "SAN", name: "San Diego Hub", lat: 32.7157, lng: -117.161, docks: 4 },
  FLG: { code: "FLG", name: "Flagstaff Depot", lat: 35.1983, lng: -111.651, docks: 3 },
  BAR: { code: "BAR", name: "Barstow Yard", lat: 34.8986, lng: -117.017, docks: 3 },
  KIN: { code: "KIN", name: "Kingman Stop", lat: 35.1894, lng: -114.053, docks: 2 },
};

// ── Trucks ──────────────────────────────────────────────────────────────────

export const TRUCKS: Truck[] = [
  { id: "T001", name: "Phoenix Runner 1", hub: "PHX", type: "dry_van", capacity: 28000, color: "#e74c3c" },
  { id: "T002", name: "Phoenix Runner 2", hub: "PHX", type: "dry_van", capacity: 28000, color: "#e67e22" },
  { id: "T003", name: "Phoenix Runner 3", hub: "PHX", type: "reefer", capacity: 26000, color: "#f39c12" },
  { id: "T004", name: "Desert Express 1", hub: "PHX", type: "flatbed", capacity: 24000, color: "#27ae60" },
  { id: "T005", name: "Desert Express 2", hub: "PHX", type: "dry_van", capacity: 28000, color: "#2980b9" },
  { id: "T006", name: "ABQ Hauler 1", hub: "ABQ", type: "dry_van", capacity: 28000, color: "#8e44ad" },
  { id: "T007", name: "ABQ Hauler 2", hub: "ABQ", type: "reefer", capacity: 26000, color: "#c0392b" },
  { id: "T008", name: "Hwy 40 Run 1", hub: "ABQ", type: "dry_van", capacity: 28000, color: "#d35400" },
  { id: "T009", name: "Hwy 40 Run 2", hub: "ABQ", type: "flatbed", capacity: 24000, color: "#16a085" },
  { id: "T010", name: "Mountain Runner", hub: "ABQ", type: "dry_van", capacity: 28000, color: "#2c3e50" },
  { id: "T011", name: "LA Freighter 1", hub: "LAX", type: "dry_van", capacity: 32000, color: "#e74c3c" },
  { id: "T012", name: "LA Freighter 2", hub: "LAX", type: "reefer", capacity: 26000, color: "#e67e22" },
  { id: "T013", name: "LA Freighter 3", hub: "LAX", type: "dry_van", capacity: 32000, color: "#f39c12" },
  { id: "T014", name: "I-15 Runner", hub: "LAX", type: "dry_van", capacity: 28000, color: "#27ae60" },
  { id: "T015", name: "Desert Corridor", hub: "LAX", type: "flatbed", capacity: 24000, color: "#2980b9" },
  { id: "T016", name: "Vegas Runner 1", hub: "LAS", type: "dry_van", capacity: 28000, color: "#8e44ad" },
  { id: "T017", name: "Vegas Runner 2", hub: "LAS", type: "reefer", capacity: 26000, color: "#c0392b" },
  { id: "T018", name: "Vegas Express", hub: "LAS", type: "dry_van", capacity: 28000, color: "#d35400" },
  { id: "T019", name: "Tucson Shuttle 1", hub: "TUS", type: "dry_van", capacity: 24000, color: "#16a085" },
  { id: "T020", name: "Tucson Shuttle 2", hub: "TUS", type: "dry_van", capacity: 24000, color: "#2c3e50" },
  { id: "T021", name: "Border Runner", hub: "TUS", type: "flatbed", capacity: 24000, color: "#e74c3c" },
  { id: "T022", name: "El Paso Runner", hub: "ELP", type: "dry_van", capacity: 28000, color: "#e67e22" },
  { id: "T023", name: "Border Express", hub: "ELP", type: "dry_van", capacity: 24000, color: "#f39c12" },
  { id: "T024", name: "San Diego Runner", hub: "SAN", type: "reefer", capacity: 26000, color: "#27ae60" },
  { id: "T025", name: "SoCal Express", hub: "SAN", type: "dry_van", capacity: 28000, color: "#2980b9" },
  { id: "T026", name: "Long Haul 1", hub: "PHX", type: "dry_van", capacity: 32000, color: "#8e44ad" },
  { id: "T027", name: "Long Haul 2", hub: "ABQ", type: "dry_van", capacity: 32000, color: "#c0392b" },
  { id: "T028", name: "Long Haul 3", hub: "PHX", type: "dry_van", capacity: 28000, color: "#d35400" },
  { id: "T029", name: "Long Haul 4", hub: "LAX", type: "reefer", capacity: 26000, color: "#16a085" },
  { id: "T030", name: "Long Haul 5", hub: "ELP", type: "dry_van", capacity: 28000, color: "#2c3e50" },
];

// ── Route Generator ─────────────────────────────────────────────────────────

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)) * 1.2 * 10) / 10;
}

function driveTime(miles: number): number {
  return Math.round((miles / 55) * 60 + 30);
}

const cache: Record<string, number> = {};
function getDist(a: string, b: string): number {
  const key = [a, b].sort().join("-");
  if (!cache[key]) {
    const fa = FACILITIES[a];
    const fb = FACILITIES[b];
    cache[key] = haversineMiles(fa.lat, fa.lng, fb.lat, fb.lng);
  }
  return cache[key];
}

function generateStopsForTruck(truck: Truck, weekOffset: number): MapStop[] {
  const hub = truck.hub;
  const baseDate = new Date(Date.UTC(2025, 6, 7 + weekOffset * 7)); // July 7, 2025
  const stops: MapStop[] = [];
  const rng = (seed: number) => {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };
  const rand = rng(truck.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0));

  const others = Object.keys(FACILITIES).filter((c) => c !== hub);
  const pick = (n: number) => {
    const shuffled = [...others].sort(() => rand() - 0.5);
    return shuffled.slice(0, n);
  };

  if (truck.id.startsWith("T026") || truck.id.startsWith("T027") || truck.id.startsWith("T028") || truck.id.startsWith("T029") || truck.id.startsWith("T030")) {
    const dests = pick(2);
    let t = new Date(baseDate.getTime() + 5 * 3600000);
    for (const dest of dests) {
      const dist = getDist(hub, dest);
      const drive = driveTime(dist);
      stops.push({ facility: hub, type: "departure", time: t.toISOString(), lat: FACILITIES[hub].lat, lng: FACILITIES[hub].lng, truckId: truck.id });
      t = new Date(t.getTime() + drive * 60000);
      stops.push({ facility: dest, type: "arrival", time: t.toISOString(), lat: FACILITIES[dest].lat, lng: FACILITIES[dest].lng, truckId: truck.id });
      t = new Date(t.getTime() + 12 * 3600000);
      const distBack = getDist(dest, hub);
      const driveBack = driveTime(distBack);
      stops.push({ facility: dest, type: "departure", time: t.toISOString(), lat: FACILITIES[dest].lat, lng: FACILITIES[dest].lng, truckId: truck.id });
      t = new Date(t.getTime() + driveBack * 60000);
      stops.push({ facility: hub, type: "arrival", time: t.toISOString(), lat: FACILITIES[hub].lat, lng: FACILITIES[hub].lng, truckId: truck.id });
      t = new Date(t.getTime() + 8 * 3600000);
    }
  } else if (["T008", "T009", "T014", "T023"].includes(truck.id)) {
    let corridor: string[];
    if (hub === "ABQ") corridor = ["ABQ", "FLG", "BAR", "LAX"];
    else if (hub === "LAX") corridor = ["LAX", "BAR", "FLG", "ABQ"];
    else corridor = [hub, "PHX", "LAS", "LAX"];
    let t = new Date(baseDate.getTime() + 4 * 3600000);
    for (let i = 0; i < corridor.length - 1; i++) {
      const from = corridor[i];
      const to = corridor[i + 1];
      if (i === 0) stops.push({ facility: from, type: "departure", time: t.toISOString(), lat: FACILITIES[from].lat, lng: FACILITIES[from].lng, truckId: truck.id });
      const dist = getDist(from, to);
      const drive = driveTime(dist);
      t = new Date(t.getTime() + drive * 60000);
      stops.push({ facility: to, type: "arrival", time: t.toISOString(), lat: FACILITIES[to].lat, lng: FACILITIES[to].lng, truckId: truck.id });
      t = new Date(t.getTime() + 2 * 3600000);
      if (i < corridor.length - 2) {
        stops.push({ facility: to, type: "departure", time: t.toISOString(), lat: FACILITIES[to].lat, lng: FACILITIES[to].lng, truckId: truck.id });
      }
    }
  } else {
    // hub_spoke or regional_loop
    const spokes = pick(3);
    let day = 0;
    for (const spoke of spokes) {
      if (day >= 5) break;
      const depart = new Date(baseDate.getTime() + day * 86400000 + 6 * 3600000);
      const dist = getDist(hub, spoke);
      const drive = driveTime(dist);
      const arrive = new Date(depart.getTime() + drive * 60000);
      stops.push({ facility: hub, type: "departure", time: depart.toISOString(), lat: FACILITIES[hub].lat, lng: FACILITIES[hub].lng, truckId: truck.id });
      stops.push({ facility: spoke, type: "arrival", time: arrive.toISOString(), lat: FACILITIES[spoke].lat, lng: FACILITIES[spoke].lng, truckId: truck.id });
      const retDepart = new Date(arrive.getTime() + 2 * 3600000);
      const retArrive = new Date(retDepart.getTime() + drive * 60000);
      stops.push({ facility: spoke, type: "departure", time: retDepart.toISOString(), lat: FACILITIES[spoke].lat, lng: FACILITIES[spoke].lng, truckId: truck.id });
      stops.push({ facility: hub, type: "arrival", time: retArrive.toISOString(), lat: FACILITIES[hub].lat, lng: FACILITIES[hub].lng, truckId: truck.id });
      day++;
    }
  }
  return stops;
}

// ── Build Routes ────────────────────────────────────────────────────────────

function stopsToSegments(stops: MapStop[]): RouteSegment[] {
  const segments: RouteSegment[] = [];
  const CUTOFF = new Date(Date.UTC(2025, 6, 11)); // July 11 = "today" boundary
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (s1.type === "departure" && s2.type === "arrival") {
      const arriveDate = new Date(s2.time);
      segments.push({
        from: s1.facility,
        to: s2.facility,
        fromLat: s1.lat,
        fromLng: s1.lng,
        toLat: s2.lat,
        toLng: s2.lng,
        depart: s1.time,
        arrive: s2.time,
        distanceMiles: getDist(s1.facility, s2.facility),
        status: arriveDate < CUTOFF ? "historical" : "scheduled",
      });
    }
  }
  return segments;
}

export const ALL_STOPS: MapStop[] = [];
export const TRUCK_ROUTES: TruckRoute[] = [];

for (const truck of TRUCKS) {
  for (let w = 0; w < 2; w++) {
    const stops = generateStopsForTruck(truck, w);
    ALL_STOPS.push(...stops);
    TRUCK_ROUTES.push({
      truck,
      weekIndex: w,
      segments: stopsToSegments(stops),
    });
  }
}

// ── Engine wire: dock occupancy as capacity-overflow ────────────────────────
//
// Each arrival occupies a dock for 2 hours after the truck pulls in. The
// engine's `capacity-overflow` rule fires when more events overlap on the
// same resource than capacity allows.
//
// The demo models each facility as a SINGLE shared dock (capacity = 1) so any
// two simultaneous arrivals surface as a conflict — that's the tight visual
// the dashboard was designed around. Facility.docks is kept for display
// (the sidebar shows "N docks" per facility).

const DOCK_HOLD_MS = 2 * 3600000;

const ENGINE_RESOURCES: ReadonlyMap<string, EngineResource> = new Map(
  Object.values(FACILITIES).map((f) => [
    f.code,
    { id: f.code, name: f.name, capacity: 1 } satisfies EngineResource,
  ]),
);

const CAPACITY_RULE: CapacityOverflowRule = {
  id: "facility-capacity",
  type: "capacity-overflow",
  severity: "hard",
};

interface ArrivalEvent extends ConflictEvent {
  readonly truckId: string;
}

const ARRIVAL_EVENTS: ArrivalEvent[] = ALL_STOPS
  .filter((s) => s.type === "arrival")
  .map((s, i) => {
    const start = new Date(s.time);
    const end = new Date(start.getTime() + DOCK_HOLD_MS);
    return {
      id: `arr-${i}`,
      start,
      end,
      resource: s.facility,
      truckId: s.truckId,
    };
  });

export function findConflicts(date: Date): DockConflict[] {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  // Limit the events sent to the engine to a window that brackets the day —
  // any arrival outside [dayStart - 2h, dayEnd] can't overlap anything inside.
  const windowStart = new Date(dayStart.getTime() - DOCK_HOLD_MS);
  const arrivalsInWindow = ARRIVAL_EVENTS.filter((e) => {
    const t = (e.start as Date).getTime();
    return t >= windowStart.getTime() && t < dayEnd.getTime();
  });

  const todayArrivals = arrivalsInWindow.filter((e) => {
    const t = (e.start as Date).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });

  const seen = new Set<string>();
  const conflicts: DockConflict[] = [];

  for (const proposed of todayArrivals) {
    const result = evaluateConflicts({
      proposed,
      events: arrivalsInWindow,
      rules: [CAPACITY_RULE],
      resources: ENGINE_RESOURCES,
    });
    if (result.violations.length === 0) continue;
    // capacity-overflow doesn't name the partner, so derive it locally —
    // the partners are the other arrivals on the same resource whose dock
    // hold window overlaps the proposed event.
    const ps = (proposed.start as Date).getTime();
    const pe = (proposed.end as Date).getTime();
    const partners = arrivalsInWindow.filter((e) => {
      if (e.id === proposed.id || e.resource !== proposed.resource) return false;
      const es = (e.start as Date).getTime();
      const ee = (e.end as Date).getTime();
      return es < pe && ee > ps;
    });
    for (const other of partners) {
      const pairKey = [proposed.id, other.id].sort().join("|");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const tA = (proposed.start as Date).getTime();
      const tB = (other.start as Date).getTime();
      conflicts.push({
        facility: proposed.resource as string,
        truckA: proposed.truckId,
        truckB: other.truckId,
        timeA: (proposed.start as Date).toISOString(),
        timeB: (other.start as Date).toISOString(),
        hoursApart: Math.round((Math.abs(tA - tB) / 3600000) * 100) / 100,
      });
    }
  }
  return conflicts;
}

// ── Projection ──────────────────────────────────────────────────────────────
//
// Fixed-bounds linear projection per layer. No tiles, no WebGL — each layer
// has its own bounds and projects lat/lng → SVG viewBox coordinates with
// straight interpolation. Adding a new layer = new bounds + new background.

export type MapLayer = "region" | "state" | "5k" | "1k";

export interface LayerBounds {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

export const REGION_BOUNDS: LayerBounds = {
  sw: { lat: 31.0, lng: -119.5 },
  ne: { lat: 37.5, lng: -106.0 },
};

// State view — zoomed to Arizona alone. Tighter bounds so the AZ outline
// fills the viewport and inter-facility lines have room to breathe.
export const STATE_BOUNDS: LayerBounds = {
  sw: { lat: 31.3, lng: -114.9 },
  ne: { lat: 37.1, lng: -109.0 },
};

// 5,000ft view — ~50-mile radius around PHX (the busiest facility).
export const FIVE_K_BOUNDS: LayerBounds = {
  sw: { lat: 32.9, lng: -112.7 },
  ne: { lat: 34.0, lng: -111.4 },
};

// 1,000ft view — facility-scale, ~5-mile box around PHX dock yard.
export const ONE_K_BOUNDS: LayerBounds = {
  sw: { lat: 33.40, lng: -112.13 },
  ne: { lat: 33.50, lng: -112.02 },
};

export const LAYER_BOUNDS: Record<MapLayer, LayerBounds> = {
  region: REGION_BOUNDS,
  state: STATE_BOUNDS,
  "5k": FIVE_K_BOUNDS,
  "1k": ONE_K_BOUNDS,
};

export function project(bounds: LayerBounds, lat: number, lng: number, w: number, h: number): [number, number] {
  const x = ((lng - bounds.sw.lng) / (bounds.ne.lng - bounds.sw.lng)) * w;
  const y = h - ((lat - bounds.sw.lat) / (bounds.ne.lat - bounds.sw.lat)) * h;
  return [x, y];
}

export function projectRegion(lat: number, lng: number, w: number, h: number): [number, number] {
  const x = ((lng - REGION_BOUNDS.sw.lng) / (REGION_BOUNDS.ne.lng - REGION_BOUNDS.sw.lng)) * w;
  const y = h - ((lat - REGION_BOUNDS.sw.lat) / (REGION_BOUNDS.ne.lat - REGION_BOUNDS.sw.lat)) * h;
  return [x, y];
}

// ── Interpolate position at a given time ────────────────────────────────────

export function getTruckPositionAtTime(truckId: string, time: Date): { lat: number; lng: number; facility?: string; moving: boolean } | null {
  const stops = ALL_STOPS.filter((s) => s.truckId === truckId).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  if (stops.length === 0) return null;

  const first = new Date(stops[0].time);
  const last = new Date(stops[stops.length - 1].time);
  if (time < first) return { lat: stops[0].lat, lng: stops[0].lng, facility: stops[0].facility, moving: false };
  if (time > last) return { lat: stops[stops.length - 1].lat, lng: stops[stops.length - 1].lng, facility: stops[stops.length - 1].facility, moving: false };

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    const t1 = new Date(s1.time).getTime();
    const t2 = new Date(s2.time).getTime();
    if (time.getTime() >= t1 && time.getTime() <= t2) {
      if (s1.facility === s2.facility) {
        return { lat: s1.lat, lng: s1.lng, facility: s1.facility, moving: false };
      }
      const progress = (time.getTime() - t1) / (t2 - t1);
      return {
        lat: s1.lat + (s2.lat - s1.lat) * progress,
        lng: s1.lng + (s2.lng - s1.lng) * progress,
        moving: true,
      };
    }
  }
  return null;
}

// ── Pre-computed all conflicts for display ──────────────────────────────────

export const ALL_CONFLICTS: DockConflict[] = [];
for (let d = 0; d < 14; d++) {
  const day = new Date(Date.UTC(2025, 6, 7 + d));
  ALL_CONFLICTS.push(...findConflicts(day));
}

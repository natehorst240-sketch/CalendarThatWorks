/**
 * Demo-only highway corridor graph.
 *
 * Pure data + lookup helpers that turn a (from-facility, to-facility) pair
 * into an ordered list of lat/lng waypoints following the actual Interstate
 * corridor. The dispatch view consumes these via the `getRouteWaypoints`
 * prop and draws an SVG polyline instead of the straight-line / arch
 * fallback, so a PHX → ELP leg traces real I-10 (PHX → TUS → ELP) instead
 * of crow's-flighting through the desert.
 *
 * This belongs in the demo — the engine doesn't know about roads. Hosts
 * shipping their own dispatch app can plug in OSRM / GraphHopper / a
 * floor plan / great-circle, whatever fits their domain. The dispatch
 * view only consumes the callback's output.
 */

export interface HighwayWaypoint {
  /** Facility code if this point is one of our demo facilities, otherwise
   *  a synthetic id naming the junction. */
  readonly code: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Major interstate corridors in the SW US, ordered by drive sequence.
 * Each entry lists the facility codes the corridor touches in one
 * direction; the lookup transparently handles the reverse.
 *
 * Picked corridors to cover the 30 demo trucks' usual lanes:
 *   - I-10  : LAX → PHX → TUS → ELP   (E/W spine)
 *   - I-40  : BAR → KIN → FLG → ABQ   (E/W northern)
 *   - I-15  : SAN → LAX(area) → BAR → LAS (N/S coast → desert)
 *   - I-17  : PHX → FLG               (vertical AZ)
 *   - I-8   : SAN → PHX               (southern E/W)
 *   - US-93 : LAS → KIN → PHX         (NV → AZ shortcut)
 */
const FACILITY_LATLNG: Record<string, { lat: number; lng: number }> = {
  PHX: { lat: 33.4484, lng: -112.074 },
  TUS: { lat: 32.2226, lng: -110.9747 },
  ABQ: { lat: 35.0844, lng: -106.6504 },
  ELP: { lat: 31.7619, lng: -106.485 },
  LAS: { lat: 36.1699, lng: -115.1398 },
  LAX: { lat: 34.0522, lng: -118.2437 },
  SAN: { lat: 32.7157, lng: -117.1611 },
  FLG: { lat: 35.1983, lng: -111.6513 },
  BAR: { lat: 34.8986, lng: -117.0173 },
  KIN: { lat: 35.1894, lng: -114.053 },
};

function pt(code: string): HighwayWaypoint {
  const ll = FACILITY_LATLNG[code];
  if (!ll) throw new Error(`unknown facility code: ${code}`);
  return { code, lat: ll.lat, lng: ll.lng };
}

export const HIGHWAYS: Record<string, readonly HighwayWaypoint[]> = {
  'I-10':  [pt('LAX'), pt('PHX'), pt('TUS'), pt('ELP')],
  'I-40':  [pt('BAR'), pt('KIN'), pt('FLG'), pt('ABQ')],
  'I-15':  [pt('SAN'), pt('LAX'), pt('BAR'), pt('LAS')],
  'I-17':  [pt('PHX'), pt('FLG')],
  'I-8':   [pt('SAN'), pt('PHX')],
  'US-93': [pt('LAS'), pt('KIN'), pt('PHX')],
};

/**
 * Single-corridor lookup. Returns the slice of waypoints between (and
 * including) `from` and `to` if they both live on the same corridor,
 * with order flipped if the truck is going against the corridor's
 * canonical direction. `null` means "no direct corridor" — caller can
 * fall back to a composite path or a straight line.
 */
function getDirectCorridorPath(from: string, to: string): readonly HighwayWaypoint[] | null {
  for (const corridor of Object.values(HIGHWAYS)) {
    const fi = corridor.findIndex((p) => p.code === from);
    const ti = corridor.findIndex((p) => p.code === to);
    if (fi === -1 || ti === -1 || fi === ti) continue;
    return fi < ti ? corridor.slice(fi, ti + 1) : corridor.slice(ti, fi + 1).reverse();
  }
  return null;
}

/**
 * Build an adjacency map: facility → list of {neighbor, corridorPath}
 * where corridorPath is the slice between them on some shared corridor.
 * Multi-corridor routes are then a BFS through this graph.
 */
function buildAdjacency(): Map<string, Array<{ to: string; path: readonly HighwayWaypoint[] }>> {
  const adj = new Map<string, Array<{ to: string; path: readonly HighwayWaypoint[] }>>();
  for (const corridor of Object.values(HIGHWAYS)) {
    for (let i = 0; i < corridor.length; i++) {
      for (let j = i + 1; j < corridor.length; j++) {
        const a = corridor[i]!.code;
        const b = corridor[j]!.code;
        const forward = corridor.slice(i, j + 1);
        const reverse = [...forward].reverse();
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a)!.push({ to: b, path: forward });
        adj.get(b)!.push({ to: a, path: reverse });
      }
    }
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

/**
 * BFS the corridor graph for the fewest-hops path from `from` to `to`.
 * Returns the stitched waypoint list (without duplicating shared
 * junctions where two corridors meet) or `null` if no path exists.
 */
function findCompositePath(from: string, to: string): readonly HighwayWaypoint[] | null {
  if (from === to) return null;
  type Frontier = { code: string; path: readonly HighwayWaypoint[] };
  const visited = new Set<string>([from]);
  const queue: Frontier[] = [{ code: from, path: [pt(from)] }];
  while (queue.length > 0) {
    const { code, path } = queue.shift()!;
    const neighbors = ADJACENCY.get(code) ?? [];
    for (const { to: next, path: edge } of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      // edge[0] === code (already in path), so skip the duplicate join.
      const stitched = path.concat(edge.slice(1));
      if (next === to) return stitched;
      queue.push({ code: next, path: stitched });
    }
  }
  return null;
}

/**
 * Public API used by the dispatch view's `getRouteWaypoints` prop.
 * Tries the cheap single-corridor lookup first, then BFS for composite
 * routes. Returns the full polyline (from-end to to-end inclusive) so
 * the renderer doesn't have to splice them in.
 */
export function getWaypoints(from: string, to: string): readonly HighwayWaypoint[] | null {
  return getDirectCorridorPath(from, to) ?? findCompositePath(from, to);
}

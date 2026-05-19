/**
 * Run the engine's `evaluateConflicts` across the dispatch view's stops
 * and reshape the result into a flat `DispatchConflict[]` keyed by
 * facility code + asset pair.
 *
 * Each arrival is treated as a dock-hold event. The occupancy window
 * defaults to 2 hours but the host can override per-stop by writing
 * `meta.unloadMinutes` on the underlying event (load-type-specific
 * unload durations: dry-van ≈ 45m, reefer ≈ 75m, flatbed ≈ 90m). The
 * trucking demo uses this to surface realistic dock collisions.
 * Facilities are `EngineResource`s with `capacity = 1` (any two
 * overlapping stops at the same facility = conflict).
 */
import {
  evaluateConflicts,
  type CapacityOverflowRule,
  type ConflictEvent,
  type EngineResource,
} from 'works-calendar-engine';
import type { DispatchConflict, DispatchFacility, DispatchStop } from './types';

const DEFAULT_DOCK_HOLD_MS = 2 * 3600_000;

const CAPACITY_RULE: CapacityOverflowRule = {
  id: 'dispatch-facility-capacity',
  type: 'capacity-overflow',
  severity: 'hard',
};

interface ArrivalEvent extends ConflictEvent {
  readonly assetId: string;
}

export function deriveConflicts(
  facilities: readonly DispatchFacility[],
  stopsByAsset: ReadonlyMap<string, readonly DispatchStop[]>,
): DispatchConflict[] {
  const resources: ReadonlyMap<string, EngineResource> = new Map(
    facilities.map((f) => [f.code, { id: f.code, name: f.name, capacity: 1 }]),
  );

  const arrivals: ArrivalEvent[] = [];
  let counter = 0;
  for (const stops of stopsByAsset.values()) {
    for (const stop of stops) {
      if (stop.kind !== 'arrival') continue;
      const unloadMinutes = stop.event.meta?.['unloadMinutes'];
      const holdMs = typeof unloadMinutes === 'number' && unloadMinutes > 0
        ? unloadMinutes * 60_000
        : DEFAULT_DOCK_HOLD_MS;
      arrivals.push({
        id: `arr-${counter++}`,
        start: stop.time,
        end: new Date(stop.time.getTime() + holdMs),
        resource: stop.facilityCode,
        assetId: stop.assetId,
      });
    }
  }

  const seen = new Set<string>();
  const conflicts: DispatchConflict[] = [];

  for (const proposed of arrivals) {
    const result = evaluateConflicts({
      proposed,
      events: arrivals,
      rules: [CAPACITY_RULE],
      resources,
    });
    if (result.violations.length === 0) continue;
    const ps = (proposed.start as Date).getTime();
    const pe = (proposed.end as Date).getTime();
    const partners = arrivals.filter((e) => {
      if (e.id === proposed.id || e.resource !== proposed.resource) return false;
      const es = (e.start as Date).getTime();
      const ee = (e.end as Date).getTime();
      return es < pe && ee > ps;
    });
    for (const other of partners) {
      const pairKey = [proposed.id, other.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      conflicts.push({
        facilityCode: proposed.resource as string,
        assetA: proposed.assetId,
        assetB: other.assetId,
        timeA: proposed.start as Date,
        timeB: other.start as Date,
      });
    }
  }
  return conflicts;
}

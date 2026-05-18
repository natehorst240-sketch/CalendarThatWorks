/**
 * Run the engine's `evaluateConflicts` across the dispatch view's stops
 * and reshape the result into a flat `DispatchConflict[]` keyed by
 * facility code + asset pair.
 *
 * The convention: each stop is treated as a dock-hold event with a
 * 2-hour occupancy window starting at the stop time. Facilities are
 * `EngineResource`s with `capacity = 1` (any two overlapping stops at
 * the same facility = conflict). Hosts that model differently can
 * supply their own rule set and skip this helper.
 */
import {
  evaluateConflicts,
  type CapacityOverflowRule,
  type ConflictEvent,
  type EngineResource,
} from 'works-calendar-engine';
import type { DispatchConflict, DispatchFacility, DispatchStop } from './types';

const DOCK_HOLD_MS = 2 * 3600_000;

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
      arrivals.push({
        id: `arr-${counter++}`,
        start: stop.time,
        end: new Date(stop.time.getTime() + DOCK_HOLD_MS),
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

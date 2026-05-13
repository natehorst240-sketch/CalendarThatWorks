# Conflict Detection

The conflict engine evaluates a proposed event against a set of existing events and returns a structured report of any rule violations. It is a standalone utility — call it from `onConflictCheck`, from a form's pre-save hook, or from any custom validation gate.

## `evaluateConflicts`

```ts
import { evaluateConflicts } from 'works-calendar';
import type { ConflictRule, ConflictEvent, EvaluateConflictsInput } from 'works-calendar';

const result = evaluateConflicts({
  proposed: proposedEvent,
  events:   existingEvents,
  rules,
  enabled:  true,          // default; pass false to short-circuit
  resources,               // optional — needed for CapacityOverflowRule
  now,                     // optional — for policy time-window checks
  holds,                   // optional — for HoldConflictRule
  holderId,                // optional — caller's session id
});
```

### `ConflictEvent`

```ts
interface ConflictEvent {
  id: string;
  start: Date;
  end: Date;
  resource?: string | null;
  category?: string | null;
  meta?: Record<string, unknown>;
}
```

### `ConflictEvaluationResult`

```ts
interface ConflictEvaluationResult {
  violations: Violation[];
  severity: 'none' | 'soft' | 'hard';
  allowed: boolean;          // true when severity !== 'hard'
}
```

## Rule types

### `ResourceOverlapRule`

Two events on the same resource overlap in time.

```ts
const rule: ConflictRule = {
  type: 'resource-overlap',
  id: 'no-double-book',
  severity: 'hard',          // optional; default 'hard'
};
```

### `CategoryMutexRule`

Two categories that cannot coexist in the same time window.

```ts
const rule: ConflictRule = {
  type: 'category-mutex',
  id: 'no-pto-during-mission',
  categories: ['pto', 'mission'],
  severity: 'hard',
};
```

### `MinRestRule`

A minimum gap (in minutes) between consecutive events on the same resource.

```ts
const rule: ConflictRule = {
  type: 'min-rest',
  id: 'eight-hour-rest',
  minutes: 480,
  severity: 'soft',
};
```

### `CapacityOverflowRule`

Total assigned units on a resource exceed its declared capacity.

```ts
const rule: ConflictRule = {
  type: 'capacity-overflow',
  id: 'hangar-capacity',
  resourceId: 'hangar-a',
  maxCapacity: 4,
  severity: 'soft',
};
```

### `OutsideBusinessHoursRule`

The proposed event falls outside configured working hours.

```ts
const rule: ConflictRule = {
  type: 'outside-business-hours',
  id: 'office-hours',
  businessHours: {
    days: [1, 2, 3, 4, 5],   // Mon–Fri
    start: '08:00',
    end:   '18:00',
  },
  severity: 'soft',
};
```

### `HoldConflictRule`

The proposed slot overlaps an active booking hold from another session.

```ts
const rule: ConflictRule = {
  type: 'hold-conflict',
  id: 'booking-hold',
  severity: 'soft',
};
// Also pass `holds` and `holderId` to evaluateConflicts
```

### `PolicyViolationRule`

Enforces advance notice, duration caps, and blackout dates.

```ts
const rule: ConflictRule = {
  type: 'policy-violation',
  id: 'booking-policy',
  minLeadTimeHours: 24,
  maxDurationHours: 8,
  maxAdvanceDays:   90,
  blackoutDates: ['2024-12-25', '2025-01-01'],
  severity: 'hard',
};
```

### `AvailabilityViolationRule`

The proposed event conflicts with a marked unavailability period on the resource.

```ts
const rule: ConflictRule = {
  type: 'availability-violation',
  id: 'maintenance-window',
  severity: 'hard',
};
```

## Wiring into `onConflictCheck`

```tsx
import { WorksCalendar, evaluateConflicts } from 'works-calendar';
import type { ConflictRule } from 'works-calendar';

const rules: ConflictRule[] = [
  { type: 'resource-overlap', id: 'no-double-book', severity: 'hard' },
  { type: 'min-rest', id: '8h-rest', minutes: 480, severity: 'soft' },
];

<WorksCalendar
  events={events}
  onConflictCheck={(proposed, existingEvents) => {
    return evaluateConflicts({ proposed, events: existingEvents, rules });
  }}
/>
```

## Full standalone example

```ts
import { evaluateConflicts } from 'works-calendar';
import type { ConflictEvent, ConflictRule } from 'works-calendar';

const proposed: ConflictEvent = {
  id: 'new',
  start: new Date('2024-11-01T09:00:00'),
  end:   new Date('2024-11-01T11:00:00'),
  resource: 'aircraft-001',
};

const existing: ConflictEvent[] = [
  {
    id: 'existing-1',
    start: new Date('2024-11-01T10:00:00'),
    end:   new Date('2024-11-01T12:00:00'),
    resource: 'aircraft-001',
  },
];

const rules: ConflictRule[] = [
  { type: 'resource-overlap', id: 'overlap', severity: 'hard' },
  { type: 'min-rest', id: 'rest', minutes: 60, severity: 'soft' },
];

const result = evaluateConflicts({ proposed, events: existing, rules });

console.log(result.severity);          // 'hard'
console.log(result.allowed);           // false
console.log(result.violations[0]?.message);
```

---

## Geo conflict detection

`evaluateGeoConflicts` checks whether a resource can physically travel between two consecutive events given their locations and a speed assumption.

### `GeoTravelFeasibilityRule`

```ts
interface GeoTravelFeasibilityRule {
  type: 'geo-travel-feasibility';
  id: string;
  severity?: 'hard' | 'soft';    // default 'soft'
  maxSpeedKph?: number;           // default 800 (commercial aviation)
  minGapMinutes?: number;         // minimum gap to enforce regardless of distance
  ignoreCategories?: string[];    // skip events with these categories
}
```

### `GeoEventInput`

```ts
interface GeoEventInput {
  id: string;
  start: Date;
  end: Date;
  resource?: string | null;
  category?: string | null;
  location: { lat: number; lng: number };
}
```

### `evaluateGeoConflicts`

```ts
import { evaluateGeoConflicts } from 'works-calendar';
import type { GeoTravelFeasibilityRule, GeoEventInput } from 'works-calendar';

const geoRule: GeoTravelFeasibilityRule = {
  type: 'geo-travel-feasibility',
  id: 'travel-check',
  maxSpeedKph: 800,
  severity: 'soft',
};

const proposed: GeoEventInput = {
  id: 'flight-2',
  start: new Date('2024-11-01T12:00:00'),
  end:   new Date('2024-11-01T14:00:00'),
  resource: 'pilot-alice',
  location: { lat: 33.9425, lng: -118.4081 },  // LAX
};

const others: GeoEventInput[] = [
  {
    id: 'flight-1',
    start: new Date('2024-11-01T08:00:00'),
    end:   new Date('2024-11-01T11:30:00'),
    resource: 'pilot-alice',
    location: { lat: 40.6413, lng: -73.7781 },  // JFK
  },
];

const violations = evaluateGeoConflicts([geoRule], proposed, others);
// violations[0].details contains distanceKm, gapMinutes, travelMinutes
```

### `GeoConflictViolation`

```ts
interface GeoConflictViolation {
  rule: GeoTravelFeasibilityRule;
  severity: 'hard' | 'soft';
  message: string;
  conflictingEventId: string;
  details: {
    distanceKm: number;
    gapMinutes: number;
    travelMinutes: number;
  };
}
```

> **Note:** `evaluateGeoConflicts` is not called by `validateOperation` inside the engine. Call it independently after each engine commit, or in a pre-save check, and attach locations to events via `attachLocations` or a location adapter.

---

## Requirements engine

For staffing requirements (minimum pilot count, required roles, etc.), see `evaluateRequirements` and `gateEventRequirements` in [Requirements.md](./Requirements.md).

## References

- `src/core/conflictEngine.ts`
- `src/core/conflicts/geoConflictRules.ts`
- `src/core/requirements/evaluateRequirements.ts`
- `src/core/requirements/gateEventRequirements.ts`

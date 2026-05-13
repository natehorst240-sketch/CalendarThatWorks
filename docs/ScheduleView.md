# ScheduleView

`ScheduleView` is a horizontal employee/resource timeline that renders rows of people or assets against a monthly (or fixed-window) day grid. It is the view activated by `initialView="schedule"` inside `<WorksCalendar>` and is also exported as a standalone component for custom layouts.

## When to use standalone vs. embedded

| Approach | When to use |
|---|---|
| `initialView="schedule"` on `<WorksCalendar>` | Full calendar experience: toolbar, sidebar, event form, filters |
| `<ScheduleView>` standalone | Custom layout with your own header, filters, or data fetching |

The standalone component has no dependency on `CalendarContext` or the engine — wire it directly to your own state.

## Props

```ts
// Row shape
type TimelineEmployee = {
  id: string;
  name: string;
  color?: string;
  role?: string;
  base?: string;
  avatar?: string;
};

interface ScheduleViewProps {
  currentDate: Date;
  events: CalendarViewEvent[];

  // Row definitions
  employees?: TimelineEmployee[];
  roles?: string[];
  bases?: Array<{ id: string; name: string }>;

  // Layout
  dayWindow?: number | null;     // 7 / 14 / 30 / 90 days; null = full calendar month
  onCallCategory?: string;       // default: 'on-call'
  groupBy?: unknown;
  sort?: unknown;

  // Interaction
  onEventClick?: (event: CalendarViewEvent) => void;
  onEventGroupChange?: (event: CalendarViewEvent, patch: { resource: string | null }) => void;
  onDateSelect?: (start: Date, end: Date, resourceId?: string | null) => void;

  // Employee management
  onEmployeeAdd?: (employee: { id: string; name: string; role?: string; base?: string }) => void;
  onEmployeeDelete?: (employeeId: string) => void;

  // Shift management
  onShiftStatusChange?: (event: CalendarViewEvent, status: 'pto' | 'unavailable' | null) => void;
  onCoverageAssign?: (event: CalendarViewEvent, employeeId: string | null) => void;
  onEmployeeAction?: (employeeId: string, action: Record<string, unknown>) => void;
}
```

### Key prop details

| Prop | Details |
|---|---|
| `employees` | Rows are employee-defined when provided. Events are matched by `event.resource === employee.id`. Pass `[]` to fall back to resource-derived rows from the event set. |
| `dayWindow` | When > 0, shows exactly that many days from `currentDate`. `null` / `0` / `undefined` all mean "full calendar month." |
| `onCallCategory` | Events whose `category` matches this string, or whose `meta.kind` is `'on-call'`, receive a striped background. |
| `onEventGroupChange` | Called when the user drags an event to a different row. Patch contains `{ resource: string | null }` — persist the new resource assignment. |

## Standalone usage

```tsx
import { ScheduleView } from 'works-calendar';
import 'works-calendar/styles';
import { useState } from 'react';

const employees = [
  { id: 'alice', name: 'Alice Chen', role: 'Pilot', color: '#3b82f6' },
  { id: 'bob',   name: 'Bob Torres', role: 'Medic', color: '#10b981' },
];

export default function MyTimeline({ events, currentDate }) {
  const [evts, setEvts] = useState(events);

  return (
    <ScheduleView
      currentDate={currentDate}
      events={evts}
      employees={employees}
      onCallCategory="on-call"
      dayWindow={14}
      onEventClick={ev => console.log('clicked', ev.title)}
      onEventGroupChange={(ev, { resource }) =>
        setEvts(prev => prev.map(e => e.id === ev.id ? { ...e, resource } : e))
      }
      onDateSelect={(start, end, resourceId) =>
        console.log('slot selected', start, end, resourceId)
      }
    />
  );
}
```

## Using `initialView="schedule"` inside `<WorksCalendar>`

```tsx
import { WorksCalendar } from 'works-calendar';

<WorksCalendar
  initialView="schedule"
  employees={employees}
  events={events}
  onEventMove={(ev, newStart, newEnd) => { /* persist */ }}
/>
```

---

# MissionHoverCard

`MissionHoverCard` is a modal-style card for dispatch/mission assignment workflows. It renders a three-column assignment panel (pilots · medical · aircraft) with live requirements evaluation, candidate filtering, and a compliance strip.

## Types

```ts
interface MissionCrewMember {
  id: string;
  name: string;
  role: string;           // 'pilot' | 'rn' | 'rt' | 'medic' | …
  certifications: string[];
}

interface MissionAircraft {
  id: string;
  name: string;
  type: string;
  hoursRemaining: number;
  capabilities: string[];
  tail?: string;
  status?: string;
}

interface MissionLeg {
  id: string;
  from: string;
  to: string;
  start: string;          // ISO timestamp
  end: string;
}

interface MissionComplianceItem {
  id: string;
  label: string;
  status: 'approved' | 'pending' | 'rejected';
}

interface MissionRequest {
  id: string;
  title: string;
  start: string;
  end: string;
  requirements: MissionRequirements;   // { pilots, medical, aircraft }
  assignments: MissionAssignments;
  legs: MissionLeg[];
  compliance: MissionComplianceItem[];
}

type MissionSlotKind = 'pilot' | 'medical' | 'aircraft';
```

## Props

```ts
interface MissionHoverCardProps {
  mission: MissionRequest;
  assignments: MissionAssignments;
  employees: MissionCrewMember[];
  aircraft: MissionAircraft[];
  onAssignmentChange: (next: MissionAssignments) => void;
  onClose: () => void;
}
```

## Utility functions

### `meetsAircraftReqs(aircraft, mission)`

Returns `true` when the aircraft satisfies the mission's minimum hours remaining and all required capabilities.

```ts
import { meetsAircraftReqs } from 'works-calendar';

// Pre-filter the fleet before showing candidates
const eligible = fleet.filter(ac => meetsAircraftReqs(ac, mission));
```

### `allRequirementsMet(assignments, mission, fleet)`

Returns `true` when every required pilot, medical, and aircraft slot is filled with a valid assignment.

```ts
import { allRequirementsMet } from 'works-calendar';

if (allRequirementsMet(assignments, mission, fleet)) {
  enableDispatchButton();
}
```

## Integration via `renderHoverCard`

Wire `MissionHoverCard` into `<WorksCalendar>` using the `renderHoverCard` prop:

```tsx
import { WorksCalendar, MissionHoverCard, allRequirementsMet } from 'works-calendar';
import type { MissionAssignments } from 'works-calendar';
import { useState } from 'react';

function emptyAssignments(): MissionAssignments {
  return { pilots: [], medical: [], aircraftId: null };
}

export default function DispatchCalendar({ missions, employees, fleet }) {
  const [assignments, setAssignments] = useState<Record<string, MissionAssignments>>({});

  return (
    <WorksCalendar
      events={missions.map(m => ({
        id: m.id,
        title: m.title,
        start: m.start,
        end: m.end,
        category: 'mission',
      }))}
      renderHoverCard={(event, onClose) => {
        const mission = missions.find(m => m.id === event.id);
        if (!mission) return null;

        return (
          <MissionHoverCard
            mission={mission}
            assignments={assignments[mission.id] ?? emptyAssignments()}
            employees={employees}
            aircraft={fleet}
            onAssignmentChange={next => {
              setAssignments(prev => ({ ...prev, [mission.id]: next }));
              if (allRequirementsMet(next, mission, fleet)) {
                console.log('All slots filled — ready to dispatch');
              }
            }}
            onClose={onClose}
          />
        );
      }}
    />
  );
}
```

## References

- `src/views/ScheduleView.tsx`
- `src/ui/MissionHoverCard.tsx`
- `src/index.ts` — export lines for both

# WorksCalendar

**Embeddable scheduling engine for teams, assets, and operations.** Drop it into a React app and get a working calendar, dispatch board, request queue, and approval pipeline — all driven by one config object.

**Website:** [workscalendar.com](https://workscalendar.com) · **Repository:** [github.com/workscalendar/calendarthatworks](https://github.com/workscalendar/calendarthatworks)

WorksCalendar provides the building blocks for advanced scheduling. Applications are expected to configure and extend these systems to fit their workflow.

## Core features (fully working)

- Multiple calendar modes: month, week, day, agenda, schedule, timeline
- Event lifecycle states (draft → pending → approved → scheduled → completed) surfaced everywhere
- Conflict engine with hard-block / soft-warning modes, live inline feedback in the editor, and conflict highlights on the calendar
- Request queue with approve / deny / finalize / revoke actions wired to a tamper-evident audit chain
- Dispatch readiness board with per-row "Why?" breakdown — driver / pilot / pool shortfalls explained in plain English
- Schema-driven filtering, saved views, themeable UI with packaged themes
- Backend-agnostic: feed events via `events` prop, `fetchEvents` callback, or the built-in Supabase connector
- **Written in strict TypeScript**; ships with generated `.d.ts` so consumer types stay in lockstep with the implementation

## Extensible systems (configurable)

- Approval workflow DSL — multi-tier approvals, SLA timers + escalation, parallel branches with quorum joins (`requireAll` / `requireAny` / `requireN`), and pluggable notification channels (Slack, email, webhook, or your own adapter)
- Resource pools with a query DSL (capability + distance filters), pool resolution strategies, and per-pool readiness evaluation
- Requirement templates — declare per-event-type role / pool needs and let `evaluateRequirements` gate the booking
- Custom resource types, roles, labels, and capability schemas

## Profiles

WorksCalendar ships starter profiles so the same engine fits multiple industries via configuration:

| Profile             | Resource label | Event label | Default roles                                                |
| ------------------- | -------------- | ----------- | ------------------------------------------------------------ |
| `air_medical`       | Aircraft       | Mission     | Pilot in Command, Flight Paramedic, Flight Nurse, Dispatcher |
| `aviation`          | Aircraft       | Flight      | Pilot in Command, Second in Command, Dispatcher              |
| `trucking`          | Truck          | Load        | Driver, Dispatcher                                           |
| `equipment_rental`  | Equipment      | Rental      | Yard Attendant, Delivery Driver, Dispatcher                  |
| `scheduling`        | Room           | Booking     | Organizer, Attendee                                          |
| `custom`            | Resource       | Event       | (none)                                                       |

Apply a profile via the setup wizard's "What are you scheduling?" step or programmatically:

```ts
import { applyProfilePreset } from 'works-calendar';

const config = applyProfilePreset('air_medical');
// config.labels.resource === 'Aircraft'
// config.roles → [pilot-in-command, flight-paramedic, flight-nurse, …]
```

Switching profiles changes terminology and defaults without changing logic — the conflict engine, requirement evaluator, and approval reducer all read off the same config.

## New here? Start with the [Setup guide](./docs/Setup.md)

Plain-language walkthrough from `npm install` to a working, connected calendar — pick only the steps you need.

## Installation

```bash
npm install works-calendar
```

**Peer dependencies:** React 18 or 19 is required. Install separately if you don't have them:

```bash
npm install react react-dom
```

**Bundler requirement:** WorksCalendar is an ES module library. It works out of the box with Vite, webpack, Parcel, Rollup, and any other modern bundler. It does **not** work when loaded via a plain `<script>` tag alongside a separately-bundled React app — that creates two React instances and breaks hooks. If you need script-tag usage, load React itself from a CDN first and import this package via an ESM-capable `<script type="module">`.

## Quick start

> **CSS required.** The calendar renders unstyled without it. Import the base styles once, anywhere in your app.

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';        // required — base styles
import 'works-calendar/styles/ocean';  // optional — theme

export function App() {
  const events = [
    {
      id: 'shift-1',
      title: 'Morning shift',
      start: new Date('2026-05-05T08:00:00'),
      end:   new Date('2026-05-05T16:00:00'),
      resource: 'emp-alice',   // links to an employee / resource id
      category: 'operations',
    },
  ];

  return (
    <WorksCalendar
      events={events}
      initialView="week"
      theme="ocean"
    />
  );
}
```

## Event shape

```ts
interface WorksCalendarEvent {
  id?:            string;
  title:          string;
  start:          Date | string;       // ISO string or Date object
  end?:           Date | string;
  allDay?:        boolean;
  resource?:      string;              // employee / asset / resource id
  category?:      string;
  color?:         string;              // CSS colour overrides colorRules
  status?:        'confirmed' | 'tentative' | 'cancelled';
  lifecycle?:     'draft' | 'pending' | 'approved' | 'scheduled' | 'completed';
  visualPriority?: 'muted' | 'high';
  rrule?:         string;              // RFC 5545 RRULE string
  exdates?:       Array<Date | string>;
  meta?:          Record<string, unknown>; // arbitrary host data
}
```

`resource` (not `resourceId`) is the field that links an event to an employee or asset. The value should match the `id` of a record in your `employees` prop array.

## Key props

| Prop | Type | Description |
|------|------|-------------|
| `events` | `WorksCalendarEvent[]` | Static event array |
| `fetchEvents` | `() => Promise<WorksCalendarEvent[]>` | Dynamic loader — called on mount and view change |
| `employees` | `EmployeeRecord[]` | Team members shown in scheduling views |
| `initialView` | `'month' \| 'week' \| 'day' \| 'agenda' \| 'schedule' \| 'map'` | Starting view |
| `theme` | `string` | Theme name (see Theming) |
| `role` | `'owner' \| 'scheduler' \| 'viewer'` | Permission level — `'owner'` unlocks settings & config |
| `devMode` | `boolean` | **Local development only.** When `true`, treats the user as an owner regardless of `role`, bypassing every role check. Never pass `true` in production. |
| `density` | `'comfortable' \| 'compact'` | Force the compact chrome (narrow toolbar, hidden right panel) regardless of container width. Default lets the calendar's own width drive the layout via container queries. |
| `calendarId` | `string` | Namespace key for localStorage persistence (default: `'default'`) |
| `onEventSave` | `(event) => void` | Called when a user saves an event in the editor |
| `onEventDelete` | `(id) => void` | Called when a user deletes an event |
| `onEventMove` | `(event, newStart, newEnd) => void` | Called after drag-to-move |
| `filterSchema` | `FilterField[]` | Custom filter fields shown in the filter bar |
| `colorRules` | `UnknownRecord[]` | Rules that map event fields to colours |
| `groupBy` | `string \| GroupByInput` | Group events into rows by field |

For the full prop list see the [Setup guide](./docs/Setup.md) or the TypeScript types in `dist/index.d.ts`.

### Supabase connector

Pass your Supabase credentials and events are loaded and persisted automatically — no custom `fetchEvents` needed:

```jsx
<WorksCalendar
  supabaseUrl={import.meta.env.VITE_SUPABASE_URL}
  supabaseKey={import.meta.env.VITE_SUPABASE_KEY}
  supabaseTable="events"
/>
```

Requires `npm install @supabase/supabase-js`.

### Custom backend

Supply a `fetchEvents` function for any other source:

```jsx
<WorksCalendar
  fetchEvents={async () => {
    const res = await fetch('/api/events');
    return res.json();
  }}
  onEventSave={async (event) => {
    await fetch('/api/events', { method: 'POST', body: JSON.stringify(event) });
  }}
/>
```

## Examples

Run the local example suite:

```bash
npm install
npm run examples
```

Example catalogs:

- [Examples index](./examples/README.md)
- [Workflow mapping](./examples/WORKFLOWS.md)

## Documentation

- [Setup guide](./docs/Setup.md) — start here
- [Docs index](./docs/README.md)
- [Schedule workflow guide](./docs/ScheduleWorkflow.md)
- [Approval workflow DSL](./docs/Workflow.md)
- [Filtering system](./docs/Filtering.md)
- [Google Calendar setup](./docs/GoogleCalendarSetup.md)
- [Microsoft 365 setup](./docs/Microsoft365Setup.md)
- [Contributing](./docs/Contributing.md)

## Theming

Base styles — required:

```jsx
import 'works-calendar/styles';
```

Optional theme override:

```jsx
import 'works-calendar/styles/ocean';
```

Included packaged themes: `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`.

If you use a CSS bundler that doesn't handle package `exports`, import by file path:

```jsx
import 'works-calendar/dist/style.css';
import 'works-calendar/dist/themes/ocean.css';
```

## Customizing the chrome

The calendar's left icon rail and right panel are two slots embedders can
extend without forking. The stock chrome (saved-views, focus filters,
settings, region map, crew on shift) keeps stable positions; your
content lands after the built-ins.

```tsx
import {
  WorksCalendar,
  RightPanelSection,
  type LeftRailAction,
} from 'works-calendar';
import { Bell, Download } from 'lucide-react';

const railExtras: LeftRailAction[] = [
  {
    id: 'export',
    label: 'Export',
    hint: 'Download visible events as CSV',
    icon: <Download size={18} aria-hidden="true" />,
    onClick: () => exportCsv(),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: <Bell size={18} aria-hidden="true" />,
    onClick: () => openNotificationDrawer(),
  },
];

<WorksCalendar
  events={events}
  leftRailExtras={railExtras}
  rightPanelExtras={
    <>
      <RightPanelSection title="Open tickets">
        <MyTicketWidget />
      </RightPanelSection>
      <RightPanelSection title="Compliance">
        <MyComplianceWidget />
      </RightPanelSection>
    </>
  }
/>
```

`leftRailExtras` takes `LeftRailAction[]` (`id` / `label` / `icon` /
optional `hint` / optional `active` / `onClick`). Built-in ids
(`saved-views`, `focus`, `settings`) are reserved — extras using them
are filtered out so a typo can't shadow the chrome.

`rightPanelExtras` takes any `ReactNode`. Wrap each section in
`<RightPanelSection title="…">` so theme tokens + section dividers
match the stock content above.

## Optional view plugins

Some views are shipped behind optional peer dependencies so the core bundle
stays slim. They are auto-detected at runtime — install the peers and the view
renders; skip them and a graceful install hint is shown instead.

### Map view

Plot events with coordinates on a MapLibre basemap.

```bash
npm install maplibre-gl react-map-gl
```

```jsx
import { WorksCalendar } from 'works-calendar';

const events = [
  {
    id: 'kphx-1',
    title: 'Phoenix arrival',
    start: new Date(),
    meta: { coords: { lat: 33.43, lon: -112.01 } },
  },
];

<WorksCalendar events={events} initialView="map" />;
```

Coordinates are read from `event.meta.coords` (`{ lat, lon }`, matching the
`LocationData` shape) — `event.meta.lat` + `event.meta.lon`/`meta.lng` is also
accepted as a loose convenience form. Marker color resolves through the same
`colorRules` as every other view.

`MapView` is also exported standalone for custom layouts:

```jsx
import { MapView } from 'works-calendar';

<MapView
  events={events}
  onEventClick={ev => console.log(ev)}
  mapStyle="https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY"
/>;
```

The default `mapStyle` is MapLibre's free demo tile server — fine for local
development; production hosts should pass their own style URL (MapTiler,
Stadia, Protomaps, self-hosted, …).

## Release & project status

- [Release readiness checklist](./docs/release-readiness.md)
- [Product roadmap](./docs/Roadmap.md)
- [Initial release notes draft](./docs/releases/v0.1.0.md)

## License

MIT. See [LICENSE](./LICENSE).

# WorksCalendar

A modern, embeddable React calendar for teams that need fast scheduling, rich filtering, and flexible backend integration.


> Drop-in UI, owner-managed setup, advanced smart views, recurring events, and external-form workflows.

## ✨ Features

- **Beautiful calendar UI** with month/week/day/schedule/agenda/timeline views
- **Theme system** (`light`, `dark`, `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`)
- **Advanced smart views** with saved filters and nested AND/OR builder via Setup Wizard
- **First-time Setup Wizard** for owner onboarding, theme, team setup, and starter views
- **Recurring events engine** with safe expansion and mutation flows
- **Drag/drop + resize + undo/redo** editing workflow
- **CSV import + Excel export** support
- **DataAdapter pattern** for backend-agnostic form submission workflows
- **CalendarExternalForm** for mobile-friendly, out-of-calendar event intake
- **Owner config & permissions** controls for deployment customization
- **Optional Supabase realtime** updates
- **PWA-ready demo app**

---

## Quick start

```bash
npm install
npm run dev          # demo at http://localhost:3000
npm run examples     # examples at http://localhost:3001
```

## Build & preview

```bash
npm run build        # library -> dist/
npm run build:demo   # demo app -> dist-demo/
npm run preview      # serve dist-demo/ locally
```

## Installation (library usage)

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';
import 'works-calendar/styles/ocean'; // optional theme CSS

<WorksCalendar
  events={events}
  employees={employees}
  calendarId="ops-calendar"
  theme="ocean"
  showAddButton
  onEventSave={handleSave}
  onEventDelete={handleDelete}
/>
```

---

## WorksCalendar props reference

### Data & loading

| Prop | Type | Description |
|---|---|---|
| `events` | `WorksCalendarEvent[]` | Static event array source. |
| `fetchEvents` | `(params: FetchEventsParams) => Promise<WorksCalendarEvent[]>` | Async range-based loading when view window changes. |
| `icalFeeds` | `ICalFeed[]` | Subscribe to one or more `.ics` feeds and merge into visible events. |
| `scheduleTemplates` | `ScheduleTemplate[]` | Inline templates exposed in **Add Schedule** flow. |
| `scheduleTemplateAdapter` | `ScheduleTemplateAdapter` | Backend adapter for listing/creating/deleting templates. |
| `scheduleInstantiationLimits` | `ScheduleInstantiationLimits` | Guardrails for preview/create expansion volume. |
| `onScheduleTemplateAnalytics` | `(event: ScheduleTemplateAnalyticsEvent) => void` | Optional analytics sink for schedule-template lifecycle telemetry. |

### Identity, owner config, and notes

| Prop | Type | Description |
|---|---|---|
| `calendarId` | `string` | Namespaces local state (`default` when omitted). |
| `ownerPassword` | `string` | Password for owner configuration access. |
| `onConfigSave` | `(config: CalendarConfig) => void` | Called when owner config is changed/saved. |
| `notes` | `Record<string, Note>` | External notes state keyed by note id. |
| `onNoteSave` | `(note: Partial<Note>) => void` | Persist note create/update from hover card/editor flows. |
| `onNoteDelete` | `(noteId: string) => void` | Delete note callback. |

### Event interaction callbacks

| Prop | Type | Description |
|---|---|---|
| `onEventClick` | `(event: NormalizedEvent) => void` | Fired when user clicks an event. |
| `onEventSave` | `(event: WorksCalendarEvent) => void` | Create/edit persistence callback. |
| `onEventMove` | `(event, newStart, newEnd) => void` | Drag/move callback; falls back to `onEventSave` if omitted. |
| `onEventResize` | `(event, newStart, newEnd) => void` | Resize callback; falls back to `onEventSave` if omitted. |
| `onEventDelete` | `(eventId: string) => void` | Delete callback. |
| `onDateSelect` | `(start: Date, end: Date) => void` | Empty-range selection callback. |
| `onImport` | `(events: WorksCalendarEvent[]) => void` | Called after drag/drop/feed import actions. |

### Realtime + validation + appearance

| Prop | Type | Description |
|---|---|---|
| `supabaseUrl` / `supabaseKey` | `string` | Enables realtime event subscriptions. |
| `supabaseTable` / `supabaseFilter` | `string` | Controls realtime source table and row filter. |
| `blockedWindows` | `BlockedWindow[]` | Hard-block windows used by built-in validation. |
| `theme` | `ThemeId` | Visual theme id (`light`, `dark`, `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`). |
| `colorRules` | `ColorRule[]` | Conditional color overrides (predicate or field/value rules). |
| `businessHours` | `BusinessHours` | Defines business-day shading and validation context. |

### Rendering, composition, and UI toggles

| Prop | Type | Description |
|---|---|---|
| `renderEvent` | `(event, context) => ReactNode` | Custom event content renderer. |
| `renderHoverCard` | `(event, onClose) => ReactNode` | Replace default hover card. |
| `renderToolbar` | `(api: CalendarApi) => ReactNode` | Replace full toolbar with custom controls. |
| `emptyState` | `ReactNode` | Custom empty state when filtered result set is empty. |
| `showAddButton` | `boolean` | Enables add-event CTA in non-owner mode. |
| `ref` | `React.Ref<CalendarApi>` | Imperative API handle (`navigateTo`, `setView`, `addEvent`, etc.). |

For full typings, see `src/index.d.ts`.


---

## First-Time Setup Wizard

The Setup Wizard auto-opens for authenticated owners when setup has not been completed yet (`setupCompleted !== true` in owner config).

What it helps with:
- choose theme
- add team members and avatars
- define categories
- build starter smart views with advanced filter logic

Owners can reopen it from the toolbar using the wand icon.

See detailed guide: [`docs/SetupWizard.md`](./docs/SetupWizard.md)

## Advanced Smart Views / Filter Builder

WorksCalendar includes:
- schema-driven filters
- active filter pills
- saved views
- advanced AND/OR grouping in wizard workflows

See: [`docs/AdvancedFilters.md`](./docs/AdvancedFilters.md)

## DataAdapter pattern

Keep UI decoupled from storage/auth providers.

```jsx
import { CalendarExternalForm, createLocalStorageDataAdapter } from 'works-calendar';

const adapter = createLocalStorageDataAdapter({ key: 'my-app:events' });

<CalendarExternalForm adapter={adapter} />
```

Adapter contract:

```ts
{
  submitEvent(payload, context): Promise<unknown>
}
```

See: [`docs/DataAdapter.md`](./docs/DataAdapter.md)

## External Form (CalendarExternalForm)

`CalendarExternalForm` is a standalone intake form component you can place outside the main calendar UI.

Use cases:
- public scheduling requests
- mobile intake screens
- role-separated submission workflows

Examples:
- [`examples/external-form.jsx`](./examples/external-form.jsx)
- [`examples/microsoft-365/Microsoft365ExternalFormExample.jsx`](./examples/microsoft-365/Microsoft365ExternalFormExample.jsx)

## Feature demos (copy/paste)

Run all demos:

```bash
npm run examples
```

Focused examples:

| Feature | Example file |
|---|---|
| Setup Wizard onboarding flow | [`examples/setup-wizard.jsx`](./examples/setup-wizard.jsx) |
| Advanced smart views / nested filters | [`examples/advanced-filters.jsx`](./examples/advanced-filters.jsx) |
| DataAdapter with local persistence | [`examples/data-adapter-local.jsx`](./examples/data-adapter-local.jsx) |
| DataAdapter with Microsoft 365 | [`examples/data-adapter-microsoft365.jsx`](./examples/data-adapter-microsoft365.jsx) |
| Standalone CalendarExternalForm | [`examples/external-form.jsx`](./examples/external-form.jsx) |

## Theming

1. Import base styles once:

```jsx
import 'works-calendar/styles';
```

2. Optionally import a preset bundle:

```jsx
import 'works-calendar/styles/ocean';
```

3. Pass the matching `theme` prop:

```jsx
<WorksCalendar theme="ocean" />
```

Available theme ids:
`light`, `dark`, `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`

You can combine theme selection with owner config defaults from the Setup Wizard.

## Owner Config & Security Notes

- Protect owner actions with a strong `ownerPassword` (never ship demo defaults).
- Use least-privilege role settings for non-owners.
- Validate server-side on all persistence APIs.
- Audit imported feeds and external form payloads.

See: [`docs/HIPAA-Security.md`](./docs/HIPAA-Security.md)

## Examples

See [`examples/README.md`](./examples/README.md) and run:

```bash
npm run examples
```

Includes:
- basic usage
- setup wizard flow
- advanced filters
- data adapter (local + Microsoft 365)
- external form workflows

## PWA (demo app)

When running `npm run build:demo`, `vite-plugin-pwa` emits:
- `dist-demo/sw.js`
- `dist-demo/manifest.webmanifest`
- precached shell assets

Runtime caching:
- Google Fonts: `CacheFirst` (1 year)
- static shell: Workbox precache

## License / Commercial Use

This repository currently does not declare a standalone `LICENSE` file. Add one before production/commercial distribution.

## Roadmap

- More official adapters (Supabase, Microsoft 365 hardening, generic REST)
- Expanded docs for recurrence exceptions and template governance
- More examples for multi-tenant deployments
- Optional hosted starter backend packages

## Contributing

See [`docs/Contributing.md`](./docs/Contributing.md).

# Setup: build your calendar in 10 minutes

This page walks you from `npm install` to a working calendar that knows your team, saves to your database, and (optionally) syncs with Google or Microsoft 365. No prior React-calendar experience required.

Work through it top to bottom. Every step is optional after Step 1 — pick only the pieces you need.

> **Rule of thumb:** if a step doesn't match what you want, skip it. The calendar will still work.

## Table of contents

1. [Install](#1-install)
2. [Put a calendar on the page](#2-put-a-calendar-on-the-page)
3. [Pick where your events live](#3-pick-where-your-events-live) — includes multi-source merging
4. [Pick which views to show](#4-pick-which-views-to-show) — includes drag & drop
5. [Add your team (optional)](#5-add-your-team-optional) — includes availability & working hours
6. [Turn on team scheduling (optional)](#6-turn-on-team-scheduling-optional)
6.5. [Filters & saved views (optional)](#65-filters--saved-views-optional)
7. [Track things, not just people (optional)](#7-track-things-not-just-people-optional)
7.5. [Propose → review → approve / deny (optional)](#75-turn-on-propose--review--approve--deny-for-assets-optional)
7.6. [Categories — color & organize your events (optional)](#76-categories--color--organize-your-events-optional)
7.7. [Recurring events (optional)](#77-recurring-events-optional)
7.8. [Grouping — rows by team, role, or location (optional)](#78-grouping--rows-by-team-role-or-location-optional)
7.9. [Conflict detection (optional)](#79-conflict-detection-optional)
8. [Pick a theme](#8-pick-a-theme)
9. [Let outsiders book time (optional)](#9-let-outsiders-book-time-optional)
10. [Turn on the setup wizard & owner mode (optional)](#10-turn-on-the-setup-wizard--owner-mode-optional)
10.5. [Bulk-import events from a spreadsheet (optional)](#105-bulk-import-events-from-a-spreadsheet-optional)
11. [Ship it](#11-ship-it)
12. [Pick-your-path cheat sheet](#12-pick-your-path-cheat-sheet)

---

## 1. Install

```bash
npm install works-calendar
```

Need React? If you don't already have a React app, the fastest way to start is:

```bash
npm create vite@latest my-calendar -- --template react
cd my-calendar
npm install
npm install works-calendar
```

## 2. Put a calendar on the page

Paste this into `src/App.jsx`:

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';

export default function App() {
  return <WorksCalendar />;
}
```

Run `npm run dev`. You should see an empty calendar. That's your foundation — everything after this is adding powers to it.

## 3. Pick where your events live

This is the biggest decision. Use the table to pick one — you can change later.

| You want… | Pick | Hard? |
| --- | --- | --- |
| Just play around on my own computer | **LocalStorage** | ⭐ easy |
| My own database (Postgres, MySQL, Mongo…) | **Custom adapter** | ⭐⭐ medium |
| A free hosted database without a backend | **Supabase** | ⭐⭐ medium |
| Sync with my Google Calendar | **Google Calendar** | ⭐⭐⭐ OAuth setup |
| Sync with my Outlook / Microsoft 365 | **Microsoft 365** | ⭐⭐⭐ OAuth setup |
| Read-only feed from an iCal / .ics URL | **iCal adapter** | ⭐ easy |
| Import/export spreadsheets | **Excel adapter** | ⭐ easy |

### 3a. LocalStorage (easiest)

Events save in the browser. No backend. Great for prototypes and single-user tools.

```jsx
import { WorksCalendar, createLocalStorageDataAdapter } from 'works-calendar';
import 'works-calendar/styles';

const adapter = createLocalStorageDataAdapter({ key: 'my-calendar' });

export default function App() {
  return <WorksCalendar adapter={adapter} />;
}
```

### 3b. Your own database

Pass an `events` array you loaded however you like, and an `onEventSave` that writes back.

```jsx
const [events, setEvents] = useState([]);

useEffect(() => {
  fetch('/api/events').then((r) => r.json()).then(setEvents);
}, []);

async function handleSave(event) {
  const saved = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).then((r) => r.json());
  setEvents((prev) => upsert(prev, saved));
}

<WorksCalendar events={events} onEventSave={handleSave} />
```

Your API decides the database. Postgres, MySQL, Mongo, Firebase — anything that speaks HTTP works.

### 3c. Supabase (free hosted DB, no backend required)

1. Create a project at https://supabase.com.
2. Create an `events` table with columns: `id`, `title`, `start`, `end`, `metadata` (jsonb).
3. Install the client: `npm install @supabase/supabase-js`.
4. Use the Supabase adapter — see `src/api/v1/adapters/SupabaseAdapter.ts` for the wiring pattern.

### 3d. Sync with your company's email / calendar provider

Your work calendar almost certainly lives inside your company email account. Pick the one that matches your work email address:

| Your work email ends in… | Your provider is | Follow |
| --- | --- | --- |
| `@gmail.com` or a Google Workspace domain | Google Workspace | [Google Calendar setup](./GoogleCalendarSetup.md) |
| `@outlook.com`, `@hotmail.com`, or any Microsoft 365 domain | Microsoft 365 / Outlook | [Microsoft 365 setup](./Microsoft365Setup.md) |
| Something else (Zoho, FastMail, Proton…) | Use their iCal feed | [Section 3e](#3e-ical--ics-feed-read-only) |

Each provider guide is ~20 minutes the first time: register an app, pick a scope, paste two env vars. Once connected, events you create in WorksCalendar appear in Gmail / Outlook / every synced phone automatically, and vice-versa.

### 3e. iCal / .ics feed (read-only)

Perfect for pulling in a school calendar, sports schedule, or public holidays.

```jsx
import { ICSAdapter } from 'works-calendar/api/v1/adapters/ICSAdapter';
const adapter = new ICSAdapter({ url: 'https://example.com/holidays.ics' });
```

### 3f. Excel import/export

Install the optional dep:

```bash
npm install xlsx
```

Then use the export helpers in `src/export/excelExport.js` to dump events or hand your users an Upload button.

### 3g. Pull from more than one place at once

You are not limited to a single source. Mix Google + Supabase + an iCal holiday feed in the same calendar. Each event is tagged with where it came from and gets its own filter pill.

```jsx
<WorksCalendar
  calendarId="ops-team"
  events={events}        // your Supabase-loaded events
  feeds={[
    { id: 'holidays', label: 'US Holidays', url: 'https://example.com/holidays.ics' },
    { id: 'gcal',     label: 'Google',      url: '/api/google-proxy.ics' },
  ]}
/>
```

The calendar dedupes by `id`, shows a source filter pill per feed, and lets users toggle sources on/off without losing the rest of their view. See `examples/07-MultiSource.jsx` for the full pattern.

## 4. Pick which views to show

Views are the buttons across the top (Month, Week, etc.). Turn on only what you need.

```jsx
<WorksCalendar
  initialView="week"
  enabledViews={['month', 'week', 'day', 'agenda', 'schedule', 'timeline']}
/>
```

| View | When to use it |
| --- | --- |
| `month` | Big picture, "is anything happening next week?" |
| `week` | Classic Google-Calendar weekly grid |
| `day` | Single-day, hour-by-hour |
| `agenda` | List view — great on phones |
| `schedule` | Team shifts / coverage (PTO → uncovered → filled) |
| `timeline` | Rows of resources across time (Gantt-like) |
| `assets` | Fleet / room / equipment rows (see Step 7) |

### Drag & drop is already on

Every time-grid view supports pointer + touch drag:

- Drag an event to a new time → the event moves, `onEventSave` fires with the new `start` / `end`.
- Drag the bottom edge → resize.
- On `timeline` and `schedule` rows, drag an event onto a different row to reassign.

Nothing to configure. If you want to turn it off on a specific view:

```jsx
<WorksCalendar readOnly />
```

See `examples/10-DragAndDrop.jsx` for a working demo, and `src/hooks/useDrag.js` / `useTouchDnd.js` if you need to peek under the hood.

## 5. Add your team (optional)

If events belong to people, give the calendar a list of employees:

```jsx
const employees = [
  { id: 'e1', name: 'Alex Rivera', role: 'Nurse', color: '#3b82f6' },
  { id: 'e2', name: 'Sam Kim', role: 'Nurse', color: '#10b981' },
];

<WorksCalendar employees={employees} events={events} />
```

Each event's `employeeId` links it to a person. Colors, filters, and grouping all light up once employees exist.

### Availability & working hours

Each employee can have three kinds of availability events, all created from the timeline → click employee menu:

| Kind | What it means | Default look |
| --- | --- | --- |
| `pto` | Paid time off — triggers the coverage flow in Step 6 | Green all-day block |
| `unavailable` | Not on the schedule (sick, class, other job) — also triggers coverage | Red all-day block |
| `availability` | "I can work this window" — used by scheduling tools to find coverers | Blue time block |

You don't hardcode these — they come from the `AvailabilityForm` modal the calendar shows when the user clicks **Edit Availability** or **Request PTO**. As the host, your only job is to persist them through `onEventSave` like any other event.

Want to show "only people available right now"? Use a saved view (Step 6.5) with filter `category == 'availability' AND start <= now AND end > now`.

## 6. Turn on team scheduling (optional)

This is WorksCalendar's headline feature: PTO automatically turns into open shifts, and open shifts turn into double-sided coverage events.

Switch the view on:

```jsx
<WorksCalendar
  employees={employees}
  events={events}
  initialView="schedule"
  onEventSave={handleSave}
/>
```

### The flow in plain English

1. **Alex has a shift.** Tuesday, 9 AM–5 PM. One event, assigned to Alex.
2. **Alex requests PTO.** In the timeline, click Alex's row → **Request PTO**. The calendar scans every shift Alex owns and looks for any that overlap the PTO window.
3. **Any overlapping shift becomes uncovered.** For each conflict, the calendar automatically creates an **open-shift** event (amber, unassigned, labelled `Open: <original shift>`). The original shift is marked covered so it doesn't keep regenerating.
4. **Someone picks up the open shift.** The scheduler (or the owner, or anyone with an assigned saved view of "open shifts") drags an employee onto the open shift — or uses the Cover action card.
5. **The calendar creates two mirrored events.** The original shift stays (now marked covered). The coverer gets a new shift of kind `covering` pointing back to the source. Both people see their own version; payroll/reporting can tell the difference.

Reverse the flow by deleting the PTO (everything folds back) or by revoking coverage.

### The four event kinds in the schedule

These are in `src/core/scheduleModel.js` — you don't write them by hand, but understanding them helps when you look at your data:

| Kind | Who has it | What it means |
| --- | --- | --- |
| `shift` | Normal employee | A regular assigned shift |
| `on-call` | Normal employee | An on-call window (treated like a shift for conflicts) |
| `open-shift` | Nobody (amber) | Needs coverage — auto-created when PTO eats a shift |
| `covering` | The coverer | The mirror event when someone picks up an open shift |

### What the owner has to provide

The only thing you have to wire up is save. The calendar emits normal event operations; you persist them:

```jsx
async function handleSave(event) {
  // This same handler receives:
  //  - a new PTO event
  //  - an auto-generated open-shift event (meta.kind === 'open-shift')
  //  - a new covering event when someone covers
  //  - a mutation to the original shift flagging it covered
  await saveToYourBackend(event);
}
```

Nothing special is required to "turn on" the auto-open-shift logic — it fires whenever a PTO or Unavailable event is saved against an employee who has overlapping shifts.

### What users see

- **Employee on PTO:** their row shows a PTO block. Their original shifts look "covered" (muted).
- **The open shift:** an amber unassigned event sitting on the date that needs a warm body. Click it to see who was originally on.
- **The coverer:** their row shows the mirrored shift. Title prefixed `Covering: …` so it's obvious on their schedule.
- **Everyone else:** no visual change.

### "Auto-covered-by" — the truth about the "auto" part

The calendar **auto-detects** uncovered shifts. It does **not** auto-assign a coverer — a human clicks. If you want fully automatic assignment ("the next available employee gets it"), wire it in your save handler:

```jsx
async function handleSave(event) {
  if (event.meta?.kind === 'open-shift' && event.meta.status === 'open') {
    const candidate = pickNextAvailable(employees, event, allEvents);
    if (candidate) {
      return saveToYourBackend(assignCoverer(event, candidate));
    }
  }
  return saveToYourBackend(event);
}
```

`pickNextAvailable` is yours to write (fair rotation, seniority, lowest hours this week — whatever your team needs). Leaving it out is the common choice: most teams want a human to make that call.

### Common patterns

| You want… | Do this |
| --- | --- |
| A "needs coverage" queue | Saved view with filter `meta.kind == 'open-shift' AND meta.status == 'open'` |
| Only supervisors can cover | Gate the Cover action in your save handler by `user.role` |
| Require confirmation from the coverer | Pair this with the [approvals workflow](#75-turn-on-propose--review--approve--deny-for-assets-optional) on `covering` events |
| Fair rotation | Implement `pickNextAvailable` with a rolling index per team |
| Block coverers with their own conflict | Call `detectShiftConflicts` from `src/core/scheduleOverlap.js` before saving |

Full walkthrough: [Schedule workflow guide](./ScheduleWorkflow.md).

## 6.5. Filters & saved views (optional)

This is WorksCalendar's #1 differentiator against every other free calendar library. If your users keep asking "show me just X," this step is for you.

### What a filter does

Filters narrow what's on screen without deleting anything. Examples:

- "Only Alex and Sam this week"
- "Only open shifts"
- "Only events from the Google source, categorized as Training"
- "Only events in the Chicago office"

Filters stack. Users build them with pill buttons at the top of the calendar.

### What a saved view adds

A saved view is a named bundle of: current filter, current calendar view (week/timeline/etc.), date range, and grouping. Users click a name instead of rebuilding the filter every time.

### Turn it on

Filters are on by default. The only thing you configure is the schema — which fields people can filter by:

```jsx
import { WorksCalendar } from 'works-calendar';

const filterSchema = [
  { field: 'employeeId', label: 'Person',   type: 'multi-select' },
  { field: 'category',   label: 'Category', type: 'multi-select' },
  { field: 'meta.kind',  label: 'Kind',     type: 'multi-select' },
  { field: 'location',   label: 'Location', type: 'text' },
];

<WorksCalendar
  calendarId="team-alpha"
  events={events}
  filterSchema={filterSchema}
/>
```

### Useful starter views to seed

When new users land on your calendar, pre-seed a few saved views so they see the feature work immediately:

| View name | Filter | Who it helps |
| --- | --- | --- |
| "Needs coverage" | `meta.kind == 'open-shift' AND meta.status == 'open'` | Schedulers |
| "My week" | `employeeId == currentUser.id` | Individual contributors |
| "Pending approval" | `meta.approvalStage.stage IN ('requested', 'pending_higher')` | Managers |
| "This team only" | `meta.team == 'field-ops'` | Team leads |
| "Just holidays" | `source == 'holidays'` | Everyone |

### How users interact

1. Click the **+ Filter** pill at the top → dropdown with fields from your schema.
2. Add filters; the calendar updates instantly.
3. Click **Save view** → give it a name. It lands in the Saved Views list.
4. Click any saved view to snap back to that setup.

Full reference: [Filtering system](./Filtering.md) and [Advanced filters](./AdvancedFilters.md).

## 7. Track things, not just people (optional)

If you schedule rooms, vehicles, tools, or any non-human resource, pass them as `assets`:

```jsx
const assets = [
  { id: 'truck-1', name: 'Truck 1', type: 'vehicle' },
  { id: 'room-a', name: 'Conference A', type: 'room' },
];

<WorksCalendar assets={assets} initialView="assets" />
```

Assets get their own row in timeline and assets views, with horizontal virtualization so dozens of rows stay snappy.

## 7.5. Turn on propose → review → approve / deny for assets (optional)

Use this when someone has to **sign off** before a booking is real: the mechanic asking for Truck 2, the nurse requesting the meeting room, the intern reserving the loaner laptop.

### The stages

Every request moves through this state machine:

```
requested  ─approve─▶  approved  ─finalize─▶  finalized
    │                     │                        │
    │                     ├─revoke─▶  (back to requested)
    ├─deny─▶  denied                              ─revoke─▶  (back to approved)
    │
    └─(if tier 2 needed)─▶  pending_higher  ─approve/deny─▶ …
```

Plain English:

- **requested** — someone just submitted it. Shows a `Req` pill on the asset row.
- **approved** — a supervisor said yes. Shows the event with no prefix.
- **finalized** — locked in, the schedule is official. Shows a `Final` pill.
- **pending_higher** — tier-1 approved but it needs a director too.
- **denied** — rejected. Shows a `Denied` pill.

### 1. Turn on the feature

In your WorksCalendar, pass a list of categories that should go through approval, and turn on the approvals block in config:

```jsx
<WorksCalendar
  assets={assets}
  assetRequestCategories={['vehicle', 'room', 'equipment']}
  initialView="assets"
  calendarId="team-alpha"
  ownerPassword={import.meta.env.VITE_OWNER_PASSWORD}
/>
```

Then as the owner, open the config panel → **Approvals** tab and flip `enabled` on. (Same tab lets you edit everything below without writing code.)

### 2. Decide who approves what

The owner config has a `tiers` array. The defaults are two tiers:

```js
approvals: {
  enabled: true,
  tiers: [
    { id: 'tier-1', label: 'Supervisor', requires: 'any', roles: ['supervisor'] },
    { id: 'tier-2', label: 'Director',   requires: 'all', roles: ['director'] },
  ],
}
```

- `requires: 'any'` — one person on that tier is enough.
- `requires: 'all'` — every listed role must approve before it moves on.
- One-tier setup? Delete tier-2. Three-tier? Add a tier-3.

### 3. Decide what buttons appear at each stage

Each stage has an `allow` list — those are the buttons approvers see:

```js
rules: {
  requested:      { allow: ['approve', 'deny'],       prefix: 'Req' },
  pending_higher: { allow: ['approve', 'deny'],       prefix: 'Pend' },
  approved:       { allow: ['finalize', 'revoke'],    prefix: '' },
  finalized:      { allow: ['revoke'],                prefix: 'Final' },
  denied:         { allow: ['revoke'],                prefix: 'Denied' },
}
```

Remove an action to hide the button. Change a `prefix` to change what shows on the pill.

### 4. Rename the buttons (optional)

Not every team says "Approve." Use the labels map:

```js
labels: {
  approve:  'Sign off',
  deny:     'Reject',
  finalize: 'Lock in',
  revoke:   'Undo',
}
```

### 5. What your users see

**The requester (proposer):** clicks **Request Asset** on the assets tab, fills in the form, submits. Their request shows up with a `Req` pill.

**The reviewer (approver):** clicks the caret next to any pill. A popover appears with exactly the buttons you allowed for that stage. One click moves the request forward or back.

**The audit trail:** every stage change is stamped with who did it and when. Open the Audit drawer on any event to see the full history — who requested, who approved, when it was finalized.

### 6. How to persist stage changes

The calendar never mutates approval stage on its own. When a button is clicked, WorksCalendar fires `onApprovalAction(eventId, action)`. Your handler:

1. Writes the new `meta.approvalStage = { stage, updatedAt, actorId }` on the event.
2. Appends a history entry.
3. Saves via the same path as a normal edit (`onEventSave` or your adapter).

Here's a minimal handler:

```js
async function handleApprovalAction(eventId, action) {
  const event = await loadEvent(eventId);
  const nextStage = advanceStage(event.meta.approvalStage?.stage, action);
  const updated = {
    ...event,
    meta: {
      ...event.meta,
      approvalStage: { stage: nextStage, updatedAt: new Date().toISOString(), actorId: me.id },
      approvalHistory: [
        ...(event.meta.approvalHistory ?? []),
        { action, stage: nextStage, actorId: me.id, at: new Date().toISOString() },
      ],
    },
  };
  await saveEvent(updated);
}
```

### Common patterns

| You want… | Do this |
| --- | --- |
| A one-step approval (no director tier) | Keep only `tier-1`; remove `pending_higher` from `allow` lists |
| Anyone on the team can approve | Leave `roles: []` — any authenticated user counts |
| Require two supervisors | `tier-1` with `requires: 'all'` and two roles listed |
| Hide denied items from the main view | Saved view with filter `approvalStage != 'denied'` |
| Only the owner can finalize | Remove `finalize` from `approved.allow` and handle it through a custom owner action |

## 7.6. Categories — color & organize your events (optional)

Categories are the second-most-used organizing axis after people. They color-code events, drive filters, and power the schedule workflow (PTO/Unavailable/Open-shift are all categories under the hood).

### Define them once in owner config

```jsx
<WorksCalendar
  categoriesConfig={{
    categories: [
      { id: 'training',  label: 'Training',   color: '#8b5cf6' },
      { id: 'customer',  label: 'Customer',   color: '#3b82f6' },
      { id: 'internal',  label: 'Internal',   color: '#64748b' },
      { id: 'on-call',   label: 'On-call',    color: '#f59e0b' },
    ],
  }}
/>
```

### Rules of thumb

- **Keep the list short.** Five categories are usable, fifteen are noise.
- **One color per category.** Don't reuse — the color is how people scan the month view.
- **Reserved ids** the calendar uses for scheduling: `pto`, `unavailable`, `availability`, `open-shift`, `covering`, `on-call`. Don't reuse these for custom categories.

Non-technical owners can edit the category list from the setup wizard (Step 10) — no code changes needed.

## 7.7. Recurring events (optional)

Use this when someone needs "every Monday at 9" or "the first Tuesday of each month." The calendar stores one event with an `rrule` string; the engine expands it into visible occurrences inside the date range you're looking at.

### Create a recurring event

When the user clicks **+ Add event**, the form has a **Repeats** dropdown. Behind the scenes, saved events look like:

```js
{
  id: 'standup',
  title: 'Morning standup',
  start: '2026-04-20T09:00:00',
  end:   '2026-04-20T09:30:00',
  rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
}
```

`rrule` follows the [iCalendar RRULE spec](https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html) — every other calendar on the planet speaks it.

### Editing one occurrence vs. the whole series

When a user drags or edits a single instance of a recurring event, the calendar pops a scope picker:

- **Just this occurrence** — detaches that one, leaves the series alone.
- **This and future** — splits the series at that date.
- **All events in the series** — updates the master rule.

You don't wire this up — it fires automatically. Your save handler just receives the resulting ops.

### Patterns to copy

| You want… | RRULE |
| --- | --- |
| Every weekday | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Every other Monday | `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO` |
| First of every month | `FREQ=MONTHLY;BYMONTHDAY=1` |
| First Tuesday of every month | `FREQ=MONTHLY;BYDAY=1TU` |
| 10 times, then stop | append `;COUNT=10` |
| Until a fixed date | append `;UNTIL=20260701T000000Z` |

## 7.8. Grouping — rows by team, role, or location (optional)

Grouping splits any row-based view (timeline, schedule, assets) into collapsible bands. Instead of a flat list of 40 people, you get "Field Ops (12)", "Dispatch (8)", "Management (4)" — each collapsible.

```jsx
<WorksCalendar
  initialView="timeline"
  employees={employees}
  groupBy="role"
/>
```

Common fields to group by:

- `role` — "Nurses / Doctors / Admin"
- `team` — "Field Ops / Back Office"
- `location` — "Chicago / Austin / Remote"
- Any custom field you put on employees or events

### Let users change it at runtime

Expose the **Group by** dropdown:

```jsx
<WorksCalendar
  groupByOptions={[
    { field: 'role',     label: 'Role' },
    { field: 'team',     label: 'Team' },
    { field: 'location', label: 'Location' },
    { field: null,       label: 'No grouping' },
  ]}
/>
```

Full API: [Grouping API](./GROUPING_API.md). Runnable demo: `examples/09-Grouping.jsx`.

## 7.9. Conflict detection (optional)

Stop double-bookings before they save. The conflict engine warns when a new or edited event overlaps another event on the same person, asset, or resource.

### Turn it on in owner config

Open the Config panel → **Conflicts** tab and flip `enabled`. Or set it in code on first load:

```js
config.conflicts = {
  enabled: true,
  rules: [
    { scope: 'employee', action: 'warn'  },  // two events on the same person → warning
    { scope: 'asset',    action: 'block' },  // two events on the same vehicle → block save
  ],
};
```

### Three actions to choose from

| Action | What it does |
| --- | --- |
| `warn` | Shows a yellow banner in the event form. User can still save. |
| `block` | Save button disabled until the conflict is resolved. |
| `silent` | Conflict is recorded in the event's metadata but no UI interruption. Useful for later reports. |

### Use the engine directly

If you want to check before saving (e.g., in your server-side API), import the engine:

```js
import { checkConflicts } from 'works-calendar/core/conflictEngine';

const result = checkConflicts(newEvent, allEvents, rules);
if (result.blocked) return { error: result.reasons };
```

## 8. Pick a theme

Pick one packaged theme or roll your own with CSS.

```jsx
import 'works-calendar/styles';
import 'works-calendar/styles/ocean'; // pick one

<WorksCalendar theme="ocean" />
```

Packaged themes: `aviation`, `soft`, `minimal`, `corporate`, `forest`, `ocean`.

Want your own colors? Override the CSS variables — see any theme file in `src/themes/` for the full list.

## 9. Let outsiders book time (optional)

If customers, patients, or students need to request time without logging in, drop in the external form:

```jsx
import { CalendarExternalForm, createLocalStorageDataAdapter } from 'works-calendar';

const adapter = createLocalStorageDataAdapter({ key: 'intake' });

<CalendarExternalForm adapter={adapter} />
```

Swap the adapter for Supabase, Google, M365, or your own API — the form doesn't care.

## 10. Turn on the setup wizard & owner mode (optional)

The calendar has two modes built in: **viewer** (default — most users) and **owner** (admin — the person who sets up theme, team, categories, and saved views). Owner mode is unlocked with a password you choose.

### Why owner mode matters

Without it, everyone sees the same screen and has the same power. With it:

- Viewers see only the calendar and the filters you allow.
- Owners see the config panel (Approvals, Conflicts, Team, Categories, Theme), the setup wizard, and the magic-wand button.
- You can put the owner password in an env var so only you (or your manager) can flip into admin mode.

### Turn it on

```jsx
<WorksCalendar
  calendarId="team-alpha"
  ownerPassword={import.meta.env.VITE_OWNER_PASSWORD}
  events={events}
  onEventSave={handleSave}
/>
```

First load triggers the **Setup Wizard** — a modal that walks the owner through theme, team, categories, and starter saved views. It opens once. The owner can reopen it anytime via the wand button.

### Rules of thumb

- **Use a real password**, not `admin` or `demo`. Viewers can see your bundled JS.
- **Give every physical calendar a unique `calendarId`.** All owner config is keyed by it.
- **Rotate the password** if a former admin leaves the team.
- **Never commit the password to Git.** Use env vars, same as the Google/M365 client IDs.

More: [Setup wizard](./SetupWizard.md).

## 10.5. Bulk-import events from a spreadsheet (optional)

Use this when a team hands you a CSV of last year's schedule or an Excel export from their old tool. The calendar ships with a **CSV Import** dialog that maps columns to event fields and drops the result straight into the calendar.

### Minimum CSV shape

```csv
title,start,end,employeeId,category
Morning Standup,2026-04-20 09:00,2026-04-20 09:30,alex,internal
Onsite Visit,2026-04-20 13:00,2026-04-20 15:00,sam,customer
```

### Show the import button

```jsx
<WorksCalendar
  allowCsvImport
  events={events}
  onEventSave={handleSave}
/>
```

Owners click **Import CSV** → pick a file → map columns → preview → save. Errors surface per-row so a bad date in row 47 doesn't kill the other 499 rows.

Want to run the parser yourself (e.g., to import on the server)?

```js
import { parseCsv } from 'works-calendar/core/csvParser';
const { events, errors } = parseCsv(fileText, { columnMap });
```

Excel (`.xlsx`) works too — install `xlsx` as an optional dep (Section 3f) and the dialog gains native Excel support.

## 11. Ship it

The calendar is just a React component, so it deploys wherever React deploys. Fastest free paths:

- **Vercel**: `npx vercel` in your project folder.
- **Netlify**: drag the `dist/` folder to https://app.netlify.com/drop after `npm run build`.
- **GitHub Pages**: `npm run build` and push `dist/` to the `gh-pages` branch.

If you're using Google or Microsoft sync, remember to add your production URL to the **Authorized origins / Redirect URIs** list in the provider guide you followed.

## 12. Pick-your-path cheat sheet

Not sure which combination fits you? Start here.

| You are… | Start with | Then add |
| --- | --- | --- |
| A hobbyist tracking your own stuff | LocalStorage + month view | Themes, recurring events |
| A small business owner with 2–20 staff | Custom API or Supabase + `schedule` view | Team, availability, categories, external form |
| A contractor / freelancer | LocalStorage + Google sync | External form for client bookings, categories |
| A shift-based team (clinic, restaurant, ops) | Supabase + `schedule` view + employees | PTO workflow, saved views, conflict detection, CSV import for last year's schedule |
| A fleet / rental / room-booking business | Supabase + `assets` view | Approvals workflow, timeline view, external form |
| An internal tool inside Microsoft 365 | M365 sync + `week` view | Setup wizard, owner mode, saved views |
| A school / church / community group | iCal feed + `month` view | Categories, themes, grouping by classroom/room |
| Multiple teams in one calendar | Supabase + `timeline` + grouping | Saved views per team, multi-source merging |
| A regulated org (HIPAA, finance) | Custom API + owner mode + approvals | Audit drawer, conflict detection with `block`, [HIPAA notes](./HIPAA-Security.md) |

## What to read next

- [DataAdapter pattern](./DataAdapter.md) — when you're ready to write a custom adapter.
- [Filtering system](./Filtering.md) — saved views, schema filters.
- [Schedule workflow](./ScheduleWorkflow.md) — PTO → uncovered → coverage details.
- [Roadmap](./Roadmap.md) — what's coming.

Stuck? Open an issue: https://github.com/natehorst240-sketch/CalendarThatWorks/issues

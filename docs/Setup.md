# Setup: build your calendar in 10 minutes

This page walks you from `npm install` to a working calendar that knows your team, saves to your database, and (optionally) syncs with Google or Microsoft 365. No prior React-calendar experience required.

Work through it top to bottom. Every step is optional after Step 1 — pick only the pieces you need.

> **Rule of thumb:** if a step doesn't match what you want, skip it. The calendar will still work.

## Table of contents

1. [Install](#1-install)
2. [Put a calendar on the page](#2-put-a-calendar-on-the-page)
3. [Pick where your events live](#3-pick-where-your-events-live)
4. [Pick which views to show](#4-pick-which-views-to-show)
5. [Add your team (optional)](#5-add-your-team-optional)
6. [Turn on team scheduling (optional)](#6-turn-on-team-scheduling-optional)
7. [Track things, not just people (optional)](#7-track-things-not-just-people-optional)
8. [Pick a theme](#8-pick-a-theme)
9. [Let outsiders book time (optional)](#9-let-outsiders-book-time-optional)
10. [Turn on the setup wizard (optional)](#10-turn-on-the-setup-wizard-optional)
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

### 3d. Google Calendar

Full walkthrough: **[Google Calendar setup](./GoogleCalendarSetup.md)**. ~20 minutes, mostly clicking around Google Cloud Console once.

### 3e. Microsoft 365 / Outlook

Full walkthrough: **[Microsoft 365 setup](./Microsoft365Setup.md)**. ~20 minutes, mostly registering an app in Entra (Azure AD).

### 3f. iCal / .ics feed (read-only)

Perfect for pulling in a school calendar, sports schedule, or public holidays.

```jsx
import { ICSAdapter } from 'works-calendar/api/v1/adapters/ICSAdapter';
const adapter = new ICSAdapter({ url: 'https://example.com/holidays.ics' });
```

### 3g. Excel import/export

Install the optional dep:

```bash
npm install xlsx
```

Then use the export helpers in `src/export/excelExport.js` to dump events or hand your users an Upload button.

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

## 6. Turn on team scheduling (optional)

This is WorksCalendar's headline feature. Use `initialView="schedule"` and the workflow turns on automatically:

- Mark an employee unavailable (PTO, sick).
- Any of their shifts on that day become **uncovered**.
- Other employees can be assigned to cover.
- Saved views remember filters like "show only uncovered shifts."

Read the full walkthrough: [Schedule workflow guide](./ScheduleWorkflow.md).

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

## 10. Turn on the setup wizard (optional)

Give non-technical owners a first-time walkthrough (theme, team, categories, smart views):

```jsx
<WorksCalendar
  calendarId="team-alpha"
  ownerPassword={import.meta.env.VITE_OWNER_PASSWORD}
  events={events}
  onEventSave={handleSave}
/>
```

The wizard opens once. The owner can reopen it with the wand button.

More: [Setup wizard](./SetupWizard.md).

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
| A hobbyist tracking your own stuff | LocalStorage + month view | Themes |
| A small business owner with 2–20 staff | Custom API or Supabase + `schedule` view | Team, external form |
| A contractor / freelancer | LocalStorage + Google sync | External form for client bookings |
| A shift-based team (clinic, restaurant, ops) | Supabase + `schedule` view + employees | PTO workflow, saved views |
| A fleet / rental / room-booking business | Supabase + `assets` view | Timeline view, external form |
| An internal tool inside Microsoft 365 | M365 sync + `week` view | Setup wizard |
| A school / church / community group | iCal feed + `month` view | Themes |

## What to read next

- [DataAdapter pattern](./DataAdapter.md) — when you're ready to write a custom adapter.
- [Filtering system](./Filtering.md) — saved views, schema filters.
- [Schedule workflow](./ScheduleWorkflow.md) — PTO → uncovered → coverage details.
- [Roadmap](./Roadmap.md) — what's coming.

Stuck? Open an issue: https://github.com/natehorst240-sketch/CalendarThatWorks/issues

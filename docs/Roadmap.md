# WorksCalendar Feature Roadmap

Features ordered from easiest to hardest to implement. Each tier reflects implementation complexity, not priority — see the bottom of this doc for the recommended release sequencing.

---

## Tier 1 — Easy (days each, mostly additive)

These require no new infrastructure, no external APIs, and touch a small number of files.

### Webhook / REST hook for external integrations
The REST adapter already exists. Add an `onEventChange` webhook config that POSTs a JSON payload to a caller-supplied URL whenever an event is created, updated, or deleted. One new config field, one `fetch` call in the mutation pipeline.

### Event templates / quick-create
Add a `templates: EventTemplate[]` config prop. Each template pre-fills `title`, `category`, `duration`, and any `customFields`. Render them as a "New from template" dropdown on the toolbar. Pure UI + config — no engine changes.

### Calendar import from URL (webcal:// subscribe)
The ICS parser already covers file import. Extend it to accept a URL string and `fetch` the `.ics` on mount (and on a configurable refresh interval). One new prop: `icsSubscriptions: string[]`.

### Full-text search
Add a `<SearchBar>` component to the toolbar. Index event `title`, `description`, `location`, and employee names client-side using [Fuse.js](https://fusejs.io/) (adequate for < 10 k events). Results open a flat list that jumps to the event on click. No server changes required unless the host opts into server-side search.

---

## Tier 2 — Moderate (a few days each, new UI components or small model changes)

### Mini calendar / sidebar date picker
Add a `<MiniCalendar>` component (small month grid, read-only) that syncs `currentDate` with the main view. Renders in a collapsible sidebar. Clicking a date fires `onNavigate`. No data-layer changes — pure presentation.

### Print / PDF export
Add `@media print` CSS rules that hide chrome and reflow events into a compact grid. Expose a `printView()` method and a toolbar button. For PDF, add an optional `onExportPDF` prop; the host calls `html2canvas` + `jspdf` (or any preferred library) on the rendered node. WorksCalendar just needs to expose a stable `data-print-root` attribute.

### All-day & multi-day event rendering
Add an `allDay?: boolean` flag to the event schema. In week/day view, render `allDay` events in a dedicated header row pinned above the time grid. Multi-day events (where `end - start > 24 h`) span across day columns visually. Engine impact: none. UI impact: layout changes in `CalendarViewGrid` and the day/week header.

### Custom event fields
Add `customFields: { key: string; label: string; type: 'text' | 'number' | 'select' | 'boolean'; options?: string[]; required?: boolean }[]` to `CalendarConfig`. Render them dynamically in the event form below the built-in fields. Store values in `event.meta.custom`. No engine changes.

### Bulk operations
Add a multi-select mode toggled by `Shift+click` / `Cmd+click` on events. Track selected event IDs in local state. Show a sticky bulk-action toolbar when ≥ 2 events are selected: **Delete selected**, **Move selected** (date picker), **Copy selected**. Engine operations already support individual deletes/moves — bulk just batches them.

### Event comments / threaded discussions
Add `comments?: { id: string; author: string; text: string; timestamp: string }[]` to the event schema. Render a collapsible comment thread in the event detail panel with an add-comment form. Comments persist via the existing data adapter (`updateEvent`). No backend protocol changes.

---

## Tier 3 — Involved (a week or more each, cross-cutting concerns or significant new subsystems)

### Recurring event exception handling
The scaffolding exists in `recurringMutations.ts`. What's missing is the **dialog**: when a user edits or deletes a recurring event instance, present "Edit this occurrence only / Edit this and all future / Edit all occurrences." Each path needs a distinct engine operation. The `EXDATE` / `RDATE` path (exception dates) is the hardest part — the recurrence expander must skip excluded dates on every render.

### Notifications / reminders
Add a `reminders` array to events: `{ minutesBefore: number; method: 'browser' | 'callback' }[]`. For `'browser'`, register a `setTimeout` (or `setInterval` polling loop for PWA) that calls `Notification.requestPermission()` and fires the Web Notifications API. For `'callback'`, invoke a host-supplied `onReminder(event)`. A service-worker `notificationclick` handler brings the app into focus. Requires careful lifecycle management when the user navigates away.

### Timezone handling
Add `timezone?: string` (IANA zone name) to `CalendarConfig` and a `<TimezonePicker>` component. Integrate `date-fns-tz` to convert all display times into the configured zone. Store events in UTC internally (already the right convention if `start`/`end` are ISO strings). The main complexity is the DST boundary display ("spring forward" gaps, "fall back" doubles) and the timezone offset header in day/week view. Test matrix expands significantly.

### Calendar overlays / multi-calendar view
Add a `calendars?: { id: string; label: string; color: string; events: WorksCalendarEvent[] }[]` prop alongside the existing `events` prop. Merge events from all sources before conflict detection, carrying `calendarId` through to the render layer for color coding. Add a legend/filter toggle to show/hide individual calendars. Conflict detection must remain source-aware so cross-calendar conflicts can be flagged or suppressed per config.

### Offline support / PWA
The `SyncQueue` and `SyncManager` exist. What's missing: a **service worker** (`sw.ts`) that caches the app shell and the current month's events, and a background-sync handler that drains the queue when connectivity is restored. New complexity: merge conflicts when local edits race with server changes during reconnection; a `conflictResolution` policy prop is needed.

---

## Tier 4 — Hard (weeks each, external APIs, OAuth, and infrastructure)

### Video conferencing auto-integration
Add `conferencing?: { provider: 'zoom' | 'meet' | 'teams'; autoGenerate: boolean }` to events. Generating real links requires OAuth tokens for each provider (Zoom OAuth, Google OAuth with Calendar scope for Meet, Azure AD for Teams). The host app holds the tokens and supplies a `createConferencingLink(provider, event): Promise<string>` callback. WorksCalendar calls it during event creation and stores the URL. Complexity is almost entirely on the OAuth + provider-API side.

### Event invitations & RSVP
Add `attendees?: { email: string; name?: string; status: 'pending' | 'accepted' | 'declined' | 'tentative' }[]` to events. On save, generate a `.ics` attachment and send invite emails via a host-supplied `sendInvitation(attendee, icsBlob)` callback (or a built-in SMTP/SendGrid adapter). Render RSVP status chips in the event detail. Track status changes via a callback endpoint that the host wires to their email provider's webhook. The hardest part is the email delivery + reply-parsing pipeline.

### Google Calendar / Outlook two-way sync
Two separate integrations, each with full OAuth 2.0 flows, token refresh, webhook/push-notification registration, and delta-sync logic. Google Calendar uses the Events API + push notifications (Cloud Pub/Sub or webhook). Microsoft Graph uses the Calendar API + change notifications (webhooks). The engine must reconcile remote changes with local state without duplicating events. Plan for: incremental sync tokens (Google `syncToken`, Graph `deltaLink`), conflict resolution, and rate-limit back-off. This is the largest single feature on this list.

---

## Release sequencing (recommended)

| Release | Features |
|---------|----------|
| **1.0.0** | Timezone handling · All-day event rendering · Recurring exception UI · Mini calendar navigation |
| **1.1.0** | Full-text search · Custom event fields · Print/PDF export · Event templates · Bulk operations |
| **1.2.0** | Notifications/reminders · Offline/PWA · Calendar overlays · Event comments |
| **1.3.0** | Google Calendar sync · Event invitations/RSVP · Video conferencing integration |
| **2.0.0** | Outlook two-way sync · Webhook subscriptions · Calendar sharing & permissions |

The first two releases can ship with no external API dependencies. Releases 1.3 and beyond require OAuth infrastructure and are better suited to a hosted/SaaS context.

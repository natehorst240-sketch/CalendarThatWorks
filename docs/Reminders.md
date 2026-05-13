# Reminders

CalendarThatWorks supports per-event reminders via two delivery methods: browser push notifications and a host-supplied callback. Reminders are configured on individual events and scheduled by the `useReminders` hook.

## ReminderDef

```ts
interface ReminderDef {
  minutesBefore: number;  // minutes before event start to fire
  method: 'browser' | 'callback';
}
```

- **`'browser'`** — fires a [Web Notification](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API). Requires the user to grant permission.
- **`'callback'`** — invokes the `onReminder` prop on `<WorksCalendar>` instead of showing a system notification.

## Attaching reminders to events

Add a `reminders` array to any event:

```ts
const events = [
  {
    id: '1',
    title: 'Team standup',
    start: '2024-11-01T09:00:00',
    end:   '2024-11-01T09:30:00',
    reminders: [
      { minutesBefore: 10, method: 'browser' },
      { minutesBefore: 5,  method: 'callback' },
    ],
  },
];
```

## The `onReminder` prop

When a reminder with `method: 'callback'` fires, the `onReminder` prop is called:

```ts
type ReminderCallback = (event: WorksCalendarEvent, reminder: ReminderDef) => void;
```

```tsx
<WorksCalendar
  events={events}
  onReminder={(event, reminder) => {
    console.log(`Reminder: ${event.title} starts in ${reminder.minutesBefore} min`);
    // send a push notification, play a sound, show a toast, etc.
  }}
/>
```

## Browser permission flow

For `method: 'browser'`, the calendar calls `Notification.requestPermission()` once — the first time a browser reminder is registered. The request is not re-issued on subsequent renders or page loads. If the user denies permission, browser reminders silently do nothing; callback reminders are unaffected.

## Key behaviors

### Reminders fire against `expandedEvents` (pre-filter)

Timers are scheduled against the full expanded event list **before** any active filters are applied. This means a reminder fires even when its event is currently hidden by a filter (e.g., a category filter or source toggle). This is intentional: a hidden event is still a real event on your calendar.

### Timers are rebuilt on page load

`useReminders` re-registers all timers whenever the events array changes and clears them all on unmount. There is **no service-worker persistence** — if the tab is closed and reopened, reminders that already fired are gone, and any future reminders are re-scheduled from the new page load time.

### Past reminders are silently skipped

If `eventStart − minutesBefore` is less than 1 second from now (already passed, or effectively immediate), the reminder is skipped. This prevents notification spam when you reload a page near the start time of an event.

### All-day events are skipped

All-day events have no meaningful fire time, so their reminders are never scheduled.

## Working example

```tsx
import { WorksCalendar } from 'calendarthatworks';
import type { WorksCalendarEvent, ReminderDef } from 'calendarthatworks';

const events: WorksCalendarEvent[] = [
  {
    id: '1',
    title: 'Weekly planning',
    start: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    end:   new Date(Date.now() + 90 * 60 * 1000),
    reminders: [
      { minutesBefore: 15, method: 'browser' },   // → Web Notification
      { minutesBefore: 5,  method: 'callback' },  // → onReminder
    ],
  },
];

function handleReminder(event: WorksCalendarEvent, reminder: ReminderDef) {
  // Example: show a custom toast
  showToast(`${event.title} starts in ${reminder.minutesBefore} min`);
}

export default function App() {
  return (
    <WorksCalendar
      events={events}
      onReminder={handleReminder}
    />
  );
}
```

## Using `useReminders` standalone

`useReminders` is exported for cases where you manage your own event list outside `<WorksCalendar>`:

```ts
import { useReminders } from 'calendarthatworks/hooks';

useReminders(normalizedEvents, onReminder);
```

It takes an array of `NormalizedEvent` (the internal shape produced by `useNormalizedEvents`) and an optional `ReminderCallback`. The hook is effect-only — it returns nothing.

## Limitations

| Limitation | Detail |
|---|---|
| No persistence across page loads | Timers use `setTimeout`; closing the tab cancels all pending reminders. |
| No service-worker support | There is no background delivery mechanism. |
| Past reminders skipped silently | Reminders < 1 s away at schedule time are dropped with no error or log. |
| All-day events not supported | Only timed events produce reminder timers. |
| Browser permission is one-time | Once denied by the user, `'browser'` reminders are permanently silent until the user manually re-enables them in browser settings. |

## References

- `src/hooks/useReminders.ts`
- `src/types/events.ts` — `ReminderDef`, `WorksCalendarEvent`, `NormalizedEvent`
- `src/ui/EventFormSections/RemindersSection.tsx`
- `docs/diagrams/level3h.mmd` / `level3h.png`

# Calendar Sources

CalendarThatWorks supports multiple concurrent calendar sources — iCal (ICS) feeds and imported CSV datasets. Each source has its own color, and sources can be toggled on or off without a page reload. The `CalendarLegend` component renders a color-dot toggle list so users can show or hide individual calendars.

## How sources are stored

Sources are managed by `useSourceStore`, which persists them to `localStorage` under the key `wc-sources-<calendarId>`. Each calendar instance (identified by its `calendarId` prop) has its own independent store.

On first load, the store automatically migrates any legacy `wc-feeds-<calendarId>` entries to the new unified format.

### Source types

| Type | Description |
|---|---|
| `'ics'` | iCal feed fetched by URL at a configurable `refreshInterval` |
| `'csv'` | Pre-parsed event dataset imported by the user |

```ts
// ICS source shape
{
  id: string;
  type: 'ics';
  label: string;
  color: string;         // hex color applied to all events from this feed
  enabled: boolean;
  url: string;
  refreshInterval: number; // milliseconds; default 300 000 (5 min)
  addedAt: string;         // ISO timestamp
}

// CSV source shape
{
  id: string;
  type: 'csv';
  label: string;
  color: string;
  enabled: boolean;
  events: WorksCalendarEvent[];
  importedAt?: string;
  addedAt: string;
}
```

## The `showCalendarLegend` prop

Set `showCalendarLegend={true}` to render a color-dot toggle list at the bottom of the built-in sidebar. The legend shows all sources (ICS and CSV) and lets users toggle visibility and cycle through preset colors.

```tsx
<WorksCalendar
  calendarId="my-app"
  events={myEvents}
  icalFeeds={[{ url: 'https://example.com/calendar.ics', label: 'Work' }]}
  showCalendarLegend={true}
/>
```

## How source colors propagate onto events

Color assignment flows through `useSourceAggregator`:

1. The aggregator builds two lookup maps from `sourceStore.sources`: `sourceColorById` (id → color) and `labelToSourceId` (label → id).
2. For each ICS event, it resolves the source ID — store-managed feeds use their UUID (looked up by label); prop-level `icalFeeds` fall back to the label string as `_sourceId`.
3. When a matching `sourceColorById` entry exists, the event's `color` field is overwritten with the source color. This value ends up on `NormalizedEvent.color`.
4. CSV source events receive their source color the same way.

The resolved `_sourceId` is stable across label renames for store-managed sources, because the store UUID is used rather than the mutable label string.

### Source ID resolution summary

| Feed origin | `_sourceId` value |
|---|---|
| Store-managed ICS feed | Store UUID (`src_…`) |
| Prop-level `icalFeeds` | Feed's `label` string |
| CSV source | Store UUID (`src_…`) |

## Toggling a source

Calling `toggleSource(id)` flips the `enabled` flag in the store. On the next render cycle, `useSourceAggregator` re-derives its active source lists, the aggregated event stream updates, and the calendar re-renders — all in one pass. There is no debounce or animation delay.

## `LegendSource` type

```ts
interface LegendSource {
  id: string;
  label: string;
  color: string;
  enabled: boolean;
  eventCount?: number; // optional count badge shown in the legend
}
```

## `CalendarLegend` standalone export

`CalendarLegend` is exported as a named component for use outside the built-in sidebar:

```ts
import { CalendarLegend } from 'calendarthatworks';
import type { LegendSource } from 'calendarthatworks';
```

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `sources` | `LegendSource[]` | Yes | List of sources to display |
| `onToggle` | `(id: string) => void` | Yes | Called when a source label is clicked |
| `onColorChange` | `(id: string, color: string) => void` | No | Called when the color dot is clicked; cycles through preset colors |

`CalendarLegend` renders nothing when `sources` is empty.

## Working examples

### Using `showCalendarLegend` (simplest)

```tsx
import { WorksCalendar } from 'calendarthatworks';

export default function App() {
  return (
    <WorksCalendar
      calendarId="team-calendar"
      events={myEvents}
      icalFeeds={[
        { url: 'https://example.com/work.ics',     label: 'Work',     refreshInterval: 300_000 },
        { url: 'https://example.com/personal.ics', label: 'Personal', refreshInterval: 600_000 },
      ]}
      showCalendarLegend={true}
    />
  );
}
```

### Using `CalendarLegend` outside the sidebar

```tsx
import { useState } from 'react';
import { WorksCalendar, CalendarLegend } from 'calendarthatworks';
import type { LegendSource } from 'calendarthatworks';

const initialSources: LegendSource[] = [
  { id: 'work',     label: 'Work',     color: '#3b82f6', enabled: true },
  { id: 'personal', label: 'Personal', color: '#10b981', enabled: true },
];

export default function App() {
  const [sources, setSources] = useState(initialSources);

  function toggle(id: string) {
    setSources(prev =>
      prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    );
  }

  function changeColor(id: string, color: string) {
    setSources(prev =>
      prev.map(s => s.id === id ? { ...s, color } : s)
    );
  }

  // Filter events based on enabled sources
  const visibleEvents = myEvents.filter(ev =>
    sources.find(s => s.id === ev._sourceId)?.enabled !== false
  );

  return (
    <div style={{ display: 'flex', gap: '1rem' }}>
      <aside>
        <CalendarLegend
          sources={sources}
          onToggle={toggle}
          onColorChange={changeColor}
        />
      </aside>
      <WorksCalendar
        calendarId="team-calendar"
        events={visibleEvents}
      />
    </div>
  );
}
```

## References

- `src/hooks/useSourceAggregator.ts`
- `src/hooks/useSourceStore.ts`
- `src/ui/CalendarLegend.tsx`
- `docs/diagrams/level3i.mmd` / `level3i.png`

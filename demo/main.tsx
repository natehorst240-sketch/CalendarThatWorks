/**
 * works-calendar — public demo deployed to workscalendar.com.
 *
 * One dataset, every tab. Trucks (assets), drivers (employees), facilities
 * (bases) all share IDs / hub codes so the Month / Week / Schedule / Base /
 * Assets / Dispatch tabs all read off the same source of truth. The
 * dispatch board is just one window onto the fleet — switch tabs and you
 * see the same trucks and drivers grouped a different way.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorksCalendar } from '../src/index';
import type { WorksCalendarEvent } from '../src/index';
import { TRUCKS, TRUCK_ROUTES, DRIVERS, BASES, REGIONS } from './truckDemoData';
import '../src/styles/soft.css';

const CALENDAR_ID = 'dispatch-demo-v3';

// The static dataset is anchored at 2025-07-07 UTC for human-readability.
// Shift every event by (today − anchor) at load so the demo always lands
// on the current week — otherwise the slider window sits in 2025 and the
// map is empty for anyone visiting the deployed demo.
const DATASET_ANCHOR_MS = Date.UTC(2025, 6, 7); // months are 0-indexed
const todayMidnight = new Date();
todayMidnight.setUTCHours(0, 0, 0, 0);
const DEMO_TIME_OFFSET_MS = todayMidnight.getTime() - DATASET_ANCHOR_MS;

function shift(value: Date | string): Date {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return new Date(t + DEMO_TIME_OFFSET_MS);
}

const ASSETS = TRUCKS.map((t) => {
  const driver = DRIVERS.find((d) => d.id === t.id);
  return {
    id: t.id,
    label: `${t.id} — ${t.name}`,
    group: t.hub,
    meta: {
      color: driver?.color,
      type: t.type,
      capacity: t.capacity,
      base: t.hub,
      hub: t.hub,
      driverId: t.id,
      driverName: driver?.name ?? '',
    },
  };
});

// One event stream covers the whole demo. The dispatch board reads each
// stop's `meta.lat/lng/facilityCode/stopType` to draw the truck on the
// map; the Schedule / Base grids draw the driver's duty *shift* (start
// of first stop → end of last stop on that calendar day), tagged with
// category='shift' so the schedule-tab scope predicate lets them in.
// The same resource id binds both records to the same driver/truck.
const STOP_EVENTS: WorksCalendarEvent[] = TRUCK_ROUTES.flatMap((r) =>
  r.events.map((ev) => ({
    id: ev.id,
    title: ev.title,
    start: shift(ev.start),
    end: shift(ev.end),
    allDay: false,
    resource: ev.resource,
    meta: ev.meta,
  })),
);

// Synthesize one duty-shift event per (driver × calendar day) from the
// segment depart/arrive times so the Schedule + Base + Month / Week / Day
// views light up with each driver's daily window. Categorising the shift
// as 'shift' triggers the schedule-tab inclusion predicate (see
// `isScheduleWorkflowEvent` in works-calendar-engine).
function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
}

const SHIFT_EVENTS: WorksCalendarEvent[] = TRUCK_ROUTES.flatMap((r) => {
  const driverId = r.truck.id;
  const byDay = new Map<string, { start: Date; end: Date }>();
  for (const seg of r.segments) {
    const depart = shift(seg.depart);
    const arrive = shift(seg.arrive);
    const key = dayKey(depart);
    const existing = byDay.get(key);
    if (!existing) {
      byDay.set(key, { start: depart, end: arrive });
    } else {
      if (depart < existing.start) existing.start = depart;
      if (arrive > existing.end) existing.end = arrive;
    }
  }
  return Array.from(byDay.entries()).map(([key, win]) => ({
    id: `shift-${driverId}-${key}`,
    title: `${r.truck.name} — duty`,
    start: win.start,
    end: win.end,
    allDay: false,
    resource: driverId,
    category: 'shift',
    meta: { kind: 'shift', truckId: driverId, base: r.truck.hub },
  }));
});

const FLEET_EVENTS: WorksCalendarEvent[] = [...STOP_EVENTS, ...SHIFT_EVENTS];

// Seed the calendar's owner config so the Base + Schedule views have a
// bases/regions registry to draw rows from. The config layer is normally
// editable through the in-app gear panel + persisted to localStorage; for
// the demo we just write straight to the same localStorage key on boot so
// the data is there before WorksCalendar's first render.
try {
  const key = `wc-config-${CALENDAR_ID}`;
  if (typeof window !== 'undefined' && !window.localStorage.getItem(key)) {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        title: 'Fleet Dispatch Demo',
        team: {
          locationLabel: 'Base',
          assetsLabel: 'Truck',
          roles: ['Driver', 'Dispatcher', 'Mechanic'],
          bases: BASES.map((b) => ({ id: b.id, name: b.name, regionId: b.regionId })),
          regions: REGIONS,
        },
      }),
    );
  }
} catch {
  // localStorage unavailable (private mode / SSR) — fall through; the
  // tabs that read bases/regions will just render empty.
}

function DemoApp() {
  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <WorksCalendar
        calendarId={CALENDAR_ID}
        initialView="dispatch"
        events={FLEET_EVENTS}
        assets={ASSETS}
        employees={DRIVERS.map((d) => ({
          id: d.id,
          name: d.name,
          base: d.base,
          role: d.role,
          color: d.color,
        }))}
        showCalendarLegend={false}
        showOfflineIndicator={false}
      />
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<DemoApp />);

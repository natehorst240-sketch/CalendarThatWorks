/**
 * works-calendar — public demo deployed to workscalendar.com.
 *
 * The calendar is the host. The dispatch board is just its 'dispatch'
 * view, fed the same events any other view would render. Switch to
 * Month / Week / Day in the toolbar to see the same fleet data
 * through a traditional calendar grid.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorksCalendar } from '../src/index';
import type { WorksCalendarEvent } from '../src/index';
import { TRUCKS, TRUCK_ROUTES, FACILITIES } from './truckDemoData';
import '../src/styles/soft.css';

// Truck colors — keyed by position in the TRUCKS roster so they stay
// stable across reloads. Lifted from the original dispatch board demo.
const FLEET_PALETTE = [
  '#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#2980b9',
  '#8e44ad', '#c0392b', '#d35400', '#16a085', '#2c3e50',
];

const ASSETS = TRUCKS.map((t, i) => ({
  id: t.id,
  label: `${t.id} — ${t.name}`,
  group: t.hub,
  meta: {
    color: FLEET_PALETTE[i % FLEET_PALETTE.length]!,
    type: t.type,
    capacity: t.capacity,
    hub: t.hub,
  },
}));

// Flatten every truck's route legs into a single event stream. Each event
// already carries `meta.lat/lng/facilityCode/facilityName/stopType` — the
// convention the dispatch view's deriveData reader expects.
const FLEET_EVENTS: WorksCalendarEvent[] = TRUCK_ROUTES.flatMap((r) =>
  r.events.map((ev) => ({
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: false,
    resource: ev.resource,
    meta: ev.meta,
  })),
);

function DemoApp() {
  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <WorksCalendar
        calendarId="dispatch-demo-v2"
        initialView="dispatch"
        events={FLEET_EVENTS}
        assets={ASSETS}
        showCalendarLegend={false}
        showOfflineIndicator={false}
      />
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<DemoApp />);

/**
 * Example 7 — Multi-Source Timeline
 *
 * Combines two capabilities that shine together:
 *   1. Timeline (schedule) view — one resource row per person
 *   2. Source filter pills     — one source per calendar feed
 *
 * In a real app each source would be an ICS feed URL or API endpoint.
 * Here events are tagged with _sourceId / _sourceLabel directly to show
 * the same filtering behaviour without a network dependency.
 *
 * Four simulated calendars feed into one timeline:
 *   "Personal"    — individual blocks, focus time, 1-on-1s
 *   "Team Shared" — standups, sprint ceremonies (everyone's visible)
 *   "HR"          — company-wide events, holidays, on-call rotations
 *   "External"    — customer calls, vendor syncs, conferences
 *
 * Try:
 *   • Filter to a single source to declutter the view
 *   • Combine source + resource filters ("Alice's external calls only")
 *   • Drag a bar to reassign or reschedule, then save a view of the result
 */
import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.ts';

// ── Team ──────────────────────────────────────────────────────────────────────
const TEAM = [
  { id: 'alice',  name: 'Alice Park',   role: 'Engineering Lead',  color: '#3b82f6' },
  { id: 'ben',    name: 'Ben Torres',   role: 'Senior Engineer',   color: '#10b981' },
  { id: 'carla',  name: 'Carla Singh',  role: 'Software Engineer', color: '#8b5cf6' },
  { id: 'dan',    name: 'Dan Okafor',   role: 'DevOps / SRE',      color: '#f59e0b' },
  { id: 'elena',  name: 'Elena Wu',     role: 'Product Manager',   color: '#ec4899' },
];

// ── Sources ───────────────────────────────────────────────────────────────────
const SRC = {
  personal: { id: 'personal',    label: 'Personal' },
  team:     { id: 'team-shared', label: 'Team Shared' },
  hr:       { id: 'hr',          label: 'HR' },
  external: { id: 'external',    label: 'External' },
};

// ── Color rules (source-coded) ────────────────────────────────────────────────
const COLOR_RULES = [
  { when: e => e._sourceId === 'external',    color: '#ef4444' },
  { when: e => e._sourceId === 'hr',          color: '#8b5cf6' },
  { when: e => e._sourceId === 'team-shared', color: '#64748b' },
  { when: e => e._sourceId === 'personal',    color: '#3b82f6' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date();
function at(days, h = 9, m = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d;
}
let _id = 1;
const uid = () => `ms-${_id++}`;

function ev(src, resource, title, category, days, h, hours = 1, extra = {}) {
  return {
    id:           uid(),
    title,
    category,
    resource,
    start:        at(days, h),
    end:          at(days, h + hours),
    _sourceId:    src.id,
    _sourceLabel: src.label,
    ...extra,
  };
}

// ── Events ────────────────────────────────────────────────────────────────────
const EVENTS = [
  // ── Personal calendar (focus time, 1-on-1s, personal blocks) ─────────────
  ev(SRC.personal, 'alice',  'Deep work — API design',    'Focus',    0,  9,  3),
  ev(SRC.personal, 'alice',  '1-on-1 with Ben',           'Meeting',  1,  13, 1),
  ev(SRC.personal, 'alice',  'Deep work — RFC draft',     'Focus',    3,  9,  2),
  ev(SRC.personal, 'alice',  '1-on-1 with Carla',         'Meeting',  4,  13, 1),

  ev(SRC.personal, 'ben',    'Deep work — auth service',  'Focus',    0,  10, 3),
  ev(SRC.personal, 'ben',    'Deep work — PR review prep','Focus',    2,  9,  2),
  ev(SRC.personal, 'ben',    'Study — distributed systems','Learning', 5,  9,  2),

  ev(SRC.personal, 'carla',  'Deep work — search feature','Focus',    0,  9,  4),
  ev(SRC.personal, 'carla',  'Deep work — search feature','Focus',    1,  9,  4),
  ev(SRC.personal, 'carla',  'UX review prep',            'Focus',    3,  14, 1),

  ev(SRC.personal, 'dan',    'Deep work — k8s migration', 'Focus',    0,  10, 3),
  ev(SRC.personal, 'dan',    'Deep work — k8s migration', 'Focus',    1,  10, 3),
  ev(SRC.personal, 'dan',    'Infra audit',               'Focus',    4,  9,  2),

  ev(SRC.personal, 'elena',  'User research prep',        'Focus',    0,  9,  2),
  ev(SRC.personal, 'elena',  'Roadmap drafting',          'Focus',    2,  9,  3),
  ev(SRC.personal, 'elena',  'Metrics review',            'Focus',    4,  10, 2),

  // ── Team Shared (ceremonies, standups, cross-team) ────────────────────────
  ev(SRC.team, 'alice', 'Daily standup', 'Meeting', 0, 8, 1, { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=10' }),
  ev(SRC.team, 'ben',   'Daily standup', 'Meeting', 0, 8, 1, { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=10' }),
  ev(SRC.team, 'carla', 'Daily standup', 'Meeting', 0, 8, 1, { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=10' }),
  ev(SRC.team, 'dan',   'Daily standup', 'Meeting', 0, 8, 1, { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=10' }),
  ev(SRC.team, 'elena', 'Daily standup', 'Meeting', 0, 8, 1, { rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=10' }),

  ev(SRC.team, 'alice', 'Sprint planning', 'Meeting', 0, 10, 2),
  ev(SRC.team, 'ben',   'Sprint planning', 'Meeting', 0, 10, 2),
  ev(SRC.team, 'carla', 'Sprint planning', 'Meeting', 0, 10, 2),
  ev(SRC.team, 'elena', 'Sprint planning', 'Meeting', 0, 10, 2),

  ev(SRC.team, 'alice', 'Sprint retrospective', 'Meeting', 5, 15, 1),
  ev(SRC.team, 'ben',   'Sprint retrospective', 'Meeting', 5, 15, 1),
  ev(SRC.team, 'carla', 'Sprint retrospective', 'Meeting', 5, 15, 1),

  ev(SRC.team, 'alice', 'Architecture review', 'Review', 3, 14, 2),
  ev(SRC.team, 'ben',   'Architecture review', 'Review', 3, 14, 2),
  ev(SRC.team, 'dan',   'Architecture review', 'Review', 3, 14, 2),

  // ── HR calendar (company-wide, on-call) ───────────────────────────────────
  {
    id: uid(), title: 'All-Hands',
    start: at(5, 11), end: at(5, 13),
    category: 'Company', _sourceId: SRC.hr.id, _sourceLabel: SRC.hr.label,
  },
  ev(SRC.hr, 'ben',  'On-Call — primary',   'On-Call', 0, 0, 24, { allDay: true }),
  ev(SRC.hr, 'dan',  'On-Call — secondary', 'On-Call', 0, 0, 24, { allDay: true }),
  ev(SRC.hr, 'carla','On-Call — primary',   'On-Call', 7, 0, 24, { allDay: true }),
  ev(SRC.hr, 'elena','PTO',                 'PTO',     8, 0, 24, { allDay: true }),
  ev(SRC.hr, 'elena','PTO',                 'PTO',     9, 0, 24, { allDay: true }),

  // ── External (customer calls, vendor syncs) ───────────────────────────────
  ev(SRC.external, 'alice', 'Acme Corp onboarding',    'Customer', 1,  14, 1),
  ev(SRC.external, 'elena', 'Acme Corp onboarding',    'Customer', 1,  14, 1),
  ev(SRC.external, 'alice', 'Vendor: DataPipe sync',   'Vendor',   2,  11, 1),
  ev(SRC.external, 'elena', 'GlobalBank contract call', 'Customer', 3,  10, 1),
  ev(SRC.external, 'alice', 'GlobalBank contract call', 'Customer', 3,  10, 1),
  ev(SRC.external, 'elena', 'QBR — TechStartup',        'Customer', 4,  15, 1),
  ev(SRC.external, 'dan',   'AWS support call',          'Vendor',   2,  16, 1),
  ev(SRC.external, 'alice', 'Infra partner summit',      'Vendor',   6,  9,  2),
  ev(SRC.external, 'dan',   'Infra partner summit',      'Vendor',   6,  9,  2),
];

// ── Component ─────────────────────────────────────────────────────────────────
export function MultiSource() {
  const [events, setEvents] = useState(EVENTS);

  const handleMove = useCallback(({ event, newStart, newEnd, newResource }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : {
      ...e,
      start:    newStart,
      end:      newEnd,
      ...(newResource !== undefined && { resource: newResource }),
    }));
  }, []);

  const handleResize = useCallback(({ event, newEnd }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : { ...e, end: newEnd }));
  }, []);

  const handleSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: `ms-${Date.now()}` }];
    });
  }, []);

  return (
    <div style={{ height: '100%' }}>
      {/*
        employees defines the timeline rows.
        _sourceId tagging on each event makes the Sources filter appear.
        colorRules shade events by source so each feed is visually distinct.
      */}
      <WorksCalendar
        devMode
        events={events}
        employees={TEAM}
        initialView="schedule"
        colorRules={COLOR_RULES}
        calendarId="multi-source-timeline"
        showAddButton
        onEventMove={handleMove}
        onEventResize={handleResize}
        onEventSave={handleSave}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}

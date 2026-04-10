/**
 * Example 6 — Team Calendar (Multi-Source Merging)
 *
 * Real organisations have multiple calendars: each team or person owns one,
 * and stakeholders need a merged view. WorksCalendar handles this natively
 * through the _sourceId / _sourceLabel event tags — no custom schema needed.
 *
 * Tagging events with _sourceId:
 *   • Makes a "Sources" pill group appear in the filter bar automatically
 *   • Lets users show/hide individual team calendars with a single click
 *   • Works the same way whether events come from an ICS feed, the API,
 *     or the static events prop
 *
 * This example simulates three team calendars merged into one view:
 *   Engineering — development tasks, reviews, deploys
 *   Product      — planning, roadmaps, stakeholder syncs
 *   Design       — UX sprints, critiques, handoffs
 *
 * Try clicking a source pill to show only that team's events,
 * or combine it with category filters for cross-cutting views.
 */
import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.js';

// ── Source definitions ────────────────────────────────────────────────────────
const SOURCES = {
  eng:     { id: 'engineering', label: 'Engineering', color: '#3b82f6' },
  product: { id: 'product',     label: 'Product',     color: '#10b981' },
  design:  { id: 'design',      label: 'Design',      color: '#f59e0b' },
};

// ── Color rules (source-coded) ────────────────────────────────────────────────
const COLOR_RULES = [
  { when: e => e._sourceId === 'engineering', color: '#3b82f6' },
  { when: e => e._sourceId === 'product',     color: '#10b981' },
  { when: e => e._sourceId === 'design',      color: '#f59e0b' },
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
const uid = () => `tc-${_id++}`;

function ev(src, { title, category = 'Task', days, h = 9, hours = 1, allDay = false, rrule }) {
  const start = at(days, h);
  const end   = allDay ? at(days + hours) : at(days, h + hours);
  return {
    id: uid(), title, category,
    start, end, allDay,
    _sourceId:    src.id,
    _sourceLabel: src.label,
    ...(rrule && { rrule }),
  };
}

// ── Events ────────────────────────────────────────────────────────────────────
const EVENTS = [
  // ── Engineering ───────────────────────────────────────────────────────────
  ev(SOURCES.eng, { title: 'API v2 kick-off',        category: 'Dev',     days: 0,  h: 10, hours: 2 }),
  ev(SOURCES.eng, { title: 'Auth service PR',         category: 'Review',  days: 0,  h: 14, hours: 1 }),
  ev(SOURCES.eng, { title: 'Search feature',          category: 'Dev',     days: 1,  h: 9,  hours: 4 }),
  ev(SOURCES.eng, { title: 'Staging deploy',          category: 'Deploy',  days: 1,  h: 17, hours: 1 }),
  ev(SOURCES.eng, { title: 'Search feature',          category: 'Dev',     days: 2,  h: 9,  hours: 4 }),
  ev(SOURCES.eng, { title: 'Architecture RFC',        category: 'Review',  days: 2,  h: 14, hours: 2 }),
  ev(SOURCES.eng, { title: 'Prod deploy v2.4',        category: 'Deploy',  days: 4,  h: 17, hours: 1 }),
  ev(SOURCES.eng, { title: 'On-call coverage',        category: 'On-Call', days: 0,  hours: 7, allDay: true }),
  ev(SOURCES.eng, { title: 'K8s migration',           category: 'Dev',     days: 3,  h: 10, hours: 3 }),
  ev(SOURCES.eng, { title: 'Hotfix — login bug',      category: 'Bug',     days: -1, h: 11, hours: 2 }),
  ev(SOURCES.eng, { title: 'CI/CD pipeline update',   category: 'Dev',     days: 5,  h: 9,  hours: 3 }),
  ev(SOURCES.eng, { title: 'Code freeze prep',        category: 'Deploy',  days: 6,  h: 14, hours: 2 }),

  // ── Product ───────────────────────────────────────────────────────────────
  ev(SOURCES.product, { title: 'Q3 roadmap planning',   category: 'Planning', days: 0,  h: 11, hours: 2 }),
  ev(SOURCES.product, { title: 'Competitor analysis',   category: 'Research', days: 1,  h: 10, hours: 3 }),
  ev(SOURCES.product, { title: 'Customer interviews',   category: 'Research', days: 2,  h: 9,  hours: 2 }),
  ev(SOURCES.product, { title: 'Feature spec review',   category: 'Review',   days: 2,  h: 14, hours: 1 }),
  ev(SOURCES.product, { title: 'Exec stakeholder sync', category: 'Meeting',  days: 3,  h: 15, hours: 1 }),
  ev(SOURCES.product, { title: 'Pricing strategy',      category: 'Planning', days: 4,  h: 10, hours: 2 }),
  ev(SOURCES.product, { title: 'Monthly metrics review',category: 'Review',   days: 5,  h: 14, hours: 1 }),
  ev(SOURCES.product, { title: 'Sprint backlog grooming',category: 'Meeting', days: 6,  h: 10, hours: 1, rrule: 'FREQ=WEEKLY;COUNT=4' }),
  ev(SOURCES.product, { title: 'Launch checklist',      category: 'Planning', days: 7,  h: 9,  hours: 2 }),

  // ── Design ────────────────────────────────────────────────────────────────
  ev(SOURCES.design, { title: 'UX sprint kick-off',    category: 'Sprint',   days: 0,  h: 9,  hours: 2 }),
  ev(SOURCES.design, { title: 'Wireframe reviews',     category: 'Review',   days: 1,  h: 11, hours: 2 }),
  ev(SOURCES.design, { title: 'User testing session',  category: 'Research', days: 2,  h: 10, hours: 2 }),
  ev(SOURCES.design, { title: 'Component library',     category: 'Sprint',   days: 3,  h: 9,  hours: 3 }),
  ev(SOURCES.design, { title: 'Design critique',       category: 'Review',   days: 3,  h: 15, hours: 1 }),
  ev(SOURCES.design, { title: 'Mobile mockups',        category: 'Sprint',   days: 4,  h: 9,  hours: 4 }),
  ev(SOURCES.design, { title: 'Dev handoff — auth',    category: 'Review',   days: 5,  h: 11, hours: 1 }),
  ev(SOURCES.design, { title: 'Accessibility audit',   category: 'Sprint',   days: 6,  h: 9,  hours: 3 }),
  ev(SOURCES.design, { title: 'Brand refresh review',  category: 'Review',   days: 7,  h: 14, hours: 2 }),

  // ── Cross-team ────────────────────────────────────────────────────────────
  // Shared meetings tag themselves as engineering but show for everyone
  {
    id: uid(), title: 'All-Hands', category: 'Meeting',
    start: at(5, 11), end: at(5, 12),
    _sourceId: 'engineering', _sourceLabel: 'Engineering',
  },
  {
    id: uid(), title: 'Sprint planning', category: 'Meeting',
    start: at(0, 9), end: at(0, 10),
    _sourceId: 'product', _sourceLabel: 'Product',
    rrule: 'FREQ=WEEKLY;COUNT=4',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function TeamCalendar() {
  const [events, setEvents] = useState(EVENTS);

  const handleSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: `tc-${Date.now()}` }];
    });
  }, []);

  const handleMove = useCallback(({ event, newStart, newEnd }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : { ...e, start: newStart, end: newEnd }));
  }, []);

  const handleResize = useCallback(({ event, newEnd }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : { ...e, end: newEnd }));
  }, []);

  return (
    <div style={{ height: '100%' }}>
      {/*
        No filterSchema prop needed — _sourceId events are handled by
        DEFAULT_FILTER_SCHEMA's built-in sources field.  Click a source
        pill to show/hide that team's events.
      */}
      <WorksCalendar
        events={events}
        colorRules={COLOR_RULES}
        calendarId="team-calendar"
        showAddButton
        onEventSave={handleSave}
        onEventMove={handleMove}
        onEventResize={handleResize}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}

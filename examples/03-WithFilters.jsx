/**
 * Example 3 — Calendar with Filters
 *
 * WorksCalendar includes a built-in filter bar — no wiring needed.
 * Just give events distinct `category` and `resource` values and the
 * filter pills appear automatically.
 *
 * This example shows:
 *   • Multiple categories discovered from event data
 *   • Multiple team members as `resource` values
 *   • A rich enough dataset that filtering is meaningful
 *   • colorRules — conditionally override event color based on field values
 *
 * The filter bar is always visible; users can:
 *   • Click category pills to show/hide event groups
 *   • Click resource pills to show only one person's events
 *   • Type in the search box for instant text search
 *   • Use the date-range picker to scope to a window
 */
import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date();

function at(offsetDays, hour = 9, min = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}

let _id = 1;
const uid = () => `fev-${_id++}`;

// ── Team members ──────────────────────────────────────────────────────────────
// `resource` is any string — people, rooms, projects, whatever makes sense.
const TEAM = {
  alice:   'Alice Park',
  ben:     'Ben Torres',
  carla:   'Carla Singh',
  dan:     'Dan Okafor',
  elena:   'Elena Wu',
};

// ── Events ────────────────────────────────────────────────────────────────────
const EVENTS = [
  // Meetings (all-team)
  { id: uid(), title: 'Daily Standup',       category: 'Meeting',  resource: TEAM.alice,  start: at(0, 9),   end: at(0,  9, 30) },
  { id: uid(), title: 'Daily Standup',       category: 'Meeting',  resource: TEAM.ben,    start: at(0, 9),   end: at(0,  9, 30) },
  { id: uid(), title: 'Daily Standup',       category: 'Meeting',  resource: TEAM.carla,  start: at(0, 9),   end: at(0,  9, 30) },
  { id: uid(), title: 'Daily Standup',       category: 'Meeting',  resource: TEAM.alice,  start: at(1, 9),   end: at(1,  9, 30) },
  { id: uid(), title: 'Daily Standup',       category: 'Meeting',  resource: TEAM.ben,    start: at(1, 9),   end: at(1,  9, 30) },
  { id: uid(), title: 'Sprint Planning',     category: 'Meeting',  resource: TEAM.alice,  start: at(2, 10),  end: at(2, 12) },
  { id: uid(), title: 'Sprint Planning',     category: 'Meeting',  resource: TEAM.dan,    start: at(2, 10),  end: at(2, 12) },
  { id: uid(), title: 'All-Hands',           category: 'Meeting',  resource: null,        start: at(5, 11),  end: at(5, 12) },

  // Code reviews
  { id: uid(), title: 'PR Review — Auth',    category: 'Review',   resource: TEAM.ben,    start: at(0, 14),  end: at(0, 15) },
  { id: uid(), title: 'PR Review — API',     category: 'Review',   resource: TEAM.carla,  start: at(1, 15),  end: at(1, 16) },
  { id: uid(), title: 'Architecture RFC',    category: 'Review',   resource: TEAM.alice,  start: at(7, 14),  end: at(7, 16) },
  { id: uid(), title: 'Architecture RFC',    category: 'Review',   resource: TEAM.dan,    start: at(7, 14),  end: at(7, 16) },

  // Deploys
  { id: uid(), title: 'Staging Deploy',      category: 'Deploy',   resource: TEAM.dan,    start: at(1, 17),  end: at(1, 18) },
  { id: uid(), title: 'Prod Deploy v2.4',    category: 'Deploy',   resource: TEAM.dan,    start: at(4, 17),  end: at(4, 18) },
  { id: uid(), title: 'Hotfix Release',      category: 'Deploy',   resource: TEAM.elena,  start: at(3, 10),  end: at(3, 11) },

  // Incidents
  { id: uid(), title: 'P1 — API timeout',    category: 'Incident', resource: TEAM.ben,    start: at(-1, 2),  end: at(-1, 5), status: 'confirmed', color: '#ef4444' },
  { id: uid(), title: 'P3 — Memory spike',   category: 'Incident', resource: TEAM.elena,  start: at(3, 14),  end: at(3, 15), color: '#f97316' },

  // On-call
  { id: uid(), title: 'On Call',             category: 'On-Call',  resource: TEAM.carla,  start: at(0),      end: at(7), allDay: true, color: '#8b5cf6' },
  { id: uid(), title: 'On Call',             category: 'On-Call',  resource: TEAM.elena,  start: at(7),      end: at(14), allDay: true, color: '#06b6d4' },

  // Time off
  { id: uid(), title: 'PTO — Ben',           category: 'PTO',      resource: TEAM.ben,    start: at(8),      end: at(12), allDay: true, color: '#10b981' },
  { id: uid(), title: 'PTO — Elena',         category: 'PTO',      resource: TEAM.elena,  start: at(5),      end: at(7), allDay: true, color: '#10b981' },

  // Training
  { id: uid(), title: 'AWS Security',        category: 'Training', resource: TEAM.alice,  start: at(6, 10),  end: at(6, 14) },
  { id: uid(), title: 'K8s Workshop',        category: 'Training', resource: TEAM.carla,  start: at(6, 9),   end: at(6, 12) },
];

// ── Color rules ───────────────────────────────────────────────────────────────
// Conditionally override event color based on field values.
// Rules are evaluated in order; first match wins.
const COLOR_RULES = [
  { field: 'category', value: 'Incident', color: '#ef4444' },
  { field: 'category', value: 'Deploy',   color: '#8b5cf6' },
  { field: 'category', value: 'On-Call',  color: '#7c3aed' },
  { field: 'category', value: 'PTO',      color: '#10b981' },
  { field: 'category', value: 'Training', color: '#f59e0b' },
  { field: 'category', value: 'Review',   color: '#0ea5e9' },
  { field: 'category', value: 'Meeting',  color: '#64748b' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function WithFilters() {
  const [events, setEvents] = useState(EVENTS);

  const handleSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: `fev-${Date.now()}` }];
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
        The filter bar appears automatically at the top of the calendar.
        Categories and resources are discovered from your event data.
        No additional props needed.
      */}
      <WorksCalendar
        devMode
        events={events}
        colorRules={COLOR_RULES}
        showAddButton
        onEventSave={handleSave}
        onEventMove={handleMove}
        onEventResize={handleResize}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}

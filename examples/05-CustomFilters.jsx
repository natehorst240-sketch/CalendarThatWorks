/**
 * Example 5 — Custom Filter Schema (Project Tracker)
 *
 * WorksCalendar's filter system is schema-driven, so you can add any filter
 * dimension without touching the calendar internals.
 *
 * This example extends the default schema with three extra fields:
 *
 *   priorityField()  — select dropdown: low / medium / high / critical
 *   ownerField()     — multi-select: auto-derived from meta.owner values
 *   tagsField()      — multi-select: auto-derived from meta.tags (any-match)
 *
 * The calendar:
 *   • Renders controls for all fields in the filter bar automatically
 *   • Shows each active filter as a removable pill (click × to clear one value)
 *   • Colours events by priority via colorRules
 *   • Persists saved filter views across page loads via calendarId
 */
import { useState, useCallback } from 'react';
import {
  WorksCalendar,
  DEFAULT_FILTER_SCHEMA,
  priorityField,
  ownerField,
  tagsField,
} from '../src/index.js';

// ── Filter schema ─────────────────────────────────────────────────────────────
// Spread DEFAULT_FILTER_SCHEMA first to keep the built-in categories /
// resources / sources / dateRange / search fields, then append your own.
const FILTER_SCHEMA = [
  ...DEFAULT_FILTER_SCHEMA,
  priorityField(),            // reads item.meta.priority
  ownerField(),               // reads item.meta.owner; options auto-derived from events
  tagsField(),                // reads item.meta.tags (string[]); matches any selected tag
];

// ── Color rules ───────────────────────────────────────────────────────────────
// colorRules are evaluated in order — first match wins.
const COLOR_RULES = [
  { when: e => e.meta?.priority === 'critical', color: '#7c3aed' },
  { when: e => e.meta?.priority === 'high',     color: '#ef4444' },
  { when: e => e.meta?.priority === 'medium',   color: '#f59e0b' },
  { when: e => e.meta?.priority === 'low',      color: '#10b981' },
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
const uid = () => `pt-${_id++}`;

function task({ title, owner, category = 'Feature', priority, tags = [], days, h = 9, hours = 2 }) {
  return {
    id:       uid(),
    title,
    category,
    resource: owner,
    start:    at(days, h),
    end:      at(days, h + hours),
    meta:     { owner, priority, tags },
  };
}

// ── Events ────────────────────────────────────────────────────────────────────
const EVENTS = [
  // Critical
  task({ title: 'Auth regression fix',     owner: 'Ben',   category: 'Bug',      priority: 'critical', tags: ['backend', 'auth'],        days: 0,  h: 9  }),
  task({ title: 'Payment gateway outage',  owner: 'Dan',   category: 'Incident', priority: 'critical', tags: ['backend', 'payments'],    days: 0,  h: 10 }),

  // High
  task({ title: 'API rate limiting',       owner: 'Ben',   category: 'Feature',  priority: 'high',     tags: ['backend', 'api'],         days: 1,  h: 9  }),
  task({ title: 'Mobile perf audit',       owner: 'Carla', category: 'Task',     priority: 'high',     tags: ['mobile', 'performance'],  days: 1,  h: 10 }),
  task({ title: 'User permissions v2',     owner: 'Alice', category: 'Feature',  priority: 'high',     tags: ['backend', 'auth'],        days: 2,  h: 9  }),
  task({ title: 'Search relevance',        owner: 'Carla', category: 'Feature',  priority: 'high',     tags: ['frontend', 'search'],     days: 2,  h: 14 }),
  task({ title: 'CSV export pipeline',     owner: 'Dan',   category: 'Feature',  priority: 'high',     tags: ['backend', 'data'],        days: 3,  h: 9  }),

  // Medium
  task({ title: 'Dashboard redesign',      owner: 'Carla', category: 'Feature',  priority: 'medium',   tags: ['frontend', 'design'],     days: 4,  h: 9  }),
  task({ title: 'Analytics pipeline',      owner: 'Dan',   category: 'Feature',  priority: 'medium',   tags: ['backend', 'analytics'],   days: 4,  h: 11 }),
  task({ title: 'Email templates',         owner: 'Alice', category: 'Task',     priority: 'medium',   tags: ['frontend', 'email'],      days: 5,  h: 9  }),
  task({ title: 'CI/CD improvements',      owner: 'Dan',   category: 'Task',     priority: 'medium',   tags: ['infra', 'devops'],        days: 5,  h: 13 }),
  task({ title: 'Unit test coverage',      owner: 'Ben',   category: 'Task',     priority: 'medium',   tags: ['backend', 'testing'],     days: 6,  h: 9  }),
  task({ title: 'A/B test framework',      owner: 'Alice', category: 'Feature',  priority: 'medium',   tags: ['backend', 'analytics'],   days: 6,  h: 13 }),
  task({ title: 'Notification service',    owner: 'Ben',   category: 'Feature',  priority: 'medium',   tags: ['backend', 'email'],       days: 7,  h: 9  }),
  task({ title: 'Settings page polish',    owner: 'Carla', category: 'Feature',  priority: 'medium',   tags: ['frontend', 'ux'],         days: 7,  h: 14 }),

  // Low
  task({ title: 'Auth API docs',           owner: 'Ben',   category: 'Task',     priority: 'low',      tags: ['docs', 'api'],            days: 8,  h: 9  }),
  task({ title: 'Stale dependency audit',  owner: 'Dan',   category: 'Task',     priority: 'low',      tags: ['infra', 'devops'],        days: 8,  h: 11 }),
  task({ title: 'Onboarding copy review',  owner: 'Carla', category: 'Task',     priority: 'low',      tags: ['frontend', 'design'],     days: 9,  h: 9  }),
  task({ title: 'Error message review',    owner: 'Alice', category: 'Task',     priority: 'low',      tags: ['frontend', 'ux'],         days: 9,  h: 11 }),
  task({ title: 'Changelog draft',         owner: 'Alice', category: 'Task',     priority: 'low',      tags: ['docs'],                   days: 10, h: 14 }),

  // Recurring team events
  {
    id: uid(), title: 'Daily Standup', category: 'Meeting',
    start: at(0, 8, 30), end: at(0, 9),
    rrule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=15',
    meta: { priority: 'medium', tags: ['team'] },
  },
  {
    id: uid(), title: 'Sprint Review', category: 'Meeting',
    start: at(5, 15), end: at(5, 16),
    meta: { priority: 'medium', tags: ['team'] },
  },
  {
    id: uid(), title: 'Backlog Grooming', category: 'Meeting',
    start: at(3, 14), end: at(3, 15, 30),
    meta: { priority: 'low', tags: ['team'] },
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function CustomFilters() {
  const [events, setEvents] = useState(EVENTS);

  const handleSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: `pt-${Date.now()}` }];
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
      <WorksCalendar
        events={events}
        filterSchema={FILTER_SCHEMA}
        colorRules={COLOR_RULES}
        calendarId="project-tracker"
        showAddButton
        onEventSave={handleSave}
        onEventMove={handleMove}
        onEventResize={handleResize}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}

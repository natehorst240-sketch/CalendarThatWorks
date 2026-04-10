/**
 * Example 1 — Getting Started
 *
 * The simplest possible WorksCalendar setup.
 * Copy the events array and the JSX block into your own app.
 *
 * In a real project:
 *   npm install works-calendar
 *   import { WorksCalendar } from 'works-calendar';
 *   import 'works-calendar/styles';
 */
import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.js';

// ── Build dates relative to today ────────────────────────────────────────────
const now = new Date();

function at(offsetDays, hour = 9, min = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}

// ── Events ────────────────────────────────────────────────────────────────────
// Only `title` and `start` are required.
// `end` defaults to one hour after `start` when omitted.
const INITIAL_EVENTS = [
  { id: 'gs-1', title: 'Team Standup',    start: at(0,  9),  end: at(0,  9, 30) },
  { id: 'gs-2', title: 'Product Review',  start: at(0, 14),  end: at(0, 15)     },
  { id: 'gs-3', title: 'Design Sync',     start: at(1, 11),  end: at(1, 12)     },
  { id: 'gs-4', title: 'Sprint Planning', start: at(2, 10),  end: at(2, 12)     },
  { id: 'gs-5', title: 'Code Review',     start: at(3, 15),  end: at(3, 16)     },
  { id: 'gs-6', title: 'All-Hands',       start: at(5, 11),  end: at(5, 12)     },
  { id: 'gs-7', title: 'Deployment',      start: at(6, 16),  end: at(6, 17)     },
  { id: 'gs-8', title: 'Code Freeze',     start: at(9),      allDay: true       },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function GettingStarted() {
  const [events, setEvents] = useState(INITIAL_EVENTS);

  const handleSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: `gs-${Date.now()}` }];
    });
  }, []);

  const handleMove = useCallback(({ event, newStart, newEnd }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : { ...e, start: newStart, end: newEnd }));
  }, []);

  const handleResize = useCallback(({ event, newEnd }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : { ...e, end: newEnd }));
  }, []);

  return (
    // WorksCalendar fills its container — give it a height.
    <div style={{ height: '100%' }}>
      <WorksCalendar
        events={events}
        showAddButton
        onEventSave={handleSave}
        onEventMove={handleMove}
        onEventResize={handleResize}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  );
}

/**
 * Example 2 — Basic Calendar
 *
 * A realistic setup: categorized events, a selectable theme, and the three
 * most common event callbacks (save, move/resize, delete).
 *
 * Key props demonstrated:
 *   events        — array of event objects
 *   theme         — one of 'light' | 'dark' | 'aviation' | 'soft' |
 *                   'minimal' | 'corporate' | 'forest' | 'ocean'
 *   showAddButton — show the + button in the toolbar
 *   onEventSave   — called when a user edits or creates an event
 *   onEventMove   — called when an event is dragged to a new time
 *   onEventResize — called when an event's end time is dragged
 *   onEventDelete — called when a user deletes an event
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
const uid = () => `evt-${_id++}`;

// ── Event data ────────────────────────────────────────────────────────────────
// `category` groups events in the filter bar and auto-assigns a colour if
// `color` is omitted.  Use any string — categories are discovered dynamically.
const INITIAL_EVENTS = [
  // Meetings
  { id: uid(), title: 'Daily Standup',      category: 'Meeting',  start: at(0, 9),   end: at(0,  9, 30), color: '#64748b' },
  { id: uid(), title: 'Daily Standup',      category: 'Meeting',  start: at(1, 9),   end: at(1,  9, 30), color: '#64748b' },
  { id: uid(), title: 'Daily Standup',      category: 'Meeting',  start: at(2, 9),   end: at(2,  9, 30), color: '#64748b' },
  { id: uid(), title: 'Daily Standup',      category: 'Meeting',  start: at(3, 9),   end: at(3,  9, 30), color: '#64748b' },
  { id: uid(), title: 'Sprint Planning',    category: 'Meeting',  start: at(2, 10),  end: at(2, 12),     color: '#64748b' },
  { id: uid(), title: 'Sprint Retro',       category: 'Meeting',  start: at(-2, 14), end: at(-2, 16),    color: '#64748b' },
  { id: uid(), title: 'All-Hands',          category: 'Meeting',  start: at(5, 11),  end: at(5, 12),     color: '#64748b' },

  // Deployments
  { id: uid(), title: 'Staging Deploy',     category: 'Deploy',   start: at(1, 15),  end: at(1, 16),     color: '#8b5cf6' },
  { id: uid(), title: 'Prod Deploy v2.5',   category: 'Deploy',   start: at(4, 16),  end: at(4, 17),     color: '#8b5cf6' },

  // Incidents
  { id: uid(), title: 'P2 Alert — DB',      category: 'Incident', start: at(-1, 2),  end: at(-1, 4),     color: '#ef4444', status: 'confirmed' },
  { id: uid(), title: 'P3 Spike — CPU',     category: 'Incident', start: at(3, 14),  end: at(3, 15),     color: '#f97316' },

  // Reviews
  { id: uid(), title: 'Quarterly Review',   category: 'Review',   start: at(6, 10),  end: at(6, 12),     color: '#0ea5e9' },
  { id: uid(), title: 'Architecture RFC',   category: 'Review',   start: at(7, 14),  end: at(7, 16),     color: '#0ea5e9' },

  // Time off
  { id: uid(), title: 'Public Holiday',     category: 'PTO',      start: at(9),                          color: '#10b981', allDay: true },
];

// ── Utilities ─────────────────────────────────────────────────────────────────
function upsert(events, updated) {
  const idx = events.findIndex(e => e.id === updated.id);
  if (idx >= 0) {
    const next = [...events];
    next[idx] = updated;
    return next;
  }
  return [...events, { ...updated, id: updated.id ?? uid() }];
}

// ── Component ─────────────────────────────────────────────────────────────────
const THEMES = ['light', 'dark', 'aviation', 'soft', 'minimal', 'corporate', 'forest', 'ocean'];

export function BasicCalendar() {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [theme,  setTheme]  = useState('light');

  const handleSave = useCallback((ev) => {
    setEvents(prev => upsert(prev, ev));
  }, []);

  const handleMove = useCallback(({ event, newStart, newEnd }) => {
    setEvents(prev => upsert(prev, { ...event, start: newStart, end: newEnd }));
  }, []);

  const handleResize = useCallback(({ event, newEnd }) => {
    setEvents(prev => upsert(prev, { ...event, end: newEnd }));
  }, []);

  const handleDelete = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Theme picker — not part of the component, just for this demo */}
      <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Theme</span>
        {THEMES.map(t => (
          <button
            key={t}
            onClick={() => setTheme(t)}
            style={{
              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
              fontWeight: theme === t ? 700 : 400,
              background: theme === t ? '#1e293b' : '#e2e8f0',
              color:      theme === t ? '#fff'    : '#64748b',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <WorksCalendar
        devMode
          events={events}
          theme={theme}
          showAddButton

          onEventSave={handleSave}
          onEventMove={handleMove}
          onEventResize={handleResize}
          onEventDelete={handleDelete}
        />
      </div>
    </div>
  );
}

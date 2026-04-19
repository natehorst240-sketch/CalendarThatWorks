/**
 * Example 4 — Timeline / Scheduler
 *
 * The scheduler (Timeline) view shows events as horizontal bars on a
 * resource-per-row grid — great for visualising who is doing what, when.
 *
 * Key props for this view:
 *   employees    — array of { id, name, role?, color? } defining the rows
 *   initialView  — pass 'schedule' to open in the timeline view
 *   onEventMove  — called with `{ event, newStart, newEnd, newResource }`
 *                  when a bar is dragged to a different row or time
 *
 * Each event's `resource` field must match an employee `id` to land it
 * on the correct row.  Events with no `resource` appear in an "Unassigned"
 * row.
 */
import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.ts';

// ── Team ──────────────────────────────────────────────────────────────────────
const INITIAL_TEAM = [
  { id: 'alice',  name: 'Alice Park',   role: 'Engineering Lead',  color: '#3b82f6' },
  { id: 'ben',    name: 'Ben Torres',   role: 'Senior Engineer',   color: '#10b981' },
  { id: 'carla',  name: 'Carla Singh',  role: 'Software Engineer', color: '#8b5cf6' },
  { id: 'dan',    name: 'Dan Okafor',   role: 'DevOps / SRE',      color: '#f59e0b' },
  { id: 'elena',  name: 'Elena Wu',     role: 'Site Reliability',  color: '#ef4444' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date();

function at(offsetDays, hour = 9, min = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}

let _id = 1;
const uid = () => `tev-${_id++}`;

// ── Events ────────────────────────────────────────────────────────────────────
// `resource` must match an employee id.
const INITIAL_EVENTS = [
  // Alice — Engineering Lead
  { id: uid(), title: 'RFC Review',         resource: 'alice',  category: 'Review',   start: at(0,  9),  end: at(0, 11),  color: '#0ea5e9' },
  { id: uid(), title: 'Sprint Planning',    resource: 'alice',  category: 'Meeting',  start: at(2, 10),  end: at(2, 12),  color: '#64748b' },
  { id: uid(), title: 'Architecture Sync',  resource: 'alice',  category: 'Meeting',  start: at(5, 14),  end: at(5, 15),  color: '#64748b' },
  { id: uid(), title: '1-on-1s',            resource: 'alice',  category: 'Meeting',  start: at(1, 13),  end: at(1, 15),  color: '#64748b' },

  // Ben — Senior Engineer
  { id: uid(), title: 'Auth Service',       resource: 'ben',    category: 'Dev',      start: at(0, 10),  end: at(0, 17),  color: '#10b981' },
  { id: uid(), title: 'Auth Service',       resource: 'ben',    category: 'Dev',      start: at(1,  9),  end: at(1, 17),  color: '#10b981' },
  { id: uid(), title: 'PR Reviews',         resource: 'ben',    category: 'Review',   start: at(2, 14),  end: at(2, 17),  color: '#0ea5e9' },
  { id: uid(), title: 'On Call',            resource: 'ben',    category: 'On-Call',  start: at(0),      end: at(7),      color: '#7c3aed', allDay: true },

  // Carla — Software Engineer
  { id: uid(), title: 'Search Feature',     resource: 'carla',  category: 'Dev',      start: at(0,  9),  end: at(0, 16),  color: '#8b5cf6' },
  { id: uid(), title: 'Search Feature',     resource: 'carla',  category: 'Dev',      start: at(1,  9),  end: at(1, 16),  color: '#8b5cf6' },
  { id: uid(), title: 'Search Feature',     resource: 'carla',  category: 'Dev',      start: at(2,  9),  end: at(2, 14),  color: '#8b5cf6' },
  { id: uid(), title: 'Code Freeze Prep',   resource: 'carla',  category: 'Deploy',   start: at(3, 15),  end: at(3, 17),  color: '#8b5cf6' },

  // Dan — DevOps / SRE
  { id: uid(), title: 'Infra Review',       resource: 'dan',    category: 'Review',   start: at(0, 10),  end: at(0, 12),  color: '#f59e0b' },
  { id: uid(), title: 'Staging Deploy',     resource: 'dan',    category: 'Deploy',   start: at(1, 16),  end: at(1, 17),  color: '#f59e0b' },
  { id: uid(), title: 'Prod Deploy v2.5',   resource: 'dan',    category: 'Deploy',   start: at(4, 17),  end: at(4, 18),  color: '#f59e0b' },
  { id: uid(), title: 'K8s Migration',      resource: 'dan',    category: 'Dev',      start: at(2,  9),  end: at(5, 17),  color: '#f59e0b' },

  // Elena — Site Reliability
  { id: uid(), title: 'Incident Response',  resource: 'elena',  category: 'Incident', start: at(-1, 2),  end: at(-1, 6),  color: '#ef4444', status: 'confirmed' },
  { id: uid(), title: 'Runbook Update',     resource: 'elena',  category: 'Dev',      start: at(0, 10),  end: at(0, 12),  color: '#ef4444' },
  { id: uid(), title: 'On Call',            resource: 'elena',  category: 'On-Call',  start: at(7),      end: at(14),     color: '#7c3aed', allDay: true },
  { id: uid(), title: 'SLO Review',         resource: 'elena',  category: 'Review',   start: at(3, 14),  end: at(3, 16),  color: '#0ea5e9' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function TimelineScheduler() {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [team,   setTeam]   = useState(INITIAL_TEAM);

  // onEventMove receives the updated event with newStart, newEnd, and
  // (in schedule view) newResource when the bar is dragged to a different row.
  const handleMove = useCallback(({ event, newStart, newEnd, newResource }) => {
    setEvents(prev => prev.map(e => e.id !== event.id ? e : {
      ...e,
      start: newStart,
      end:   newEnd,
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
      return [...prev, { ...ev, id: `tev-${Date.now()}` }];
    });
  }, []);

  const handleEmployeeAdd = useCallback((emp) => {
    setTeam(prev => [...prev, emp]);
  }, []);

  const handleEmployeeDelete = useCallback((id) => {
    setTeam(prev => prev.filter(e => e.id !== id));
  }, []);

  return (
    <div style={{ height: '100%' }}>
      <WorksCalendar
        devMode
        events={events}
        employees={team}
        initialView="schedule"
        showAddButton
        onEventMove={handleMove}
        onEventResize={handleResize}
        onEventSave={handleSave}
        onEventDelete={(id) => setEvents(prev => prev.filter(e => e.id !== id))}
        onEmployeeAdd={handleEmployeeAdd}
        onEmployeeDelete={handleEmployeeDelete}
      />
    </div>
  );
}

/**
 * Example 10 — Drag & Drop Between Groups
 *
 * Demonstrates the `onEventGroupChange` callback in both AgendaView (leaf
 * groups as drop targets) and TimelineView (resource rows as drop targets).
 *
 * Key prop demonstrated:
 *   onEventGroupChange(event, patch) — fired when an event is dropped onto
 *     a different group.  `patch` is a partial event: e.g. { resource: 'Bob' }
 *     for a Timeline row drop, or { category: 'Exercise' } for an Agenda
 *     group drop.  Multi-field patches are returned for nested groupBy.
 *
 * Drops flow through the CalendarEngine as a `group-change` op, so custom
 * validators (role-match, shift-count limits, etc.) can accept / soft-warn /
 * hard-reject reassignments via the standard validation protocol.
 */
import { useState, useCallback } from 'react';
import { WorksCalendar } from '../src/index.ts';

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

function upsert(list, ev) {
  const idx = list.findIndex(e => e.id === ev.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = ev;
    return next;
  }
  return [...list, ev];
}

// ── Event data ────────────────────────────────────────────────────────────────
const INITIAL_EVENTS = [
  { id: uid(), title: 'Alice — ICU',    category: 'Shift',    start: at(0,  7), end: at(0, 15), resource: 'alice', role: 'Nurse',  shift: 'Day'   },
  { id: uid(), title: 'Alice — Clinic', category: 'Shift',    start: at(2,  9), end: at(2, 17), resource: 'alice', role: 'Nurse',  shift: 'Day'   },
  { id: uid(), title: 'Bob — Night',    category: 'Shift',    start: at(0, 19), end: at(1,  3), resource: 'bob',   role: 'Nurse',  shift: 'Night' },
  { id: uid(), title: 'Carol — Rounds', category: 'Shift',    start: at(0,  8), end: at(0, 17), resource: 'carol', role: 'Doctor', shift: 'Day'   },
  { id: uid(), title: 'Carol — OR',     category: 'Shift',    start: at(3,  7), end: at(3, 15), resource: 'carol', role: 'Doctor', shift: 'Day'   },
  { id: uid(), title: 'Dan — Night',    category: 'Shift',    start: at(1, 19), end: at(2,  3), resource: 'dan',   role: 'Doctor', shift: 'Night' },

  { id: uid(), title: 'Morning Workout', category: 'Exercise', start: at(1,  6), end: at(1,  7), resource: 'alice', role: 'Nurse',  shift: 'Day'   },
  { id: uid(), title: 'Team Meeting',    category: 'Meeting',  start: at(2, 10), end: at(2, 11), resource: 'carol', role: 'Doctor', shift: 'Day'   },
];

const EMPLOYEES = [
  { id: 'alice', name: 'Alice Chen',  role: 'Nurse'  },
  { id: 'bob',   name: 'Bob Smith',   role: 'Nurse'  },
  { id: 'carol', name: 'Carol Jones', role: 'Doctor' },
  { id: 'dan',   name: 'Dan Park',    role: 'Doctor' },
];

// ── Component ─────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'agenda-cat',    label: 'Agenda · category',   view: 'agenda',   groupBy: 'category' },
  { id: 'agenda-role',   label: 'Agenda · role→shift', view: 'agenda',   groupBy: ['role', 'shift'] },
  { id: 'timeline-flat', label: 'Timeline · flat',     view: 'schedule', groupBy: null },
  { id: 'timeline-role', label: 'Timeline · by role',  view: 'schedule', groupBy: 'role' },
];

export function DragAndDropExample() {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [log,    setLog]    = useState([]);
  const [modeId, setModeId] = useState('agenda-cat');
  const mode = MODES.find(m => m.id === modeId) ?? MODES[0];

  const handleEventGroupChange = useCallback((ev, patch) => {
    const id      = ev.id ?? ev._eventId;
    const before  = events.find(e => e.id === id);
    if (!before) return;
    const updated = { ...before, ...patch };
    setEvents(prev => upsert(prev, updated));

    const summary = Object.entries(patch)
      .map(([k, v]) => `${k}=${v === null ? '(none)' : JSON.stringify(v)}`)
      .join(', ');
    setLog(prev => [
      { t: new Date().toLocaleTimeString(), title: before.title, patch: summary },
      ...prev,
    ].slice(0, 8));
  }, [events]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      <div style={{
        padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Mode
          </span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setModeId(m.id)}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: mode.id === m.id ? 700 : 400,
                  background: mode.id === m.id ? '#1e293b' : '#e2e8f0',
                  color:      mode.id === m.id ? '#fff'    : '#64748b',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          flex: '1 1 300px', minWidth: 0,
          fontSize: 11, color: '#475569', lineHeight: 1.5,
          padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #e2e8f0',
        }}>
          <strong style={{ color: '#0f172a' }}>Drop log</strong>
          {log.length === 0
            ? <div style={{ color: '#94a3b8', marginTop: 2 }}>Drag an event onto a different group / row to see the emitted patch.</div>
            : (
              <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', fontFamily: 'monospace', fontSize: 10 }}>
                {log.map((row, i) => (
                  <li key={i} style={{ color: '#334155' }}>
                    <span style={{ color: '#94a3b8' }}>{row.t}</span>
                    {' · '}
                    <strong>{row.title}</strong>
                    {' → '}
                    <span style={{ color: '#0ea5e9' }}>{row.patch}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <WorksCalendar
          devMode
          key={mode.id}
          events={events}
          employees={EMPLOYEES}
          initialView={mode.view}
          groupBy={mode.groupBy ?? undefined}
          showAddButton
          onEventGroupChange={handleEventGroupChange}
        />
      </div>
    </div>
  );
}

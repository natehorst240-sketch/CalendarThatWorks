import { StrictMode, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorksCalendar } from '../src/index.js';

const CALENDAR_ID = 'regression-bug-fixtures';

function at(base, dayOffset, hour, minute = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

if (typeof window !== 'undefined') {
  const configKey = `wc-config-${CALENDAR_ID}`;
  try {
    const existing = JSON.parse(window.localStorage.getItem(configKey) ?? '{}');
    window.localStorage.setItem(configKey, JSON.stringify({ ...existing, setupCompleted: true }));
  } catch {
    window.localStorage.setItem(configKey, JSON.stringify({ setupCompleted: true }));
  }
}

function App() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const employees = useMemo(() => ([
    { id: 'emp-alpha', name: 'Alpha Engineer', role: 'Engineer', color: '#2563eb' },
    { id: 'emp-beta', name: 'Beta Engineer', role: 'Engineer', color: '#dc2626' },
  ]), []);

  const initialEvents = useMemo(() => ([
    {
      id: 'drag-p1',
      title: 'Drag Crash Pill',
      start: at(today, 0, 9, 0).toISOString(),
      end: at(today, 0, 10, 0).toISOString(),
      category: 'Meeting',
      resource: 'emp-alpha',
      color: '#2563eb',
    },
    {
      id: 'mobile-p1',
      title: 'Mobile Pill Text',
      start: at(today, 1, 11, 0).toISOString(),
      end: at(today, 1, 12, 0).toISOString(),
      category: 'Meeting',
      resource: 'emp-beta',
      color: '#16a34a',
    },
    {
      id: 'hover-range-1',
      title: 'Cross-Day Hover Range',
      start: at(today, 2, 22, 0).toISOString(),
      end: at(today, 3, 6, 0).toISOString(),
      category: 'Incident',
      resource: 'emp-beta',
      color: '#f59e0b',
    },
    {
      id: 'editable-1',
      title: 'Edit Pen Fixture',
      start: at(today, 4, 14, 0).toISOString(),
      end: at(today, 4, 15, 0).toISOString(),
      category: 'Deploy',
      resource: 'emp-alpha',
      color: '#8b5cf6',
    },
    {
      id: 'span-overlap-1',
      title: 'Span Overflow Fixture',
      start: at(today, 5, 8, 0).toISOString(),
      end: at(today, 8, 18, 0).toISOString(),
      category: 'Project',
      resource: 'emp-alpha',
      color: '#0ea5e9',
    },
    {
      id: 'recurring-pen-1',
      title: 'Repeating Pencil Test',
      start: at(today, 0, 10, 0).toISOString(),
      end: at(today, 0, 11, 0).toISOString(),
      category: 'Meeting',
      resource: 'emp-alpha',
      color: '#10b981',
      rrule: 'FREQ=WEEKLY;BYDAY=' + ['SU','MO','TU','WE','TH','FR','SA'][today.getDay()],
    },
  ]), [today]);

  const [events, setEvents] = useState(initialEvents);
  const [notes, setNotes] = useState({});

  const handleEventSave = useCallback((ev) => {
    setEvents((prev) => {
      const idx = prev.findIndex((item) => item.id === ev.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...ev };
        return next;
      }
      return [...prev, { ...ev, id: `reg-${Date.now()}` }];
    });
  }, []);

  const handleEventDelete = useCallback((id) => {
    setEvents((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleNoteSave = useCallback((note) => {
    setNotes((prev) => ({ ...prev, [note.eventId]: { id: `note-${note.eventId}`, ...note } }));
  }, []);

  const handleNoteDelete = useCallback((noteId) => {
    setNotes((prev) => {
      const next = { ...prev };
      const key = Object.keys(next).find((item) => next[item].id === noteId);
      if (key) delete next[key];
      return next;
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', padding: 16, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1220, margin: '0 auto', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 16, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>WorksCalendar regression fixtures</h1>
          <p style={{ margin: '4px 0 0', color: '#475569', fontSize: 14 }}>Purpose-built events for drag, hover-card, mobile pill, and edit regressions.</p>
        </div>
        <div style={{ height: 'min(860px, calc(100vh - 92px))' }}>
          <WorksCalendar
            events={events}
            employees={employees}
            calendarId={CALENDAR_ID}
            ownerPassword="demo1234"
            devMode={true}
            notes={notes}
            onNoteSave={handleNoteSave}
            onNoteDelete={handleNoteDelete}
            onEventSave={handleEventSave}
            onEventDelete={handleEventDelete}
            onConfigSave={() => {}}
            theme="light"
            showAddButton={true}
            initialView="month"
            initialDate={today}
          />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

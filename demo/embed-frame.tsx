// @ts-nocheck — demo fixture, re-typed after Phase 2 d.ts regeneration
import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { WorksCalendar } from '../src/index.ts';

const CALENDAR_ID = 'iframe-embed-demo';

const employees = [
  { id: 'emp-1', name: 'Sarah Chen', role: 'Senior Engineer', color: '#3b82f6' },
  { id: 'emp-2', name: 'Marcus Webb', role: 'On-Call Engineer', color: '#ef4444' },
  { id: 'emp-3', name: 'Priya Sharma', role: 'Team Lead', color: '#10b981' },
];

function at(offsetDays, hour = 9, minute = 0, durationHours = 1) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  start.setHours(hour, minute, 0, 0);

  const end = new Date(start);
  end.setTime(end.getTime() + durationHours * 60 * 60 * 1000);

  return { start: start.toISOString(), end: end.toISOString() };
}

const events = [
  { id: 'evt-1', title: 'Daily Standup', ...at(0, 9, 0, 0.5), category: 'Meeting', color: '#64748b' },
  { id: 'evt-2', title: 'On Call', ...at(1, 8, 0, 24), category: 'on-call', resource: 'emp-2', color: '#ef4444' },
  { id: 'evt-3', title: 'Deploy Window', ...at(2, 14, 0, 2), category: 'Deploy', resource: 'emp-1', color: '#8b5cf6' },
  { id: 'evt-4', title: 'Incident Review', ...at(3, 11, 0, 1), category: 'Incident', resource: 'emp-3', color: '#f59e0b' },
  { id: 'evt-5', title: 'PTO', ...at(5, 0, 0, 24), category: 'PTO', resource: 'emp-1', color: '#10b981', allDay: true },
];

function EmbedFrameApp() {
  const [savedEvents, setSavedEvents] = useState(events);
  const [notes, setNotes] = useState({});

  const handleEventSave = useCallback((ev) => {
    setSavedEvents((prev) => {
      const idx = prev.findIndex((item) => item.id === ev.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = ev;
        return next;
      }
      return [...prev, { ...ev, id: `iframe-${Date.now()}` }];
    });
  }, []);

  const handleEventDelete = useCallback((id) => {
    setSavedEvents((prev) => prev.filter((item) => item.id !== id));
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
    <div style={{ height: '100%', width: '100%', padding: 12, boxSizing: 'border-box', background: '#f8fafc' }}>
      <div style={{ height: '100%', width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <WorksCalendar
          events={savedEvents}
          employees={employees}
          calendarId={CALENDAR_ID}
          ownerPassword="demo1234"
          notes={notes}
          onNoteSave={handleNoteSave}
          onNoteDelete={handleNoteDelete}
          onEventSave={handleEventSave}
          onEventDelete={handleEventDelete}
          onConfigSave={() => {}}
          theme="light"
          showAddButton={true}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <EmbedFrameApp />
  </StrictMode>
);

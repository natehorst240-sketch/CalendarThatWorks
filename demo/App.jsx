import { StrictMode, useState, useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorksCalendar } from '../src/index.js';
import { saveProfiles } from '../src/core/profileStore.js';

/* Seed demo profiles into localStorage so they show up on first load */
const DEMO_CALENDAR_ID = 'ihc-fleet-demo';
const DEMO_PROFILES = [
  {
    id: 'demo-p1',
    name: 'All AOG Aircraft',
    color: '#ef4444',
    filters: { categories: ['AOG'], resources: [], search: '' },
    view: 'agenda',
  },
  {
    id: 'demo-p2',
    name: 'Inspections Due',
    color: '#f59e0b',
    filters: { categories: ['Inspection'], resources: [], search: '' },
    view: 'month',
  },
  {
    id: 'demo-p3',
    name: 'N251HC Schedule',
    color: '#3b82f6',
    filters: { categories: [], resources: ['N251HC'], search: '' },
    view: 'schedule',
  },
  {
    id: 'demo-p4',
    name: 'Maintenance + AOG',
    color: '#8b5cf6',
    filters: { categories: ['Maintenance', 'AOG'], resources: [], search: '' },
    view: null,
  },
  {
    id: 'demo-p5',
    name: 'Flight Ops',
    color: '#06b6d4',
    filters: { categories: ['Utilization'], resources: [], search: '' },
    view: 'week',
  },
  {
    id: 'demo-p6',
    name: 'Full Fleet Timeline',
    color: '#10b981',
    filters: { categories: [], resources: [], search: '' },
    view: 'timeline',
  },
];

// Only seed if the user hasn't saved their own profiles yet
const stored = localStorage.getItem(`wc-profiles-${DEMO_CALENDAR_ID}`);
if (!stored || stored === '[]') {
  saveProfiles(DEMO_CALENDAR_ID, DEMO_PROFILES);
}

/* ─── Sample events: IHC Fleet ─────────────────────────────────── */
const today = new Date();
function d(offset, h = 9) {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offset);
  dt.setHours(h, 0, 0, 0);
  return dt.toISOString();
}
function dEnd(offset, h = 9, duration = 2) {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offset);
  dt.setHours(h + duration, 0, 0, 0);
  return dt.toISOString();
}

const INITIAL_EVENTS = [
  { id:'1',  title:'N251HC — 100hr Due',        start:d(-2),    end:dEnd(-2,9,4),   category:'Inspection',  resource:'N251HC', color:'#f59e0b', meta:{ priority:'High',      tech:'Smith' } },
  { id:'2',  title:'N261HC — AOG Hydraulic',    start:d(-1),    end:dEnd(-1,9,3),   category:'AOG',         resource:'N261HC', color:'#ef4444', meta:{ squawk:'Hyd leak main rotor' } },
  { id:'3',  title:'N271HC — Phase 3',          start:d(0),     end:dEnd(0,9,6),    category:'Inspection',  resource:'N271HC', color:'#f59e0b', meta:{ tech:'Jones' } },
  { id:'4',  title:'N281HC — Flight SAT',       start:d(1,7),   end:dEnd(1,7,2),    category:'Utilization', resource:'N281HC', color:'#3b82f6', meta:{ hours:'1.2' } },
  { id:'5',  title:'N291HC — Blade Track',      start:d(2,10),  end:dEnd(2,10,3),   category:'Maintenance', resource:'N291HC', color:'#8b5cf6', meta:{ tech:'Brown' } },
  { id:'6',  title:'N431HC — Flight SLC',       start:d(2,14),  end:dEnd(2,14,1),   category:'Utilization', resource:'N431HC', color:'#3b82f6', meta:{ hours:'0.8' } },
  { id:'7',  title:'N531HC — 300hr Inspection', start:d(4,8),   end:dEnd(4,8,8),    category:'Inspection',  resource:'N531HC', color:'#f59e0b', meta:{ priority:'Scheduled' } },
  { id:'8',  title:'N631HC — AOG Avionics',     start:d(4,11),  end:dEnd(4,11,2),   category:'AOG',         resource:'N631HC', color:'#ef4444', meta:{ squawk:'AFCS fault code 7' } },
  { id:'9',  title:'N731HC — Annual',           start:d(7,8),   end:dEnd(7,8,48),   category:'Inspection',  resource:'N731HC', color:'#f59e0b', meta:{ tech:'Garcia' } },
  { id:'10', title:'N251HC — Flight LAS',       start:d(3,6),   end:dEnd(3,6,3),    category:'Utilization', resource:'N251HC', color:'#3b82f6', meta:{ hours:'2.5' } },
  { id:'11', title:'N261HC — Gear Box Inspect', start:d(5,9),   end:dEnd(5,9,4),    category:'Maintenance', resource:'N261HC', color:'#8b5cf6', meta:{ tech:'Williams', priority:'Medium' } },
  { id:'12', title:'N271HC — Flight PHX',       start:d(6,13),  end:dEnd(6,13,2),   category:'Utilization', resource:'N271HC', color:'#3b82f6', meta:{ hours:'1.8' } },
  { id:'13', title:'N831HC — Incoming Delivery',start:d(8),     end:dEnd(8,9,1),    category:'Admin',       resource:'N831HC', color:'#06b6d4', meta:{ priority:'High' } },
  { id:'14', title:'N531HC — Engine Wash',      start:d(-3,10), end:dEnd(-3,10,2),  category:'Maintenance', resource:'N531HC', color:'#8b5cf6', meta:{ tech:'Smith' } },
  { id:'15', title:'Staff Meeting',             start:d(0,8),   end:dEnd(0,8,1),    category:'Admin',       resource:null,     color:'#06b6d4', meta:{} },
];

/* ─── Demo App ─────────────────────────────────────────────────── */
function App() {
  const [events,    setEvents]    = useState(INITIAL_EVENTS);
  const [notes,     setNotes]     = useState({});
  const [darkMode,  setDarkMode]  = useState(false);
  const [eventLog,  setEventLog]  = useState([]);

  const log = (msg) => setEventLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));

  const handleEventSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = ev;
        return next;
      }
      return [...prev, { ...ev, id: `demo-${Date.now()}` }];
    });
    log(`Saved event: ${ev.title}`);
  }, []);

  const handleEventDelete = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    log(`Deleted event: ${id}`);
  }, []);

  const handleNoteSave = useCallback((note) => {
    setNotes(prev => ({ ...prev, [note.eventId]: { id: `note-${note.eventId}`, ...note } }));
    log(`Note saved for event: ${note.eventId}`);
  }, []);

  const handleNoteDelete = useCallback((noteId) => {
    setNotes(prev => {
      const next = { ...prev };
      const key = Object.keys(next).find(k => next[k].id === noteId);
      if (key) delete next[key];
      return next;
    });
    log(`Note deleted: ${noteId}`);
  }, []);

  const handleConfigSave = useCallback((cfg) => {
    log('Config saved to localStorage');
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: darkMode ? '#0f172a' : '#f1f5f9' }}>
      {/* Demo header */}
      <header style={{
        background: darkMode ? '#1e293b' : '#fff',
        borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: darkMode ? '#f1f5f9' : '#0f172a' }}>
            WorksCalendar
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: darkMode ? '#94a3b8' : '#64748b' }}>
            IHC Fleet Dashboard — Demo
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: darkMode ? '#94a3b8' : '#64748b', cursor: 'pointer' }}>
            <input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
            Dark mode
          </label>
          <a href="https://github.com/natehorst240-sketch/CalendarThatWorks"
            style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}
            target="_blank" rel="noopener noreferrer">
            GitHub ↗
          </a>
        </div>
      </header>

      {/* Calendar */}
      <div style={{ flex: 1, padding: 'clamp(8px, 3vw, 24px)', minHeight: 0 }}>
        <div style={{ height: 'max(400px, calc(100vh - 160px))', maxWidth: 1400, margin: '0 auto' }}>
          <WorksCalendar
            events={events}
            calendarId="ihc-fleet-demo"
            ownerPassword="demo1234"
            onConfigSave={handleConfigSave}
            notes={notes}
            onNoteSave={handleNoteSave}
            onNoteDelete={handleNoteDelete}
            onEventSave={handleEventSave}
            onEventDelete={handleEventDelete}
            onEventClick={ev => log(`Clicked: ${ev.title}`)}
            theme={darkMode ? 'dark' : 'light'}
            showAddButton={true}
          />
        </div>
      </div>

      {/* Event log */}
      {eventLog.length > 0 && (
        <div style={{
          background: darkMode ? '#1e293b' : '#fff',
          borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
          padding: '8px 24px',
          fontSize: 11,
          color: darkMode ? '#94a3b8' : '#64748b',
          display: 'flex',
          gap: 16,
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <strong style={{ color: darkMode ? '#f1f5f9' : '#0f172a' }}>Log:</strong>
          {eventLog.slice(0, 4).map((msg, i) => <span key={i}>{msg}</span>)}
        </div>
      )}

      {/* Hints */}
      <div style={{
        background: darkMode ? '#1e293b' : '#fff',
        borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
        padding: '8px 24px',
        display: 'flex',
        gap: 24,
        fontSize: 11,
        color: darkMode ? '#64748b' : '#94a3b8',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span>⚙ Owner password: <code style={{ background: darkMode ? '#334155' : '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>demo1234</code></span>
        <span>Click any event to see the hover card with notes</span>
        <span>Use filter pills to narrow by category or aircraft</span>
        <span>📥 Download icon exports visible events to Excel/CSV</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

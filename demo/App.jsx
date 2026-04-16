import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { WorksCalendar } from '../src/index.js';
import { THEMES } from '../src/styles/themes.js';
import { saveProfiles } from '../src/core/profileStore.js';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/core/configSchema.js';

/* ─── Demo profiles ─────────────────────────────────────────────── */
const DEMO_CALENDAR_ID = 'ihc-oncall-demo';
const DEMO_PROFILES = [
  { id:'p1', name:'Full Schedule',       color:'#10b981', filters:{ categories:[],              resources:[], search:'' }, view:'schedule' },
  { id:'p2', name:'On-Call Only',        color:'#ef4444', filters:{ categories:['on-call'],      resources:[], search:'' }, view:'schedule' },
  { id:'p3', name:'Incidents',           color:'#f59e0b', filters:{ categories:['Incident'],     resources:[], search:'' }, view:'agenda'   },
  { id:'p4', name:'Sarah\'s Week',       color:'#3b82f6', filters:{ categories:[],              resources:['emp-sarah'], search:'' }, view:'week' },
  { id:'p5', name:'Month Overview',      color:'#8b5cf6', filters:{ categories:[],              resources:[], search:'' }, view:'month'    },
];
const stored = localStorage.getItem(`wc-profiles-${DEMO_CALENDAR_ID}`);
if (!stored || stored === '[]') saveProfiles(DEMO_CALENDAR_ID, DEMO_PROFILES);

/* ─── Demo config seed ──────────────────────────────────────────── */
// Pre-seed config with demo-appropriate defaults if it hasn't been set yet.
// This ensures the calendar title, default view, and theme all reflect the
// demo context rather than the generic DEFAULT_CONFIG values.
const storedCfg = localStorage.getItem(`wc-config-${DEMO_CALENDAR_ID}`);
if (!storedCfg) {
  saveConfig(DEMO_CALENDAR_ID, {
    ...DEFAULT_CONFIG,
    title: 'IHC Fleet On-Call',
    setup: { completed: true, preferredTheme: 'corporate' },
    display: { ...DEFAULT_CONFIG.display, defaultView: 'schedule' },
  });
}

// Read the stored (or just-seeded) preferred theme so the ThemePicker
// starts in sync with whatever the config says.
const _seedConfig = loadConfig(DEMO_CALENDAR_ID);
const INITIAL_THEME = _seedConfig.setup?.preferredTheme ?? 'corporate';

/* ─── Employees ─────────────────────────────────────────────────── */
const INITIAL_EMPLOYEES = [
  { id: 'emp-sarah',  name: 'Sarah Chen',    role: 'Senior Engineer',   color: '#3b82f6' },
  { id: 'emp-marcus', name: 'Marcus Webb',   role: 'On-Call Engineer',  color: '#ef4444' },
  { id: 'emp-priya',  name: 'Priya Sharma',  role: 'Team Lead',         color: '#10b981' },
  { id: 'emp-james',  name: 'James Torres',  role: 'DevOps / SRE',      color: '#8b5cf6' },
  { id: 'emp-alex',   name: 'Alex Kim',      role: 'Software Engineer', color: '#f59e0b' },
  { id: 'emp-dana',   name: 'Dana Okafor',   role: 'Site Reliability',  color: '#06b6d4' },
];

/* ─── Events ────────────────────────────────────────────────────── */
const today = new Date();
today.setHours(0, 0, 0, 0);

// Shift an ISO date by `days` days
function shift(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Start of the current month
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

// Build on-call rotation: each engineer covers 7 days in round-robin order
function buildOnCallRotation(employees, monthStart) {
  const shifts = [];
  let id = 100;
  // 6 rotation slots across the month (some may overlap month boundary)
  for (let slot = 0; slot < 5; slot++) {
    const emp = employees[slot % employees.length];
    const start = shift(monthStart, slot * 7);
    const end   = shift(start, 7);     // exclusive end
    shifts.push({
      id: String(id++),
      title: 'On Call',
      start: start.toISOString(),
      end:   end.toISOString(),
      category: 'on-call',
      resource: emp.id,
      color: emp.color,
    });
  }
  return shifts;
}

// Regular events
function d(offsetDays, hour = 9) {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offsetDays);
  dt.setHours(hour, 0, 0, 0);
  return dt.toISOString();
}
function dEnd(offsetDays, hour = 9, durH = 1) {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + offsetDays);
  dt.setHours(hour + durH, 0, 0, 0);
  return dt.toISOString();
}

const REGULAR_EVENTS = [
  // Team standup — daily (not recurring in this demo, just a few instances)
  { id:'m1',  title:'Daily Standup',        start:d(0,9),   end:dEnd(0,9,0.25),  category:'Meeting',  resource:null,         color:'#64748b' },
  { id:'m2',  title:'Daily Standup',        start:d(1,9),   end:dEnd(1,9,0.25),  category:'Meeting',  resource:null,         color:'#64748b' },
  { id:'m3',  title:'Daily Standup',        start:d(2,9),   end:dEnd(2,9,0.25),  category:'Meeting',  resource:null,         color:'#64748b' },
  { id:'m4',  title:'Daily Standup',        start:d(3,9),   end:dEnd(3,9,0.25),  category:'Meeting',  resource:null,         color:'#64748b' },
  { id:'m5',  title:'Daily Standup',        start:d(4,9),   end:dEnd(4,9,0.25),  category:'Meeting',  resource:null,         color:'#64748b' },

  // 1-on-1s
  { id:'o1',  title:'1-on-1 w/ Sarah',      start:d(1,10),  end:dEnd(1,10),      category:'Meeting',  resource:'emp-sarah',  color:'#3b82f6' },
  { id:'o2',  title:'1-on-1 w/ Marcus',     start:d(2,10),  end:dEnd(2,10),      category:'Meeting',  resource:'emp-marcus', color:'#ef4444' },
  { id:'o3',  title:'1-on-1 w/ Alex',       start:d(3,11),  end:dEnd(3,11),      category:'Meeting',  resource:'emp-alex',   color:'#f59e0b' },
  { id:'o4',  title:'1-on-1 w/ Dana',       start:d(5,14),  end:dEnd(5,14),      category:'Meeting',  resource:'emp-dana',   color:'#06b6d4' },

  // Incidents
  { id:'i1',  title:'P1 Incident — API timeout',  start:d(-1,2),  end:dEnd(-1,2,3),  category:'Incident', resource:'emp-marcus', color:'#ef4444', status:'confirmed' },
  { id:'i2',  title:'P2 Incident — DB slow query', start:d(2,14), end:dEnd(2,14,2),  category:'Incident', resource:'emp-james',  color:'#f97316' },

  // Code reviews / deploys
  { id:'d1',  title:'Prod Deploy — v2.4.1',  start:d(4,15),  end:dEnd(4,15,1),   category:'Deploy',   resource:'emp-james',  color:'#8b5cf6' },
  { id:'d2',  title:'Staging Deploy',        start:d(1,16),  end:dEnd(1,16,1),   category:'Deploy',   resource:'emp-james',  color:'#8b5cf6' },

  // Sprint events
  { id:'s1',  title:'Sprint Planning',       start:d(7,9),   end:dEnd(7,9,3),    category:'Meeting',  resource:null,         color:'#64748b' },
  { id:'s2',  title:'Sprint Retrospective',  start:d(-3,14), end:dEnd(-3,14,2),  category:'Meeting',  resource:null,         color:'#64748b' },
  { id:'s3',  title:'Sprint Demo',           start:d(-1,15), end:dEnd(-1,15,1),  category:'Meeting',  resource:null,         color:'#64748b' },

  // PTO
  { id:'v1',  title:'PTO — Priya',           start:d(8),     end:dEnd(11),       category:'PTO',      resource:'emp-priya',  color:'#10b981', allDay:true },

  // Training
  { id:'t1',  title:'AWS Security Training', start:d(5,10),  end:dEnd(5,10,4),   category:'Training', resource:'emp-alex',   color:'#f59e0b' },
  { id:'t2',  title:'K8s Workshop',          start:d(6,9),   end:dEnd(6,9,3),    category:'Training', resource:'emp-dana',   color:'#06b6d4' },
];

const INITIAL_EVENTS = [
  ...buildOnCallRotation(INITIAL_EMPLOYEES, monthStart),
  ...REGULAR_EVENTS,
];

/* ─── Theme picker ──────────────────────────────────────────────── */
function ThemePicker({ current, onChange }) {
  const [open, setOpen] = useState(false);
  const active = THEMES.find(t => t.id === current) ?? THEMES[0];

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px',
          background: active.preview.bg,
          border: `2px solid ${active.preview.accent}`,
          borderRadius: 8, cursor: 'pointer', fontSize: 12,
          color: active.preview.text, fontWeight: 600,
          boxShadow: '0 1px 4px rgba(0,0,0,.12)',
        }}
        title="Change theme"
      >
        <span style={{ display:'flex', gap:3 }}>
          {[active.preview.accent, active.preview.bg, active.preview.surface].map((c, i) => (
            <span key={i} style={{ width:12, height:12, borderRadius:'50%', background:c, border:'1px solid rgba(0,0,0,.15)', display:'inline-block' }} />
          ))}
        </span>
        {active.label}
        <span style={{ opacity:0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.15)',
          padding: 10, display: 'flex', flexDirection: 'column', gap: 4,
          zIndex: 1000, minWidth: 220,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', padding: '2px 6px 6px' }}>
            Choose a theme
          </div>
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => { onChange(t.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', border: 'none', borderRadius: 8,
                background: t.id === current ? t.preview.accent + '18' : 'transparent',
                cursor: 'pointer', textAlign: 'left',
                outline: t.id === current ? `2px solid ${t.preview.accent}` : 'none',
                outlineOffset: -2,
              }}
            >
              <div style={{
                width: 36, height: 28, borderRadius: 5, flexShrink: 0,
                background: t.preview.bg, border: `1px solid ${t.preview.border}`,
                overflow: 'hidden', position: 'relative',
              }}>
                <div style={{ height: 8, background: t.preview.surface, borderBottom: `1px solid ${t.preview.border}` }} />
                <div style={{ position:'absolute', bottom:4, left:4, right:4, height:6, borderRadius:2, background: t.preview.accent, opacity:0.85 }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', display:'flex', alignItems:'center', gap:5 }}>
                  {t.label}
                  {t.dark && <span style={{ fontSize:9, background:'#334155', color:'#94a3b8', padding:'1px 5px', borderRadius:3, fontWeight:600 }}>DARK</span>}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{t.description.slice(0, 48)}{t.description.length > 48 ? '…' : ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── PWA update toast ──────────────────────────────────────────── */
function UpdateToast({ onUpdate, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: '#1e293b', color: '#f1f5f9', borderRadius: 10,
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,.35)', zIndex: 9999, fontSize: 13,
      border: '1px solid #334155',
    }}>
      <span>A new version is available.</span>
      <button
        onClick={onUpdate}
        style={{
          background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 6,
          padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
        }}
      >
        Update
      </button>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent', color: '#94a3b8', border: 'none',
          cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/* ─── Demo App ──────────────────────────────────────────────────── */
function App() {
  const [events,       setEvents]       = useState(INITIAL_EVENTS);
  const [notes,        setNotes]        = useState({});
  const [theme,        setTheme]        = useState(INITIAL_THEME);
  const [employees,    setEmployees]    = useState(INITIAL_EMPLOYEES);
  const [eventLog,     setEventLog]     = useState([]);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const [updateSW] = useState(() =>
    registerSW({
      onNeedRefresh() { setNeedsRefresh(true); },
      onOfflineReady() { console.info('[PWA] App ready to work offline.'); },
    })
  );

  const log = (msg) => setEventLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));

  // When the owner saves config (e.g. changes preferred theme in Settings > Setup),
  // sync the demo's ThemePicker so both stay in agreement.
  const handleConfigSave = useCallback((cfg) => {
    log('Config saved');
    const newTheme = cfg.setup?.preferredTheme;
    if (newTheme) setTheme(newTheme);
  }, []);

  const isDark       = THEMES.find(t => t.id === theme)?.dark ?? false;
  const headerBg     = isDark ? '#0f172a' : '#fff';
  const headerBorder = isDark ? '#1e293b' : '#e2e8f0';
  const pageBg       = isDark ? '#060d1a' : '#f1f5f9';

  const handleEventSave = useCallback((ev) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === ev.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ev; return next; }
      return [...prev, { ...ev, id: `demo-${Date.now()}` }];
    });
    log(`Saved: ${ev.title}`);
  }, []);

  const handleEventDelete = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    log(`Deleted: ${id}`);
  }, []);

  const handleNoteSave = useCallback((note) => {
    setNotes(prev => ({ ...prev, [note.eventId]: { id: `note-${note.eventId}`, ...note } }));
    log(`Note saved for ${note.eventId}`);
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

  const handleEmployeeAdd = useCallback((emp) => {
    setEmployees(prev => [...prev, emp]);
    log(`Added employee: ${emp.name}`);
  }, []);

  const handleEmployeeDelete = useCallback((id) => {
    setEmployees(prev => prev.filter(e => e.id !== id));
    log(`Removed employee: ${id}`);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: pageBg }}>

      {/* ── Header ── */}
      <header style={{
        background: headerBg, borderBottom: `1px solid ${headerBorder}`,
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#f1f5f9' : '#0f172a' }}>
            WorksCalendar
          </h1>
          <p style={{ margin: 0, fontSize: 11, color: isDark ? '#64748b' : '#94a3b8' }}>
            Engineering On-Call Schedule — Demo
          </p>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ThemePicker current={theme} onChange={setTheme} />
        </div>
      </header>

      {/* ── Calendar ── */}
      <div style={{ flex: 1, padding: 'clamp(8px, 3vw, 20px)', minHeight: 0 }}>
        <div style={{ height: 'max(400px, calc(100vh - 148px))', maxWidth: 1400, margin: '0 auto' }}>
          <WorksCalendar
            events={events}
            employees={employees}
            onEmployeeAdd={handleEmployeeAdd}
            onEmployeeDelete={handleEmployeeDelete}
            calendarId={DEMO_CALENDAR_ID}
            ownerPassword="demo1234"
            initialView="schedule"
            onConfigSave={handleConfigSave}
            notes={notes}
            onNoteSave={handleNoteSave}
            onNoteDelete={handleNoteDelete}
            onEventSave={handleEventSave}
            onEventDelete={handleEventDelete}
            onEventClick={ev => log(`Clicked: ${ev.title}`)}
            theme={theme}
            showAddButton={true}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        background: headerBg, borderTop: `1px solid ${headerBorder}`,
        padding: '6px 20px', display: 'flex', gap: 20, flexWrap: 'wrap',
        fontSize: 11, color: isDark ? '#475569' : '#94a3b8', flexShrink: 0,
        alignItems: 'center',
      }}>
        {eventLog.length > 0 && (
          <>
            <strong style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Log:</strong>
            {eventLog.slice(0, 4).map((m, i) => <span key={i}>{m}</span>)}
            <span style={{ marginLeft: 'auto' }} />
          </>
        )}
        <span>⚙ Owner pw: <code style={{ background: isDark ? '#1e293b' : '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>demo1234</code></span>
        <span>Settings → Setup: change calendar title &amp; theme</span>
        <span>Settings → Display: default view, hours, week start</span>
        <span>Settings → Theme: live CSS token customizer</span>
        <span>Striped bars = on-call shifts · Click event → notes</span>
      </div>

      {needsRefresh && (
        <UpdateToast
          onUpdate={() => { updateSW(true); setNeedsRefresh(false); }}
          onDismiss={() => setNeedsRefresh(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);

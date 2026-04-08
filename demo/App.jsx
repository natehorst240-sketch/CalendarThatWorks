import { StrictMode, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { WorksCalendar } from '../src/index.js';
import { THEMES } from '../src/styles/themes.js';
import { saveProfiles } from '../src/core/profileStore.js';

/* Seed demo profiles into localStorage so they show up on first load */
const DEMO_CALENDAR_ID = 'ihc-fleet-demo';
const DEMO_PROFILES = [
  { id:'demo-p1', name:'All AOG Aircraft',    color:'#ef4444', filters:{ categories:['AOG'],                     resources:[], search:'' }, view:'agenda'    },
  { id:'demo-p2', name:'Inspections Due',     color:'#f59e0b', filters:{ categories:['Inspection'],              resources:[], search:'' }, view:'month'     },
  { id:'demo-p3', name:'N251HC Schedule',     color:'#3b82f6', filters:{ categories:[],                          resources:['N251HC'], search:'' }, view:'schedule' },
  { id:'demo-p4', name:'Maintenance + AOG',   color:'#8b5cf6', filters:{ categories:['Maintenance','AOG'],       resources:[], search:'' }, view:null        },
  { id:'demo-p5', name:'Flight Ops',          color:'#06b6d4', filters:{ categories:['Utilization'],             resources:[], search:'' }, view:'week'      },
  { id:'demo-p6', name:'Full Fleet Timeline', color:'#10b981', filters:{ categories:[],                          resources:[], search:'' }, view:'timeline'  },
];
const stored = localStorage.getItem(`wc-profiles-${DEMO_CALENDAR_ID}`);
if (!stored || stored === '[]') saveProfiles(DEMO_CALENDAR_ID, DEMO_PROFILES);

/* ─── Sample events ─────────────────────────────────────────────── */
const today = new Date();
const d    = (offset, h = 9) => { const dt = new Date(today); dt.setDate(dt.getDate() + offset); dt.setHours(h, 0, 0, 0); return dt.toISOString(); };
const dEnd = (offset, h = 9, dur = 2) => { const dt = new Date(today); dt.setDate(dt.getDate() + offset); dt.setHours(h + dur, 0, 0, 0); return dt.toISOString(); };

const INITIAL_EVENTS = [
  { id:'1',  title:'N251HC — 100hr Due',        start:d(-2),   end:dEnd(-2,9,4),  category:'Inspection',  resource:'N251HC', color:'#f59e0b', meta:{ priority:'High',      tech:'Smith'    } },
  { id:'2',  title:'N261HC — AOG Hydraulic',    start:d(-1),   end:dEnd(-1,9,3),  category:'AOG',         resource:'N261HC', color:'#ef4444', meta:{ squawk:'Hyd leak main rotor'           } },
  { id:'3',  title:'N271HC — Phase 3',          start:d(0),    end:dEnd(0,9,6),   category:'Inspection',  resource:'N271HC', color:'#f59e0b', meta:{ tech:'Jones'                           } },
  { id:'4',  title:'N281HC — Flight SAT',       start:d(1,7),  end:dEnd(1,7,2),   category:'Utilization', resource:'N281HC', color:'#3b82f6', meta:{ hours:'1.2'                            } },
  { id:'5',  title:'N291HC — Blade Track',      start:d(2,10), end:dEnd(2,10,3),  category:'Maintenance', resource:'N291HC', color:'#8b5cf6', meta:{ tech:'Brown'                           } },
  { id:'6',  title:'N431HC — Flight SLC',       start:d(2,14), end:dEnd(2,14,1),  category:'Utilization', resource:'N431HC', color:'#3b82f6', meta:{ hours:'0.8'                            } },
  { id:'7',  title:'N531HC — 300hr Inspection', start:d(4,8),  end:dEnd(4,8,8),   category:'Inspection',  resource:'N531HC', color:'#f59e0b', meta:{ priority:'Scheduled'                   } },
  { id:'8',  title:'N631HC — AOG Avionics',     start:d(4,11), end:dEnd(4,11,2),  category:'AOG',         resource:'N631HC', color:'#ef4444', meta:{ squawk:'AFCS fault code 7'             } },
  { id:'9',  title:'N731HC — Annual',           start:d(7,8),  end:dEnd(7,8,48),  category:'Inspection',  resource:'N731HC', color:'#f59e0b', meta:{ tech:'Garcia'                          } },
  { id:'10', title:'N251HC — Flight LAS',       start:d(3,6),  end:dEnd(3,6,3),   category:'Utilization', resource:'N251HC', color:'#3b82f6', meta:{ hours:'2.5'                            } },
  { id:'11', title:'N261HC — Gear Box Inspect', start:d(5,9),  end:dEnd(5,9,4),   category:'Maintenance', resource:'N261HC', color:'#8b5cf6', meta:{ tech:'Williams', priority:'Medium'     } },
  { id:'12', title:'N271HC — Flight PHX',       start:d(6,13), end:dEnd(6,13,2),  category:'Utilization', resource:'N271HC', color:'#3b82f6', meta:{ hours:'1.8'                            } },
  { id:'13', title:'N831HC — Incoming Delivery',start:d(8),    end:dEnd(8,9,1),   category:'Admin',       resource:'N831HC', color:'#06b6d4', meta:{ priority:'High'                        } },
  { id:'14', title:'N531HC — Engine Wash',      start:d(-3,10),end:dEnd(-3,10,2), category:'Maintenance', resource:'N531HC', color:'#8b5cf6', meta:{ tech:'Smith'                           } },
  { id:'15', title:'Staff Meeting',             start:d(0,8),  end:dEnd(0,8,1),   category:'Admin',       resource:null,     color:'#06b6d4', meta:{}                                       },
];

/* ─── Theme Swatch Picker ───────────────────────────────────────── */
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
          {[active.preview.accent, active.preview.bg, active.preview.surface].map((c,i) => (
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
              {/* Mini calendar swatch */}
              <div style={{
                width: 36, height: 28, borderRadius: 5, flexShrink: 0,
                background: t.preview.bg,
                border: `1px solid ${t.preview.border}`,
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

/* ─── Demo App ──────────────────────────────────────────────────── */
function App() {
  const [events,   setEvents]   = useState(INITIAL_EVENTS);
  const [notes,    setNotes]    = useState({});
  const [theme,    setTheme]    = useState('light');
  const [eventLog, setEventLog] = useState([]);

  const log = (msg) => setEventLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));

  const isDark = THEMES.find(t => t.id === theme)?.dark ?? false;
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: pageBg }}>

      {/* ── Demo header ── */}
      <header style={{
        background: headerBg,
        borderBottom: `1px solid ${headerBorder}`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isDark ? '#f1f5f9' : '#0f172a' }}>
            WorksCalendar
          </h1>
          <p style={{ margin: 0, fontSize: 11, color: isDark ? '#64748b' : '#94a3b8' }}>
            IHC Fleet Dashboard — Demo
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
            calendarId={DEMO_CALENDAR_ID}
            ownerPassword="demo1234"
            onConfigSave={() => log('Config saved')}
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
        <span>Click event → hover card + notes</span>
        <span>Profile bar → save any filter combo</span>
        <span>📥 Export visible events to Excel/CSV</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);

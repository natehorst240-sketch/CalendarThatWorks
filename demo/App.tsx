// @ts-nocheck — demo fixture, re-typed after Phase 2 d.ts regeneration
import { StrictMode, useState, useCallback, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import {
  WorksCalendar,
  DEFAULT_CATEGORIES,
  createManualLocationProvider,
} from '../src/index.ts';
import { THEMES } from '../src/styles/themes';
import { saveProfiles } from '../src/core/profileStore';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/core/configSchema';

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
// Bases (airbases / regional hubs). Used by the Base Gantt view, the Assets
// view's base column, and the approval-flow demo. Employees and assets below
// reference these by id.
const DEMO_BASES = [
  { id: 'base-phx', name: 'Phoenix HQ (KPHX)' },
  { id: 'base-lax', name: 'Los Angeles (KLAX)' },
  { id: 'base-den', name: 'Denver (KDEN)' },
  { id: 'base-ord', name: 'Chicago (KORD)' },
  { id: 'base-jfk', name: 'New York (KJFK)' },
  { id: 'base-bos', name: 'Boston (KBOS)' },
];

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
    team: { ...DEFAULT_CONFIG.team, bases: DEMO_BASES },
    approvals: { ...DEFAULT_CONFIG.approvals, enabled: true },
  });
} else {
  // Idempotent backfill: returning demo users pick up bases / approvals
  // without clearing localStorage. Reads the RAW stored payload (not the
  // default-merged result) so an owner who explicitly disabled approvals
  // in Settings keeps their choice — only missing values are filled in.
  let parsedRaw = null;
  try { parsedRaw = JSON.parse(storedCfg); } catch {}
  if (parsedRaw && typeof parsedRaw === 'object') {
    const needsBases     = !Array.isArray(parsedRaw.team?.bases) || parsedRaw.team.bases.length === 0;
    const needsApprovals = parsedRaw.approvals?.enabled === undefined;
    if (needsBases || needsApprovals) {
      const existing = loadConfig(DEMO_CALENDAR_ID);
      saveConfig(DEMO_CALENDAR_ID, {
        ...existing,
        ...(needsBases     ? { team:      { ...existing.team,      bases: DEMO_BASES } } : {}),
        ...(needsApprovals ? { approvals: { ...existing.approvals, enabled: true } }    : {}),
      });
    }
  }
}

// Read the stored (or just-seeded) preferred theme so the ThemePicker
// starts in sync with whatever the config says.
const _seedConfig = loadConfig(DEMO_CALENDAR_ID);
const INITIAL_THEME = _seedConfig.setup?.preferredTheme ?? 'corporate';

/* ─── Employees ─────────────────────────────────────────────────── */
// Each employee is pre-assigned to a base so the Base Gantt view renders
// populated rows out of the box. Phoenix and LAX each host two people; Denver
// and Chicago host one; JFK and Boston are asset-only bases. A few of the
// people carry "Accountable Manager" assignments so the base header shows the
// one-stop contact roster (Base / Ops / Maintenance manager + phone).
const INITIAL_EMPLOYEES = [
  { id: 'emp-sarah',  name: 'Sarah Chen',    role: 'Senior Engineer',   color: '#3b82f6', base: 'base-phx',
    phone: '602-555-0114',
    accountableManagers: [{ title: 'Base Manager', phone: '602-555-0114' }] },
  { id: 'emp-marcus', name: 'Marcus Webb',   role: 'On-Call Engineer',  color: '#ef4444', base: 'base-phx',
    phone: '602-555-0129',
    accountableManagers: [{ title: 'Maintenance Manager', phone: '602-555-0129' }] },
  { id: 'emp-priya',  name: 'Priya Sharma',  role: 'Team Lead',         color: '#10b981', base: 'base-den',
    phone: '303-555-0177',
    accountableManagers: [{ title: 'Base Manager' }, { title: 'Ops Manager', phone: '303-555-0177' }] },
  { id: 'emp-james',  name: 'James Torres',  role: 'DevOps / SRE',      color: '#8b5cf6', base: 'base-lax',
    phone: '310-555-0141',
    accountableManagers: [{ title: 'Ops Manager', phone: '310-555-0141' }] },
  { id: 'emp-alex',   name: 'Alex Kim',      role: 'Software Engineer', color: '#f59e0b', base: 'base-ord',
    phone: '312-555-0162' },
  { id: 'emp-dana',   name: 'Dana Okafor',   role: 'Site Reliability',  color: '#06b6d4', base: 'base-lax',
    phone: '310-555-0198',
    accountableManagers: [{ title: 'Maintenance Manager', phone: '310-555-0198' }] },
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

/* ─── Assets (aircraft, trucks, equipment…) ───────────────────────
 *
 * Assets are first-class rows in the Assets view (distinct from people,
 * who live on the Schedule view). The demo ships a small fleet of
 * aircraft; the library accepts any resource kind the user defines.
 */
const AIRCRAFT_RESOURCES = [
  { id: 'N121AB', label: 'N121AB', group: 'West',    meta: { sublabel: 'Citation CJ3',    model: 'Citation CJ3',     base: 'base-phx', location: { text: 'KPHX', status: 'live',  asOf: new Date().toISOString() } } },
  { id: 'N505CD', label: 'N505CD', group: 'West',    meta: { sublabel: 'Phenom 300',      model: 'Phenom 300',       base: 'base-lax', location: { text: 'KLAX', status: 'stale', asOf: new Date().toISOString() } } },
  { id: 'N88QR',  label: 'N88QR',  group: 'Central', meta: { sublabel: 'King Air 350',    model: 'King Air 350',     base: 'base-den', location: { text: 'KDEN', status: 'live',  asOf: new Date().toISOString() } } },
  { id: 'N733XY', label: 'N733XY', group: 'Central', meta: { sublabel: 'Challenger 350',  model: 'Challenger 350',   base: 'base-ord', location: { text: 'KORD', status: 'live',  asOf: new Date().toISOString() } } },
  { id: 'N901JT', label: 'N901JT', group: 'East',    meta: { sublabel: 'Gulfstream G280', model: 'Gulfstream G280',  base: 'base-jfk', location: { text: 'KJFK', status: 'live',  asOf: new Date().toISOString() } } },
  { id: 'N245LM', label: 'N245LM', group: 'East',    meta: { sublabel: 'Pilatus PC-24',   model: 'Pilatus PC-24',    base: 'base-bos', location: { text: 'KBOS', status: 'live',  asOf: new Date().toISOString() } } },
];
const FLEET_EVENTS = [
  { id: 'f1',  title: 'Recurrent training',   start: d(0, 9),   end: dEnd(0, 9, 6),  category: 'training',    resource: 'N121AB', meta: { sublabel: 'Citation CJ3',  region: 'West' } },
  { id: 'f2',  title: 'VIP lift to KTEB',     start: d(2, 6),   end: dEnd(2, 6, 8),  category: 'pr',          resource: 'N121AB', meta: { sublabel: 'Citation CJ3',  region: 'West' } },
  { id: 'f3',  title: 'A-check',              start: d(5),      end: dEnd(8),        category: 'maintenance', resource: 'N505CD', meta: { sublabel: 'Phenom 300',    region: 'West',  approvalStage: { stage: 'approved', updatedAt: d(-1) } }, allDay: true },
  { id: 'f4',  title: 'Charter: Aspen',       start: d(3, 10),  end: dEnd(4, 16),    category: 'pr',          resource: 'N88QR',  meta: { sublabel: 'King Air 350',  region: 'Central' } },
  { id: 'f5',  title: 'Brake inspection',     start: d(1),      end: dEnd(1),        category: 'maintenance', resource: 'N88QR',  meta: { sublabel: 'King Air 350',  region: 'Central', approvalStage: { stage: 'finalized', updatedAt: d(-2) } }, allDay: true },
  { id: 'f6',  title: 'Type rating',          start: d(6, 9),   end: dEnd(6, 9, 6),  category: 'training',    resource: 'N733XY', meta: { sublabel: 'Challenger 350', region: 'Central' } },
  { id: 'f7',  title: 'Avionics upgrade',     start: d(9),      end: dEnd(12),       category: 'maintenance', resource: 'N733XY', meta: { sublabel: 'Challenger 350', region: 'Central', approvalStage: { stage: 'pending_higher', updatedAt: d(-1) } }, allDay: true },
  { id: 'f8',  title: 'Charter: Cabo',        start: d(4, 8),   end: dEnd(6, 18),    category: 'pr',          resource: 'N901JT', meta: { sublabel: 'Gulfstream G280', region: 'East' } },
  { id: 'f9',  title: 'Coverage block',       start: d(7, 7),   end: dEnd(7, 7, 10), category: 'coverage',    resource: 'N901JT', meta: { sublabel: 'Gulfstream G280', region: 'East' } },
  { id: 'f10', title: 'Dispatch ferry',       start: d(2, 14),  end: dEnd(2, 14, 4), category: 'pr',          resource: 'N245LM', meta: { sublabel: 'Pilatus PC-24', region: 'East',  approvalStage: { stage: 'requested', updatedAt: d(-1) } } },
  { id: 'f11', title: 'Paint refresh',        start: d(10),     end: dEnd(15),       category: 'maintenance', resource: 'N245LM', meta: { sublabel: 'Pilatus PC-24', region: 'East',  approvalStage: { stage: 'denied', updatedAt: d(-1), history: [{ action: 'deny', at: d(-1), actor: 'chief-pilot', tier: 2, reason: 'Conflicts with higher-priority dispatch.' }] } }, allDay: true },
  { id: 'f12', title: 'SIM session',          start: d(11, 9),  end: dEnd(11, 9, 4), category: 'training',    resource: 'N505CD', meta: { sublabel: 'Phenom 300',    region: 'West' } },
];

// Unified category palette — engineering ops + fleet ops. The calendar
// uses a single category set across views; each event references whichever
// category suits it (on-call / Incident / Deploy for people, training /
// maintenance / pr / coverage for aircraft).
const UNIFIED_CATEGORIES = [
  // Engineering
  { id: 'on-call',  label: 'On Call',    color: '#ef4444' },
  { id: 'Incident', label: 'Incident',   color: '#f97316' },
  { id: 'Deploy',   label: 'Deploy',     color: '#8b5cf6' },
  { id: 'Meeting',  label: 'Meeting',    color: '#64748b' },
  { id: 'PTO',      label: 'PTO',        color: '#10b981' },
  // Fleet (from DEFAULT_CATEGORIES, spread here so both sets share the palette)
  ...DEFAULT_CATEGORIES,
  // Demo-only: asset movement requests route through the approvals workflow.
  { id: 'aircraft-movement', label: 'Aircraft Movement', color: '#06b6d4' },
];

const UNIFIED_CATEGORIES_CONFIG = {
  categories: UNIFIED_CATEGORIES,
  pillStyle: 'hue',
  defaultCategoryId: 'other',
};

/* ─── Approval state machine (demo) ─────────────────────────────── */
//
// Resolves the next stage purely from action-verb semantics, so any
// (stage, action) pair the owner-configured ApprovalActionMenu can present
// produces a sensible transition — no dead clicks if the owner customizes
// `config.approvals.rules[stage].allow[]`.
//
//   approve  ─▶ pending_higher → finalized    (second-tier approval)
//              everything else → approved     (first approval lands here)
//   deny     ─▶ denied
//   finalize ─▶ finalized
//   revoke   ─▶ finalized → approved          (roll back one step)
//              everything else → requested
function nextStageFor(currentStage, actionId) {
  const stage = currentStage ?? 'requested';
  switch (actionId) {
    case 'approve':  return stage === 'pending_higher' ? 'finalized' : 'approved';
    case 'deny':     return 'denied';
    case 'finalize': return 'finalized';
    case 'revoke':   return stage === 'finalized'      ? 'approved'  : 'requested';
    default:         return null;
  }
}

function applyApprovalTransition(event, actionId, payload) {
  const stage = event?.meta?.approvalStage;
  const currentStage = stage?.stage ?? 'requested';
  const nextStage = nextStageFor(currentStage, actionId);
  if (!nextStage) return event;

  const now = new Date().toISOString();
  const historyEntry = {
    action: actionId,
    at:     now,
    actor:  payload?.actor ?? 'demo-user',
    ...(payload?.tier   !== undefined ? { tier:   payload.tier   } : {}),
    ...(payload?.reason !== undefined ? { reason: payload.reason } : {}),
  };
  return {
    ...event,
    meta: {
      ...(event.meta ?? {}),
      approvalStage: {
        stage:     nextStage,
        updatedAt: now,
        history:   [...(stage?.history ?? []), historyEntry],
      },
    },
  };
}

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
  // A single events array holds both people-events (resource = emp-*) and
  // asset-events (resource = aircraft registration). Schedule view picks up
  // the people subset via the employees prop; Assets view picks up the
  // aircraft subset via the assets prop + strictAssetFiltering.
  const [events,       setEvents]       = useState([...INITIAL_EVENTS, ...FLEET_EVENTS]);
  const [notes,        setNotes]        = useState({});
  const [theme,        setTheme]        = useState(INITIAL_THEME);
  const [employees,    setEmployees]    = useState(INITIAL_EMPLOYEES);
  const [eventLog,     setEventLog]     = useState([]);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const assetLocationProvider = useMemo(
    () => createManualLocationProvider({ resources: AIRCRAFT_RESOURCES }),
    [],
  );

  const [updateSW] = useState(() =>
    registerSW({
      onNeedRefresh() { setNeedsRefresh(true); },
      onOfflineReady() { console.info('[PWA] App ready to work offline.'); },
    })
  );

  // Keep the public demo on the latest bundle automatically so feature
  // updates (like the unified Filter/Group/Views sidebar) are visible
  // without requiring users to notice and click the update toast.
  useEffect(() => {
    if (!needsRefresh) return;
    void updateSW(true);
    setNeedsRefresh(false);
  }, [needsRefresh, updateSW]);

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
      return [...prev, ev];
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

  const handleApprovalAction = useCallback((event, actionId, payload) => {
    const nextStage = nextStageFor(event?.meta?.approvalStage?.stage ?? 'requested', actionId);
    if (!nextStage) {
      log(`Approval: ${actionId} not allowed from ${event?.meta?.approvalStage?.stage ?? 'requested'}`);
      return;
    }
    setEvents(prev => prev.map(e => e.id === event.id ? applyApprovalTransition(e, actionId, payload) : e));
    log(`Approval: ${event.title} → ${nextStage}`);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: pageBg }}>

      {/* ── Calendar ── */}
      <div style={{ flex: 1, padding: 0, minHeight: 0 }}>
        <div style={{ height: '100%', width: '100%' }}>
          <WorksCalendar
            events={events}
            employees={employees}
            assets={AIRCRAFT_RESOURCES}
            strictAssetFiltering={true}
            assetRequestCategories={['maintenance', 'pr', 'training', 'aircraft-movement']}
            onEmployeeAdd={handleEmployeeAdd}
            onEmployeeDelete={handleEmployeeDelete}
            calendarId={DEMO_CALENDAR_ID}
            ownerPassword="demo1234"
            initialView="schedule"
            showSetupLanding
            onConfigSave={handleConfigSave}
            notes={notes}
            onNoteSave={handleNoteSave}
            onNoteDelete={handleNoteDelete}
            onEventSave={handleEventSave}
            onEventDelete={handleEventDelete}
            onScheduleSave={handleEventSave}
            onAvailabilitySave={handleEventSave}
            onApprovalAction={handleApprovalAction}
            onEventClick={ev => log(`Clicked: ${ev.title}`)}
            theme={theme}
            showAddButton={true}
            defaultOrganizeOpen={true}
            categoriesConfig={UNIFIED_CATEGORIES_CONFIG}
            locationProvider={assetLocationProvider}
          />
        </div>
      </div>


      {/* Demo hint: owner password floats below the gear icon */}
      <div style={{
        position: 'fixed', top: 56, right: 12, zIndex: 50,
        fontSize: 10, color: '#94a3b8', pointerEvents: 'none', userSelect: 'none',
      }}>
        pw: <code style={{ background: 'rgba(0,0,0,.06)', padding: '1px 4px', borderRadius: 3 }}>demo1234</code>
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

// @ts-nocheck — demo fixture, re-typed after Phase 2 d.ts regeneration
import { StrictMode, useState, useCallback, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import {
  WorksCalendar,
  DEFAULT_CATEGORIES,
  createManualLocationProvider,
} from '../src/index.ts';
import { saveProfiles } from '../src/core/profileStore';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../src/core/configSchema';
import { loadPools, savePools } from '../src/core/pools/poolStore';
import {
  regions,
  bases,
  assets as EMS_ASSETS,
  crew,
  medicalCrew,
  mechanics,
  dispatchShifts,
  pilotShifts,
  medicalShifts,
  mechanicOnCall,
  maintenanceEvents,
  requests,
  mission,
} from './emsData';

/* ─── Demo identity ─────────────────────────────────────────────── */
// Air EMS demo: new calendar id so the IHC Fleet localStorage doesn't bleed
// through. Returning users see a clean slate with Air EMS defaults.
const DEMO_CALENDAR_ID = 'air-ems-demo';

/* ─── Profiles (saved filter sets in the profile bar) ──────────── */
// Sprint 3 (issue #268 Task 5): seed the 6 required operational saved
// views so the ProfileBar lights up with meaningful chips out of the
// box. The filter/grouping wiring is intentionally light-touch for now
// — each view sets category filters that match its label; the View-tab
// perspective preset does the heavy grouping lifting.
const DEMO_PROFILES = [
  { id: 'p-by-base',        name: 'By Base',              color: '#0ea5e9', filters: { categories: [],              resources: [], search: '' }, view: 'base'     },
  { id: 'p-dispatch-board', name: 'Dispatch Board',       color: '#6366f1', filters: { categories: ['dispatch'],    resources: [], search: '' }, view: 'schedule' },
  { id: 'p-maintenance',    name: 'Maintenance Coverage', color: '#f97316', filters: { categories: ['maintenance'], resources: [], search: '' }, view: 'assets'   },
  { id: 'p-flight-crew',    name: 'Flight Crew',          color: '#3b82f6', filters: { categories: ['shift'],       resources: [], search: '' }, view: 'schedule' },
  { id: 'p-requests',       name: 'Requests',             color: '#10b981', filters: { categories: ['request'],     resources: [], search: '' }, view: 'agenda'   },
  { id: 'p-mission',        name: 'Mission Timeline',     color: '#a855f7', filters: { categories: ['mission'],     resources: [], search: '' }, view: 'schedule' },
];
// Reseed profiles on first load AND when DEMO_SEED_VERSION bumps so
// returning visitors pick up new profile-list changes (like the Sprint 3
// rename from "Full Ops / Pilots / …" to the 6 issue-required views).
const storedProfiles = localStorage.getItem(`wc-profiles-${DEMO_CALENDAR_ID}`);
const storedProfileSeedVer = Number(localStorage.getItem(`wc-demo-profiles-v-${DEMO_CALENDAR_ID}`) ?? 0);
const PROFILES_SEED_VERSION = 2;
if (!storedProfiles || storedProfiles === '[]' || storedProfileSeedVer < PROFILES_SEED_VERSION) {
  saveProfiles(DEMO_CALENDAR_ID, DEMO_PROFILES);
  localStorage.setItem(`wc-demo-profiles-v-${DEMO_CALENDAR_ID}`, String(PROFILES_SEED_VERSION));
}

/* ─── Bases ─────────────────────────────────────────────────────── */
const DEMO_BASES = bases.map(b => ({ id: b.id, name: b.name }));

/* ─── Config seed ───────────────────────────────────────────────── */
// Bumped for the Air EMS identity change. Existing visitors on the IHC seed
// see the new defaults on their next load without a manual storage wipe.
const DEMO_SEED_VERSION = 3;
const SEED_VER_KEY      = `wc-demo-seed-v-${DEMO_CALENDAR_ID}`;
const storedCfg         = localStorage.getItem(`wc-config-${DEMO_CALENDAR_ID}`);
const storedSeedVer     = Number(localStorage.getItem(SEED_VER_KEY) ?? 0);

if (!storedCfg) {
  saveConfig(DEMO_CALENDAR_ID, {
    ...DEFAULT_CONFIG,
    title: 'Air EMS Operations',
    setup: { completed: true, preferredTheme: 'ops-dark' },
    display: { ...DEFAULT_CONFIG.display, defaultView: 'schedule' },
    team: { ...DEFAULT_CONFIG.team, bases: DEMO_BASES },
    approvals: { ...DEFAULT_CONFIG.approvals, enabled: true },
  });
  localStorage.setItem(SEED_VER_KEY, String(DEMO_SEED_VERSION));
} else if (storedSeedVer < DEMO_SEED_VERSION) {
  const existing = loadConfig(DEMO_CALENDAR_ID);
  saveConfig(DEMO_CALENDAR_ID, {
    ...existing,
    title:     existing.title ?? 'Air EMS Operations',
    setup:     { ...existing.setup, preferredTheme: existing.setup?.preferredTheme ?? 'ops-dark' },
    team:      { ...existing.team, bases: existing.team?.bases?.length ? existing.team.bases : DEMO_BASES },
    approvals: { ...existing.approvals, enabled: true },
  });
  localStorage.setItem(SEED_VER_KEY, String(DEMO_SEED_VERSION));
}

const _seedConfig  = loadConfig(DEMO_CALENDAR_ID);
const INITIAL_THEME = _seedConfig.setup?.preferredTheme ?? 'ops-dark';

/* ─── Employees ────────────────────────────────────────────────── */
// Pilots + medical crew + mechanics rendered as the people roster. Each
// gets a role-coded color so the schedule view makes shift type obvious at
// a glance.
const PILOT_COLOR    = '#3b82f6';
const MEDICAL_COLOR  = '#10b981';
const SPECIAL_COLOR  = '#a855f7'; // ECMO specialist
const MECHANIC_COLOR = '#f97316';

const INITIAL_EMPLOYEES = [
  ...crew.map(c => ({
    id:    c.id,
    name:  c.name,
    role:  `Pilot (${c.certifications.join(', ')})`,
    color: PILOT_COLOR,
    base:  c.baseId,
  })),
  ...medicalCrew.map(m => ({
    id:    m.id,
    name:  m.name,
    role:  m.certifications.join(' · '),
    color: m.certifications.includes('ECMO') ? SPECIAL_COLOR : MEDICAL_COLOR,
    base:  m.baseId,
  })),
  ...mechanics.map(m => ({
    id:    m.id,
    name:  m.name,
    role:  'Mechanic',
    color: MECHANIC_COLOR,
    base:  m.baseId,
  })),
];

/* ─── Assets ───────────────────────────────────────────────────── */
// Fleet rows rendered by the Assets view. `group` is the region so the
// assets view can pivot by region; `meta.base` ties into the base column.
const REGION_BY_BASE = Object.fromEntries(bases.map(b => [b.id, regions.find(r => r.id === b.regionId)?.name ?? '']));

const AIRCRAFT_RESOURCES = EMS_ASSETS.map(a => ({
  id:    a.id,
  label: a.name,
  group: REGION_BY_BASE[a.baseId] || 'Fleet',
  meta: {
    sublabel: a.capability.join(' · '),
    model:    a.type === 'helicopter' ? 'Helicopter' : 'Fixed-wing',
    base:     a.baseId,
    status:   a.status,
    location: { text: bases.find(b => b.id === a.baseId)?.name ?? '—', status: 'live', asOf: new Date().toISOString() },
  },
}));

/* ─── Events ───────────────────────────────────────────────────── */
// Convert the Air EMS dataset into WorksCalendar's event shape
// ({ id, title, start, end, category, resource, color }).

const DISPATCH_COLOR    = '#0ea5e9';
const SHIFT_PILOT_COLOR = PILOT_COLOR;
const SHIFT_MED_COLOR   = MEDICAL_COLOR;
const ONCALL_COLOR      = MECHANIC_COLOR;
const MAINT_COLOR       = '#ef4444';
const REQUEST_COLOR     = '#64748b';
const MISSION_COLOR     = '#a855f7';

const DISPATCH_EVENTS = dispatchShifts.map(s => ({
  id: s.id, title: s.title, start: s.start, end: s.end,
  category: 'dispatch', resource: null, color: DISPATCH_COLOR,
}));

const PILOT_SHIFT_EVENTS = pilotShifts.map(s => ({
  id: s.id, title: s.title, start: s.start, end: s.end,
  category: 'shift', resource: s.crewId, color: SHIFT_PILOT_COLOR,
}));

const MEDICAL_SHIFT_EVENTS = medicalShifts.map(s => ({
  id: s.id, title: s.title, start: s.start, end: s.end,
  category: 'shift', resource: s.crewId, color: SHIFT_MED_COLOR,
}));

const ONCALL_EVENTS = mechanicOnCall.map(s => ({
  id: s.id, title: s.title, start: s.start, end: s.end,
  category: 'on-call', resource: s.crewId, color: ONCALL_COLOR, allDay: true,
}));

const MAINT_EVENTS = maintenanceEvents.map(m => ({
  id: m.id, title: m.title, start: m.start, end: m.end,
  category: 'maintenance', resource: m.assetId, color: MAINT_COLOR,
  meta: { approvalStage: { stage: 'approved', updatedAt: m.start } },
}));

const REQUEST_EVENTS = requests.map(r => ({
  id: r.id, title: r.title, start: r.start, end: r.end,
  category: 'request', resource: r.assetId, color: REQUEST_COLOR,
  meta: { approvalStage: { stage: r.status === 'pending' ? 'requested' : 'approved', updatedAt: r.start } },
}));

// Flight legs — rendered on the Jet 1 row so the mission is visible on the
// assets view.  Pilot and medical crew assignments are exposed as additional
// events on the respective people rows for the same leg windows.
const MISSION_LEG_EVENTS = mission.legs.flatMap(leg => {
  const flightTitle = `${mission.name} — ${leg.from} → ${leg.to}`;
  const pilotAssignment   = mission.assignments.pilots.find(a => a.legId === leg.id);
  const medicalAssignment = mission.assignments.medical.find(a => a.legId === leg.id);
  return [
    {
      id: `mission-${leg.id}-jet`,
      title: flightTitle, start: leg.start, end: leg.end,
      category: 'mission', resource: 'a3', color: MISSION_COLOR,
      meta: { sublabel: `Leg ${leg.id}` },
    },
    pilotAssignment && {
      id: `mission-${leg.id}-pilot`,
      title: `Flight: ${leg.from} → ${leg.to}`,
      start: leg.start, end: leg.end,
      category: 'mission', resource: pilotAssignment.crewId, color: MISSION_COLOR,
    },
    medicalAssignment && {
      id: `mission-${leg.id}-medical`,
      title: `Flight: ${leg.from} → ${leg.to}`,
      start: leg.start, end: leg.end,
      category: 'mission', resource: medicalAssignment.crewId, color: MISSION_COLOR,
    },
  ].filter(Boolean);
});

const INITIAL_EVENTS = [
  ...DISPATCH_EVENTS,
  ...PILOT_SHIFT_EVENTS,
  ...MEDICAL_SHIFT_EVENTS,
  ...ONCALL_EVENTS,
  ...MAINT_EVENTS,
  ...REQUEST_EVENTS,
  ...MISSION_LEG_EVENTS,
];

/* ─── Resource pools (#212) ─────────────────────────────────────── */
// Group aircraft by region so bookings can target a pool instead of a tail
// number; the round-robin cursor persists in localStorage.
const DEMO_POOLS_DEFAULT = [
  { id: 'pool-mountain',  name: 'Mountain Fleet',  memberIds: ['a1', 'a3'], strategy: 'round-robin'     },
  { id: 'pool-southwest', name: 'Southwest Fleet', memberIds: [],           strategy: 'first-available' },
];
const _storedPools = loadPools(DEMO_CALENDAR_ID);
if (_storedPools.length === 0) savePools(DEMO_CALENDAR_ID, DEMO_POOLS_DEFAULT);

/* ─── Categories ────────────────────────────────────────────────── */
const UNIFIED_CATEGORIES = [
  // Operations
  { id: 'dispatch',    label: 'Dispatch',    color: DISPATCH_COLOR },
  { id: 'shift',       label: 'Shift',       color: PILOT_COLOR    },
  { id: 'on-call',     label: 'On Call',     color: ONCALL_COLOR   },
  { id: 'mission',     label: 'Mission',     color: MISSION_COLOR  },
  // Fleet
  { id: 'maintenance', label: 'Maintenance', color: MAINT_COLOR    },
  { id: 'request',     label: 'Request',     color: REQUEST_COLOR  },
  { id: 'training',    label: 'Training',    color: '#f59e0b'      },
  ...DEFAULT_CATEGORIES,
];

const UNIFIED_CATEGORIES_CONFIG = {
  categories: UNIFIED_CATEGORIES,
  pillStyle: 'hue',
  defaultCategoryId: 'other',
};

/* ─── Approval state machine (demo) ─────────────────────────────── */
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
    action: actionId, at: now, actor: payload?.actor ?? 'demo-user',
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
  const [pools, setPools] = useState(() => {
    const persisted = loadPools(DEMO_CALENDAR_ID);
    return persisted.length > 0 ? persisted : DEMO_POOLS_DEFAULT;
  });

  const handlePoolsChange = useCallback((next) => {
    setPools(next);
    savePools(DEMO_CALENDAR_ID, next);
  }, []);

  const assetLocationProvider = useMemo(
    () => createManualLocationProvider({ resources: AIRCRAFT_RESOURCES }),
    [],
  );

  const [updateSW] = useState(() =>
    registerSW({
      onNeedRefresh()  { setNeedsRefresh(true); },
      onOfflineReady() { console.info('[PWA] App ready to work offline.'); },
      onRegisteredSW(_swUrl, r) {
        if (!r) return;
        void r.update();
        const check = () => { if (!document.hidden) void r.update(); };
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
      },
    })
  );

  useEffect(() => {
    if (!needsRefresh) return;
    void updateSW(true);
    setNeedsRefresh(false);
  }, [needsRefresh, updateSW]);

  const log = (msg) => setEventLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 8));

  const handleConfigSave = useCallback((cfg) => {
    log('Config saved');
    const newTheme = cfg.setup?.preferredTheme;
    if (newTheme) setTheme(newTheme);
  }, []);

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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#060d1a' }}>
      <div style={{ flex: 1, padding: 0, minHeight: 0 }}>
        <div style={{ height: '100%', width: '100%' }}>
          <WorksCalendar
            events={events}
            employees={employees}
            assets={AIRCRAFT_RESOURCES}
            pools={pools}
            onPoolsChange={handlePoolsChange}
            strictAssetFiltering={true}
            assetRequestCategories={['maintenance', 'request', 'training', 'mission']}
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
            categoriesConfig={UNIFIED_CATEGORIES_CONFIG}
            locationProvider={assetLocationProvider}
            focusChips
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

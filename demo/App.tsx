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
import { buildDefaultFilterSchema } from '../src/filters/filterSchema';
import {
  regions,
  bases,
  assets as EMS_ASSETS,
  crew,
  dispatchers,
  medicalCrew,
  mechanics,
  allEvents,
  mission,
} from './emsData';
import MissionHoverCard, { allRequirementsMet } from './MissionHoverCard';
import missionStyles from './MissionHoverCard.module.css';
import { makeDispatchEvaluator } from './dispatchEvaluator';
import Landing from './Landing';
import {
  DEFAULT_PROFILE_ID,
  findProfile,
  APPROVAL_ACTION_CAP,
} from './profiles';

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
  { id: 'p-by-base',        name: 'By Base',              color: '#0ea5e9', filters: { categories: [],                                                    resources: [], search: '' }, view: 'base'     },
  { id: 'p-dispatch-board', name: 'Dispatch Board',       color: '#6366f1', filters: { categories: ['dispatch-shift'],                                    resources: [], search: '' }, view: 'schedule' },
  { id: 'p-maintenance',    name: 'Maintenance Coverage', color: '#f97316', filters: { categories: ['maintenance'],                                       resources: [], search: '' }, view: 'assets'   },
  { id: 'p-flight-crew',    name: 'Flight Crew',          color: '#3b82f6', filters: { categories: ['pilot-shift', 'medical-shift', 'mechanic-shift'],   resources: [], search: '' }, view: 'schedule' },
  { id: 'p-requests',       name: 'Requests',             color: '#10b981', filters: { categories: ['aircraft-request', 'asset-request'],                resources: [], search: '' }, view: 'agenda'   },
  { id: 'p-mission',        name: 'Mission Timeline',     color: '#a855f7', filters: { categories: ['mission-assignment'],                               resources: [], search: '' }, view: 'schedule' },
];
// Reseed profiles on first load AND when DEMO_SEED_VERSION bumps so
// returning visitors pick up new profile-list changes (like the Sprint 3
// rename from "Full Ops / Pilots / …" to the 6 issue-required views).
const storedProfiles = localStorage.getItem(`wc-profiles-${DEMO_CALENDAR_ID}`);
const storedProfileSeedVer = Number(localStorage.getItem(`wc-demo-profiles-v-${DEMO_CALENDAR_ID}`) ?? 0);
const PROFILES_SEED_VERSION = 3;
if (!storedProfiles || storedProfiles === '[]' || storedProfileSeedVer < PROFILES_SEED_VERSION) {
  saveProfiles(DEMO_CALENDAR_ID, DEMO_PROFILES);
  localStorage.setItem(`wc-demo-profiles-v-${DEMO_CALENDAR_ID}`, String(PROFILES_SEED_VERSION));
}

/* ─── Bases ─────────────────────────────────────────────────────── */
const DEMO_BASES = bases.map(b => ({ id: b.id, name: b.name }));

/* ─── Config seed ───────────────────────────────────────────────── */
// Bumped for the Air EMS identity change. Existing visitors on the IHC seed
// see the new defaults on their next load without a manual storage wipe.
//
// Seed v5 carries two upgrades:
//   1. Force-resync `team.bases` to DEMO_BASES. Earlier versions preserved
//      any non-empty `existing.team.bases`, leaving returning visitors with
//      stale base ids (e.g. IHC-era numeric ids) that no longer matched
//      employee `basedAt` / aircraft `meta.base`. The result was a By-Base
//      view counting 0 people / 0 assets at every base. Bases are demo-
//      controlled identity, not user data, so overwriting them is safe.
//   2. Default view returns to Month. The seed previously hard-coded
//      `defaultView: 'base'`; only the carried-over 'base' choice is reset
//      so any user-picked view is respected.
const DEMO_SEED_VERSION = 6;
const SEED_VER_KEY      = `wc-demo-seed-v-${DEMO_CALENDAR_ID}`;
const storedCfg         = localStorage.getItem(`wc-config-${DEMO_CALENDAR_ID}`);
const storedSeedVer     = Number(localStorage.getItem(SEED_VER_KEY) ?? 0);

if (!storedCfg) {
  saveConfig(DEMO_CALENDAR_ID, {
    ...DEFAULT_CONFIG,
    title: 'Air EMS Operations',
    setup: { completed: true, preferredTheme: 'industrial-light' },
    team: { ...DEFAULT_CONFIG.team, bases: DEMO_BASES },
    approvals: { ...DEFAULT_CONFIG.approvals, enabled: true },
  });
  localStorage.setItem(SEED_VER_KEY, String(DEMO_SEED_VERSION));
} else if (storedSeedVer < DEMO_SEED_VERSION) {
  const existing = loadConfig(DEMO_CALENDAR_ID);
  const carriedDefaultView = existing.display?.defaultView;
  const nextDefaultView = carriedDefaultView === 'base' ? 'month' : carriedDefaultView;
  // Theme migration: pre-v6 demos defaulted to 'ops-dark'. The new default
  // is 'industrial-light' (warmer, friendlier first impression). Replace the
  // old default in place; preserve any other theme the user actively chose.
  const carriedTheme = existing.setup?.preferredTheme;
  const nextTheme = carriedTheme && carriedTheme !== 'ops-dark' ? carriedTheme : 'industrial-light';
  saveConfig(DEMO_CALENDAR_ID, {
    ...existing,
    title:     existing.title ?? 'Air EMS Operations',
    setup:     { ...existing.setup, preferredTheme: nextTheme },
    display:   { ...existing.display, defaultView: nextDefaultView ?? 'month' },
    team:      { ...existing.team, bases: DEMO_BASES },
    approvals: { ...existing.approvals, enabled: true },
  });
  localStorage.setItem(SEED_VER_KEY, String(DEMO_SEED_VERSION));
}

const _seedConfig  = loadConfig(DEMO_CALENDAR_ID);
const INITIAL_THEME = _seedConfig.setup?.preferredTheme ?? 'industrial-light';

/* ─── Employees ────────────────────────────────────────────────── */
// Pilots + medical crew + mechanics rendered as the people roster. Each
// gets a role-coded color so the schedule view makes shift type obvious at
// a glance.
const PILOT_COLOR    = '#3b82f6';
const MEDICAL_COLOR  = '#10b981';
const SPECIAL_COLOR  = '#a855f7'; // ECMO specialist
const MECHANIC_COLOR = '#f97316';
const DISPATCHER_COLOR = '#0ea5e9';

const INITIAL_EMPLOYEES = [
  ...dispatchers.map(d => ({
    id:    d.id,
    name:  d.name,
    role:  `Dispatcher (${d.shiftType})`,
    color: DISPATCHER_COLOR,
    base:  d.basedAt,
  })),
  ...crew.map(c => ({
    id:    c.id,
    name:  c.name,
    role:  `Pilot (${c.certifications.join(', ')})`,
    color: PILOT_COLOR,
    base:  c.basedAt,
  })),
  ...medicalCrew.map(m => ({
    id:    m.id,
    name:  m.name,
    role:  m.certifications.join(' · '),
    color: m.certifications.some(c => c.includes('ECMO')) ? SPECIAL_COLOR : MEDICAL_COLOR,
    base:  m.basedAt,
  })),
  ...mechanics.map(m => ({
    id:    m.id,
    name:  m.name,
    role:  'Mechanic',
    color: MECHANIC_COLOR,
    base:  m.basedAt,
  })),
];

/* ─── Assets ───────────────────────────────────────────────────── */
// Fleet rows rendered by the Assets view. `group` is the region so the
// assets view can pivot by region; `meta.base` ties into the base column.
const REGION_BY_BASE = Object.fromEntries(bases.map(b => [b.id, regions.find(r => r.id === b.regionId)?.name ?? '']));

// Employees eligible for mission slot assignment (pilots + medical)
const MISSION_EMPLOYEES = [...crew, ...medicalCrew];

const AIRCRAFT_RESOURCES = EMS_ASSETS.map(a => ({
  id:    a.id,
  label: a.name,
  group: REGION_BY_BASE[a.basedAt] || 'Fleet',
  meta: {
    sublabel: a.capabilities.join(' · '),
    model:    a.type === 'helicopter' ? 'Helicopter' : 'Fixed-wing',
    base:     a.basedAt,
    status:   a.status,
    location: { text: bases.find(b => b.id === a.basedAt)?.name ?? '—', status: 'live', asOf: new Date().toISOString() },
  },
}));

/* ─── Events ───────────────────────────────────────────────────── */
// Convert the Air EMS dataset into WorksCalendar's event shape
// ({ id, title, start, end, category, resource, color }).

const DISPATCH_COLOR = '#0ea5e9';
const MAINT_COLOR    = '#ef4444';
const REQUEST_COLOR  = '#64748b';
const MISSION_COLOR  = '#a855f7';

function categoryColor(cat) {
  switch (cat) {
    case 'dispatch-shift':   return DISPATCH_COLOR;
    case 'pilot-shift':      return PILOT_COLOR;
    case 'medical-shift':    return MEDICAL_COLOR;
    case 'mechanic-shift':   return MECHANIC_COLOR;
    case 'on-call':          return MECHANIC_COLOR;
    case 'pto':              return '#94a3b8';
    case 'mission-assignment': return MISSION_COLOR;
    case 'maintenance':      return MAINT_COLOR;
    case 'training':         return '#f59e0b';
    case 'aircraft-request': return REQUEST_COLOR;
    case 'asset-request':    return REQUEST_COLOR;
    case 'base-event':       return '#64748b';
    default:                 return '#94a3b8';
  }
}

const APPROVAL_CATS = new Set(['maintenance', 'aircraft-request', 'asset-request']);

// Categories that represent "schedule grain" content — shifts, PTO, on-call.
// The library's viewScope filters these out of Month/Week/Day/Agenda when an
// event sets `meta.kind` to a recognized schedule kind, so the high-level
// views aren't drowned in shift slivers (Schedule and Base tabs cover that
// detail). Map the demo's category-level naming onto the library's kinds.
//
// PTO is intentionally NOT tagged with a kind — `SCHEDULE_WORKFLOW_CATEGORIES`
// already filters it by category, and tagging it `kind: 'shift'` would make
// `isShiftOrOnCallEvent` (Crew-on-shift panel, Timeline shift-status) treat
// people on leave as actively working.
const SHIFT_CATS = new Set([
  'dispatch-shift', 'pilot-shift', 'medical-shift', 'mechanic-shift',
]);
function scheduleKindFor(category) {
  if (SHIFT_CATS.has(category)) return 'shift';
  if (category === 'on-call')    return 'on-call';
  return null;
}

const INITIAL_EVENTS = allEvents.map(e => {
  // Source events (e.g. mission crew assignments in emsData) may already carry
  // their own meta.kind. Don't override it — derive a kind from category only
  // when the source didn't pre-tag the event.
  const sourceMeta = (e as { meta?: Record<string, unknown> }).meta ?? null;
  const kind = (sourceMeta && typeof sourceMeta['kind'] === 'string')
    ? (sourceMeta['kind'] as string)
    : scheduleKindFor(e.category);
  const approvalMeta = APPROVAL_CATS.has(e.category)
    ? { approvalStage: { stage: e.visualPriority === 'high' ? 'requested' : 'approved', updatedAt: e.start } }
    : null;
  const meta = (sourceMeta || kind || approvalMeta)
    ? { ...(sourceMeta ?? {}), ...(kind ? { kind } : {}), ...(approvalMeta ?? {}) }
    : null;
  return {
    id: e.id, title: e.title, start: e.start, end: e.end,
    category: e.category,
    resource: e.assignedTo ?? null,
    color: categoryColor(e.category),
    visualPriority: e.visualPriority,
    ...(e.category === 'on-call' || e.category === 'pto' ? { allDay: true } : {}),
    ...(meta ? { meta } : {}),
  };
});

/* ─── Resource pools (#212) ─────────────────────────────────────── */
// Group aircraft by region so bookings can target a pool instead of a tail
// number; the round-robin cursor persists in localStorage. Resynced on the
// demo seed bump so returning visitors don't keep stale pool names (e.g.
// "Mountain Fleet" / "Southwest Fleet") from earlier demo identities.
const DEMO_POOLS_DEFAULT = [
  { id: 'pool-pnw', name: 'Pacific Northwest Fleet', memberIds: ['ac-n801aw', 'ac-n803lj'], strategy: 'round-robin'     },
  { id: 'pool-rm',  name: 'Rocky Mountain Fleet',   memberIds: ['ac-n804aw', 'ac-n805pc'], strategy: 'first-available' },
];
const _storedPools = loadPools(DEMO_CALENDAR_ID);
if (_storedPools.length === 0 || storedSeedVer < DEMO_SEED_VERSION) {
  savePools(DEMO_CALENDAR_ID, DEMO_POOLS_DEFAULT);
}

/* ─── Categories ────────────────────────────────────────────────── */
const UNIFIED_CATEGORIES = [
  { id: 'dispatch-shift',    label: 'Dispatch',         color: DISPATCH_COLOR },
  { id: 'pilot-shift',       label: 'Pilot Shift',      color: PILOT_COLOR    },
  { id: 'medical-shift',     label: 'Medical Shift',    color: MEDICAL_COLOR  },
  { id: 'mechanic-shift',    label: 'Mechanic Shift',   color: MECHANIC_COLOR },
  { id: 'on-call',           label: 'On Call',          color: MECHANIC_COLOR },
  { id: 'pto',               label: 'PTO',              color: '#94a3b8'      },
  { id: 'mission-assignment', label: 'Mission',         color: MISSION_COLOR  },
  { id: 'maintenance',       label: 'Maintenance',      color: MAINT_COLOR    },
  { id: 'training',          label: 'Training',         color: '#f59e0b'      },
  { id: 'aircraft-request',  label: 'Aircraft Request', color: REQUEST_COLOR  },
  { id: 'asset-request',     label: 'Asset Request',    color: REQUEST_COLOR  },
  { id: 'base-event',        label: 'Base Event',       color: '#64748b'      },
  ...DEFAULT_CATEGORIES,
];

const UNIFIED_CATEGORIES_CONFIG = {
  categories: UNIFIED_CATEGORIES,
  pillStyle: 'hue',
  defaultCategoryId: 'other',
};

/* ─── Cascade scope helpers ─────────────────────────────────────── */
// Lookup maps so the cascade filter predicates can resolve an event's
// region / base / role tier in O(1) — events store the assigned resource id
// (employee or aircraft), not the rolled-up axes the cascade selects on.
const ALL_EMPLOYEES = [...dispatchers, ...crew, ...medicalCrew, ...mechanics];
const EMPLOYEE_BY_ID = new Map(ALL_EMPLOYEES.map(e => [e.id, e]));
const AIRCRAFT_BY_ID = new Map(EMS_ASSETS.map(a => [a.id, a]));
const BASE_REGION_BY_ID = new Map(bases.map(b => [b.id, b.regionId]));

function resolveEventBase(ev) {
  const emp = EMPLOYEE_BY_ID.get(ev.resource);
  if (emp) return emp.basedAt;
  const ac = AIRCRAFT_BY_ID.get(ev.resource);
  if (ac) return ac.basedAt;
  return ev.basedAt ?? null;
}
function resolveEventRegion(ev) {
  const baseId = resolveEventBase(ev);
  return baseId ? BASE_REGION_BY_ID.get(baseId) ?? null : null;
}
function resolveEventType(ev) {
  if (AIRCRAFT_BY_ID.has(ev.resource)) return 'asset';
  const emp = EMPLOYEE_BY_ID.get(ev.resource);
  if (!emp) return null;
  return emp.role === 'dispatcher' ? 'base' : 'crew';
}
function resolveEventSubType(ev) {
  const emp = EMPLOYEE_BY_ID.get(ev.resource);
  if (emp) {
    switch (emp.role) {
      case 'pilot':      return 'pilot';
      case 'rn':
      case 'rt':
      case 'medic':      return 'medical';
      case 'mechanic':   return 'maintenance';
      case 'dispatcher': return 'dispatch';
      default:           return null;
    }
  }
  const ac = AIRCRAFT_BY_ID.get(ev.resource);
  if (ac) return ac.type === 'helicopter' ? 'helicopter' : 'fixed-wing';
  return null;
}
function resolveEventShiftPattern(ev) {
  const emp = EMPLOYEE_BY_ID.get(ev.resource);
  return emp ? emp.shiftType : null;
}
function resolveEventCertifications(ev) {
  const emp = EMPLOYEE_BY_ID.get(ev.resource);
  return emp ? emp.certifications : [];
}

// `multi-select` predicates accept either a Set (engine-side) or a string[]
// (rare host-side path); collapse into a single membership check.
function valueHas(value, key) {
  if (key == null) return false;
  return value instanceof Set ? value.has(key) : Array.isArray(value) && value.includes(key);
}

/* ─── Filter schema ─────────────────────────────────────────────── */
// `buildDefaultFilterSchema` gives us categories / resources / sources /
// dateRange / search. We add region / base / type / subType / shiftPattern /
// certifications so the cascade UI's tier ids round-trip through the engine.
// Category / Resource / Source aren't useful as *grouping* axes for this
// dataset (the cascade owns scoping, the toolbar owns display mode), so we
// flag them ungroupable.
const CASCADE_FIELDS = [
  {
    key:       'region',
    label:     'Region',
    type:      'multi-select',
    operators: ['in', 'not-in'],
    groupable: false,
    predicate: (item, value) => valueHas(value, resolveEventRegion(item)),
    getOptions: () => regions.map(r => ({ value: r.id, label: r.name })),
  },
  {
    key:       'base',
    label:     'Base',
    type:      'multi-select',
    operators: ['in', 'not-in'],
    groupable: false,
    predicate: (item, value) => valueHas(value, resolveEventBase(item)),
    getOptions: () => bases.map(b => ({ value: b.id, label: b.name })),
  },
  {
    key:       'type',
    label:     'Type',
    type:      'multi-select',
    operators: ['in', 'not-in'],
    groupable: false,
    predicate: (item, value) => valueHas(value, resolveEventType(item)),
    getOptions: () => [
      { value: 'crew',  label: 'Crew'  },
      { value: 'base',  label: 'Base'  },
      { value: 'asset', label: 'Asset' },
    ],
  },
  {
    key:       'subType',
    label:     'Sub-type',
    type:      'multi-select',
    operators: ['in', 'not-in'],
    groupable: false,
    predicate: (item, value) => valueHas(value, resolveEventSubType(item)),
    getOptions: () => [
      { value: 'pilot',       label: 'Pilot'       },
      { value: 'medical',     label: 'Medical'     },
      { value: 'maintenance', label: 'Maintenance' },
      { value: 'dispatch',    label: 'Dispatch'    },
      { value: 'helicopter',  label: 'Helicopter'  },
      { value: 'fixed-wing',  label: 'Fixed-wing'  },
    ],
  },
  {
    key:       'shiftPattern',
    label:     'Shift pattern',
    type:      'multi-select',
    operators: ['in', 'not-in'],
    groupable: false,
    predicate: (item, value) => valueHas(value, resolveEventShiftPattern(item)),
    getOptions: () => [
      { value: 'day',     label: 'Day'     },
      { value: 'night',   label: 'Night'   },
      { value: 'on-call', label: 'On call' },
    ],
  },
  {
    key:       'certifications',
    label:     'Certifications',
    type:      'multi-select',
    operators: ['in', 'not-in'],
    groupable: false,
    predicate: (item, value) => {
      const certs = resolveEventCertifications(item);
      if (!certs || certs.length === 0) return false;
      if (value instanceof Set) return certs.some(c => value.has(c));
      return Array.isArray(value) && certs.some(c => value.includes(c));
    },
    getOptions: () => {
      const seen = new Set();
      ALL_EMPLOYEES.forEach(e => e.certifications.forEach(c => seen.add(c)));
      return [...seen].sort().map(c => ({ value: c, label: c }));
    },
  },
];

const DEMO_FILTER_SCHEMA = [
  ...buildDefaultFilterSchema({
    employees: INITIAL_EMPLOYEES,
    assets:    AIRCRAFT_RESOURCES,
  }).map(f => (
    f.key === 'categories' || f.key === 'resources' || f.key === 'sources'
      ? { ...f, groupable: false }
      : f
  )),
  ...CASCADE_FIELDS,
];

/* ─── Cascade config ────────────────────────────────────────────── */
// Tier ids match the filter-schema field keys above so the cascade UI's
// selections round-trip through the engine without translation.
const SUBTYPE_BY_TYPE = {
  crew:  ['pilot', 'medical', 'maintenance'],
  base:  ['dispatch'],
  asset: ['helicopter', 'fixed-wing'],
};

const SUBTYPE_LABELS = {
  pilot:       'Pilot',
  medical:     'Medical',
  maintenance: 'Maintenance',
  dispatch:    'Dispatch',
  helicopter:  'Helicopter',
  'fixed-wing':'Fixed-wing',
};

const DEMO_CASCADE_CONFIG = {
  tiers: [
    {
      id:          'region',
      label:       'Region',
      filterField: 'region',
      hint:        'multi-select',
      getOptions: () => regions.map(r => ({ value: r.id, label: r.name })),
    },
    {
      id:          'base',
      label:       'Base',
      filterField: 'base',
      hint:        'pruned by Region',
      getOptions: (sel) => {
        const regionFilter = sel.region ?? [];
        return bases
          .filter(b => regionFilter.length === 0 || regionFilter.includes(b.regionId))
          .map(b => ({ value: b.id, label: b.name }));
      },
    },
    {
      id:          'type',
      label:       'Type',
      filterField: 'type',
      getOptions: () => [
        { value: 'crew',  label: 'Crew'  },
        { value: 'base',  label: 'Base'  },
        { value: 'asset', label: 'Asset' },
      ],
    },
    {
      id:          'subType',
      label:       'Sub-type',
      filterField: 'subType',
      hint:        'pruned by Type',
      getOptions: (sel) => {
        const typeFilter = sel.type ?? [];
        const allowed = typeFilter.length === 0
          ? Object.values(SUBTYPE_BY_TYPE).flat()
          : typeFilter.flatMap(t => SUBTYPE_BY_TYPE[t] ?? []);
        return allowed.map(v => ({ value: v, label: SUBTYPE_LABELS[v] ?? v }));
      },
    },
  ],
  moreOptions: [
    {
      id:          'shiftPattern',
      label:       'Shift pattern',
      filterField: 'shiftPattern',
      getOptions: () => [
        { value: 'day',     label: 'Day'     },
        { value: 'night',   label: 'Night'   },
        { value: 'on-call', label: 'On call' },
      ],
    },
    {
      id:          'certifications',
      label:       'Certifications',
      filterField: 'certifications',
      hint:        'matches if any selected cert is held',
      getOptions: () => {
        const seen = new Set();
        ALL_EMPLOYEES.forEach(e => e.certifications.forEach(c => seen.add(c)));
        return [...seen].sort().map(c => ({ value: c, label: c }));
      },
    },
  ],
  moreOptionsLabel: 'More options',
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
// `?embed=1` skips the marketing chrome and renders the calendar
// full-bleed. e2e tests and any page that wants to embed the demo as
// a raw calendar use this flag; the default `/` route shows the
// framed Landing layout.
const EMBED_MODE =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('embed');

function App() {
  const [events,            setEvents]            = useState(INITIAL_EVENTS);
  const [notes,             setNotes]             = useState({});
  const [theme,             setTheme]             = useState(INITIAL_THEME);
  const [employees,         setEmployees]         = useState(INITIAL_EMPLOYEES);
  const [eventLog,          setEventLog]          = useState([]);
  const [needsRefresh,      setNeedsRefresh]      = useState(false);
  const [missionAssignments, setMissionAssignments] = useState({
    ...mission.assignments,
    aircraft: null, // starts unassigned so the pulsing badge is visible on load
  });
  const [missionOpen,       setMissionOpen]       = useState(false);
  const [activeProfileId,   setActiveProfileId]   = useState(DEFAULT_PROFILE_ID);
  const activeProfile = useMemo(() => findProfile(activeProfileId), [activeProfileId]);
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

  // ── Dispatch view wiring ────────────────────────────────────────
  // The library's DispatchView is generic — it knows nothing about
  // pilots, certs, aircraft hours, etc. Air EMS specifics live in
  // ./dispatchEvaluator and feed in via these two props.
  const dispatchMissions = useMemo(() => ([
    { id: mission.id, label: mission.title, sublabel: 'Pending — needs aircraft' },
  ]), []);

  const dispatchEvaluator = useMemo(() => {
    const missionsById = { [mission.id]: mission };
    // isBookedAt — quick scan of the live event store. Events without a
    // resource binding (base-wide events) don't lock individual crew.
    const isBookedAt = (resourceId, at) => {
      const t = at.getTime();
      for (const ev of events) {
        if (ev?.resource == null) continue;
        if (String(ev.resource) !== resourceId) continue;
        const s = new Date(ev.start).getTime();
        const e = new Date(ev.end).getTime();
        if (s <= t && e >= t) return true;
      }
      return false;
    };
    return makeDispatchEvaluator({
      aircraft: EMS_ASSETS,
      pilots: crew,
      medicalCrew,
      missionsById,
      isBookedAt,
    });
  }, [events]);

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
    // Profile-driven gating: each role has a capability matrix in
    // demo/profiles.ts. A dispatcher can request but not approve; an
    // ops manager can finalize and revoke; etc. Block actions the
    // active role can't perform — that's how the profile switcher
    // demos the approval hierarchy.
    const capKey = APPROVAL_ACTION_CAP[actionId];
    if (capKey && !activeProfile.approval[capKey]) {
      log(`Blocked: ${activeProfile.role} cannot ${actionId} this request`);
      return;
    }
    const nextStage = nextStageFor(event?.meta?.approvalStage?.stage ?? 'requested', actionId);
    if (!nextStage) {
      log(`Approval: ${actionId} not allowed from ${event?.meta?.approvalStage?.stage ?? 'requested'}`);
      return;
    }
    setEvents(prev => prev.map(e => e.id === event.id ? applyApprovalTransition(e, actionId, payload) : e));
    log(`Approval: ${event.title} → ${nextStage} (as ${activeProfile.role})`);
  }, [activeProfile]);

  const handleEventClick = useCallback((ev) => {
    log(`Clicked: ${ev.title}`);
    if (ev.category === 'mission-assignment' || ev.category === 'aircraft-request') {
      setMissionOpen(true);
    }
  }, []);

  // Appends pulsing "REQS UNMET" badge to mission pills when not fully staffed
  const renderEvent = useCallback((ev) => {
    if (ev.category !== 'mission-assignment' && ev.category !== 'aircraft-request') return null;
    if (allRequirementsMet(missionAssignments, mission, EMS_ASSETS)) return null;
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', width: '100%' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {ev.title}
        </span>
        <span className={missionStyles.unmetBadge}>REQS UNMET</span>
      </span>
    );
  }, [missionAssignments]);

  const calendar = (
    <WorksCalendar
      events={events}
      employees={employees}
      assets={AIRCRAFT_RESOURCES}
      pools={pools}
      onPoolsChange={handlePoolsChange}
      strictAssetFiltering={true}
      assetRequestCategories={['maintenance', 'aircraft-request', 'asset-request', 'training', 'mission-assignment']}
      onEmployeeAdd={handleEmployeeAdd}
      onEmployeeDelete={handleEmployeeDelete}
      calendarId={DEMO_CALENDAR_ID}
      ownerPassword="demo1234"
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
      onEventClick={handleEventClick}
      renderEvent={renderEvent}
      theme={theme}
      showAddButton={true}
      categoriesConfig={UNIFIED_CATEGORIES_CONFIG}
      locationProvider={assetLocationProvider}
      filterSchema={DEMO_FILTER_SCHEMA}
      cascadeConfig={DEMO_CASCADE_CONFIG}
      role={activeProfile.permissionRole}
      dispatchMissions={dispatchMissions}
      dispatchEvaluator={dispatchEvaluator}
    />
  );

  return (
    <>
      {EMBED_MODE ? (
        <div style={{ height: '100vh', width: '100vw' }}>{calendar}</div>
      ) : (
        <Landing
          activeProfile={activeProfile}
          onProfileChange={setActiveProfileId}
          events={events}
        >
          {calendar}
        </Landing>
      )}

      {missionOpen && (
        <MissionHoverCard
          mission={mission}
          assignments={missionAssignments}
          employees={MISSION_EMPLOYEES}
          aircraft={EMS_ASSETS}
          onAssignmentChange={setMissionAssignments}
          onClose={() => setMissionOpen(false)}
        />
      )}

      {needsRefresh && (
        <UpdateToast
          onUpdate={() => { updateSW(true); setNeedsRefresh(false); }}
          onDismiss={() => setNeedsRefresh(false)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);

import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
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

import type {
  ApprovalActionPayload,
  ApprovalStage,
  DemoAssetResource,
  DemoCategory,
  DemoEmployee,
  DemoEvent,
  DemoNote,
  DemoNotesMap,
  DemoPool,
  DemoProfile,
} from './types';

import {
  regions,
  bases,
  assets as emsAssets,
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

/* ────────────────────────────────────────────────────────────── */
/* Demo identity                                                 */
/* ────────────────────────────────────────────────────────────── */

const DEMO_CALENDAR_ID = 'air-ems-demo';

/* ────────────────────────────────────────────────────────────── */
/* Profiles                                                      */
/* ────────────────────────────────────────────────────────────── */

const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'p-by-base',
    name: 'By Base',
    color: '#0ea5e9',
    filters: { categories: [], resources: [], search: '' },
    view: 'base',
  },
  {
    id: 'p-dispatch-board',
    name: 'Dispatch Board',
    color: '#6366f1',
    filters: { categories: ['dispatch'], resources: [], search: '' },
    view: 'schedule',
  },
  {
    id: 'p-maintenance',
    name: 'Maintenance Coverage',
    color: '#f97316',
    filters: { categories: ['maintenance'], resources: [], search: '' },
    view: 'assets',
  },
  {
    id: 'p-flight-crew',
    name: 'Flight Crew',
    color: '#3b82f6',
    filters: { categories: ['shift'], resources: [], search: '' },
    view: 'schedule',
  },
  {
    id: 'p-requests',
    name: 'Requests',
    color: '#10b981',
    filters: { categories: ['request'], resources: [], search: '' },
    view: 'agenda',
  },
  {
    id: 'p-mission',
    name: 'Mission Timeline',
    color: '#a855f7',
    filters: { categories: ['mission'], resources: [], search: '' },
    view: 'schedule',
  },
];

const storedProfiles = localStorage.getItem(`wc-profiles-${DEMO_CALENDAR_ID}`);
const storedProfileSeedVer = Number(
  localStorage.getItem(`wc-demo-profiles-v-${DEMO_CALENDAR_ID}`) ?? 0
);
const PROFILES_SEED_VERSION = 2;

if (!storedProfiles || storedProfiles === '[]' || storedProfileSeedVer < PROFILES_SEED_VERSION) {
  saveProfiles(DEMO_CALENDAR_ID, DEMO_PROFILES);
  localStorage.setItem(
    `wc-demo-profiles-v-${DEMO_CALENDAR_ID}`,
    String(PROFILES_SEED_VERSION)
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Config seed                                                   */
/* ────────────────────────────────────────────────────────────── */

const DEMO_BASES: Array<{ id: string; name: string }> = bases.map((base) => ({
  id: base.id,
  name: base.name,
}));

const DEMO_SEED_VERSION = 3;
const SEED_VER_KEY = `wc-demo-seed-v-${DEMO_CALENDAR_ID}`;
const storedCfg = localStorage.getItem(`wc-config-${DEMO_CALENDAR_ID}`);
const storedSeedVer = Number(localStorage.getItem(SEED_VER_KEY) ?? 0);

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
    title: existing.title ?? 'Air EMS Operations',
    setup: {
      ...existing.setup,
      preferredTheme: existing.setup?.preferredTheme ?? 'ops-dark',
    },
    team: {
      ...existing.team,
      bases: existing.team?.bases?.length ? existing.team.bases : DEMO_BASES,
    },
    approvals: { ...existing.approvals, enabled: true },
  });
  localStorage.setItem(SEED_VER_KEY, String(DEMO_SEED_VERSION));
}

const seededConfig = loadConfig(DEMO_CALENDAR_ID);
const INITIAL_THEME = seededConfig.setup?.preferredTheme ?? 'ops-dark';

/* ────────────────────────────────────────────────────────────── */
/* Employees                                                     */
/* ────────────────────────────────────────────────────────────── */

const PILOT_COLOR = '#3b82f6';
const MEDICAL_COLOR = '#10b981';
const SPECIAL_COLOR = '#a855f7';
const MECHANIC_COLOR = '#f97316';

const INITIAL_EMPLOYEES: DemoEmployee[] = [
  ...crew.map((person) => ({
    id: person.id,
    name: person.name,
    role: `Pilot (${person.certifications.join(', ')})`,
    color: PILOT_COLOR,
    base: person.baseId,
  })),
  ...medicalCrew.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.certifications.join(' · '),
    color: person.certifications.includes('ECMO') ? SPECIAL_COLOR : MEDICAL_COLOR,
    base: person.baseId,
  })),
  ...mechanics.map((person) => ({
    id: person.id,
    name: person.name,
    role: 'Mechanic',
    color: MECHANIC_COLOR,
    base: person.baseId,
  })),
];

/* ────────────────────────────────────────────────────────────── */
/* Assets                                                        */
/* ────────────────────────────────────────────────────────────── */

const REGION_BY_BASE: Record<string, string> = Object.fromEntries(
  bases.map((base) => [base.id, regions.find((region) => region.id === base.regionId)?.name ?? ''])
);

const AIRCRAFT_RESOURCES: DemoAssetResource[] = emsAssets.map((asset) => ({
  id: asset.id,
  label: asset.name,
  group: REGION_BY_BASE[asset.baseId] || 'Fleet',
  meta: {
    sublabel: asset.capability.join(' · '),
    model: asset.type === 'helicopter' ? 'Helicopter' : 'Fixed-wing',
    base: asset.baseId,
    status: asset.status,
    location: {
      text: bases.find((base) => base.id === asset.baseId)?.name ?? '—',
      status: 'live',
      asOf: new Date().toISOString(),
    },
  },
}));

/* ────────────────────────────────────────────────────────────── */
/* Events                                                        */
/* ────────────────────────────────────────────────────────────── */

const DISPATCH_COLOR = '#0ea5e9';
const SHIFT_PILOT_COLOR = PILOT_COLOR;
const SHIFT_MEDICAL_COLOR = MEDICAL_COLOR;
const ONCALL_COLOR = MECHANIC_COLOR;
const MAINT_COLOR = '#ef4444';
const REQUEST_COLOR = '#64748b';
const MISSION_COLOR = '#a855f7';

const DISPATCH_EVENTS: DemoEvent[] = dispatchShifts.map((shift) => ({
  id: shift.id,
  title: shift.title,
  start: shift.start,
  end: shift.end,
  category: 'dispatch',
  resource: null as string | null | undefined,
  color: DISPATCH_COLOR,
}));

const PILOT_SHIFT_EVENTS: DemoEvent[] = pilotShifts.map((shift) => ({
  id: shift.id,
  title: shift.title,
  start: shift.start,
  end: shift.end,
  category: 'shift',
  resource: shift.crewId ?? null,
  color: SHIFT_PILOT_COLOR,
}));

const MEDICAL_SHIFT_EVENTS: DemoEvent[] = medicalShifts.map((shift) => ({
  id: shift.id,
  title: shift.title,
  start: shift.start,
  end: shift.end,
  category: 'shift',
  resource: shift.crewId ?? null,
  color: SHIFT_MEDICAL_COLOR,
}));

const ONCALL_EVENTS: DemoEvent[] = mechanicOnCall.map((shift) => ({
  id: shift.id,
  title: shift.title,
  start: shift.start,
  end: shift.end,
  category: 'on-call',
  resource: shift.crewId ?? null,
  color: ONCALL_COLOR,
  allDay: true,
}));

const MAINT_EVENTS: DemoEvent[] = maintenanceEvents.map((event) => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  category: 'maintenance',
  resource: event.assetId,
  color: MAINT_COLOR,
  meta: {
    approvalStage: {
      stage: 'approved',
      updatedAt: event.start,
    },
  },
}));

const REQUEST_EVENTS: DemoEvent[] = requests.map((event) => ({
  id: event.id,
  title: event.title,
  start: event.start,
  end: event.end,
  category: 'request',
  resource: event.assetId,
  color: REQUEST_COLOR,
  meta: {
    approvalStage: {
      stage: event.status === 'pending' ? 'requested' : 'approved',
      updatedAt: event.start,
    },
  },
}));

const MISSION_LEG_EVENTS: DemoEvent[] = mission.legs.flatMap((leg: any) => {
  const flightTitle = `${mission.name} — ${leg.from} → ${leg.to}`;
  const pilotAssignment = mission.assignments.pilots.find((assignment: any) => assignment.legId === leg.id);
  const medicalAssignment = mission.assignments.medical.find((assignment: any) => assignment.legId === leg.id);

  const nextEvents: DemoEvent[] = [
    {
      id: `mission-${leg.id}-jet`,
      title: flightTitle,
      start: leg.start,
      end: leg.end,
      category: 'mission',
      resource: 'a3',
      color: MISSION_COLOR,
      meta: {
        sublabel: `Leg ${leg.id}`,
      },
    },
  ];

  if (pilotAssignment) {
    nextEvents.push({
      id: `mission-${leg.id}-pilot`,
      title: 'Assigned to Jet Trip',
      start: leg.start,
      end: leg.end,
      category: 'mission',
      resource: pilotAssignment.crewId,
      color: MISSION_COLOR,
    });
  }

  if (medicalAssignment) {
    nextEvents.push({
      id: `mission-${leg.id}-medical`,
      title: 'Assigned to Jet Trip',
      start: leg.start,
      end: leg.end,
      category: 'mission',
      resource: medicalAssignment.crewId,
      color: MISSION_COLOR,
    });
  }

  return nextEvents;
});

const INITIAL_EVENTS: DemoEvent[] = [
  ...DISPATCH_EVENTS,
  ...PILOT_SHIFT_EVENTS,
  ...MEDICAL_SHIFT_EVENTS,
  ...ONCALL_EVENTS,
  ...MAINT_EVENTS,
  ...REQUEST_EVENTS,
  ...MISSION_LEG_EVENTS,
];

/* ────────────────────────────────────────────────────────────── */
/* Pools                                                         */
/* ────────────────────────────────────────────────────────────── */

const DEMO_POOLS_DEFAULT: DemoPool[] = [
  {
    id: 'pool-mountain',
    name: 'Mountain Fleet',
    memberIds: ['a1', 'a3'],
    strategy: 'round-robin',
  },
  {
    id: 'pool-southwest',
    name: 'Southwest Fleet',
    memberIds: [],
    strategy: 'first-available',
  },
];

const existingPools = loadPools(DEMO_CALENDAR_ID) as DemoPool[];
if (existingPools.length === 0) {
  savePools(DEMO_CALENDAR_ID, DEMO_POOLS_DEFAULT);
}

/* ────────────────────────────────────────────────────────────── */
/* Categories                                                    */
/* ────────────────────────────────────────────────────────────── */

const UNIFIED_CATEGORIES: DemoCategory[] = [
  { id: 'dispatch', label: 'Dispatch', color: DISPATCH_COLOR },
  { id: 'shift', label: 'Shift', color: PILOT_COLOR },
  { id: 'on-call', label: 'On Call', color: ONCALL_COLOR },
  { id: 'mission', label: 'Mission', color: MISSION_COLOR },
  { id: 'maintenance', label: 'Maintenance', color: MAINT_COLOR },
  { id: 'request', label: 'Request', color: REQUEST_COLOR },
  { id: 'training', label: 'Training', color: '#f59e0b' },
  ...DEFAULT_CATEGORIES,
];

const UNIFIED_CATEGORIES_CONFIG = {
  categories: UNIFIED_CATEGORIES,
  pillStyle: 'hue' as const,
  defaultCategoryId: 'other',
};

/* ────────────────────────────────────────────────────────────── */
/* Approvals                                                     */
/* ────────────────────────────────────────────────────────────── */

type ConfigLike = {
  setup?: {
    preferredTheme?: string;
  };
};

function nextStageFor(currentStage: ApprovalStage, actionId: string): ApprovalStage | null {
  switch (actionId) {
    case 'approve':
      return currentStage === 'pending_higher' ? 'finalized' : 'approved';
    case 'deny':
      return 'denied';
    case 'finalize':
      return 'finalized';
    case 'revoke':
      return currentStage === 'finalized' ? 'approved' : 'requested';
    default:
      return null;
  }
}

function applyApprovalTransition(
  event: DemoEvent,
  actionId: string,
  payload?: ApprovalActionPayload
): DemoEvent {
  const stage = event.meta?.approvalStage;
  const currentStage: ApprovalStage = stage?.stage ?? 'requested';
  const nextStage = nextStageFor(currentStage, actionId);

  if (!nextStage) {
    return event;
  }

  const now = new Date().toISOString();

  return {
    ...event,
    meta: {
      ...(event.meta ?? {}),
      approvalStage: {
        stage: nextStage,
        updatedAt: now,
        history: [
          ...(stage?.history ?? []),
          {
            action: actionId,
            at: now,
            actor: payload?.actor ?? 'demo-user',
            ...(payload?.tier !== undefined ? { tier: payload.tier } : {}),
            ...(payload?.reason !== undefined ? { reason: payload.reason } : {}),
          },
        ],
      },
    },
  };
}

/* ────────────────────────────────────────────────────────────── */
/* PWA update toast                                              */
/* ────────────────────────────────────────────────────────────── */

function UpdateToast(props: { onUpdate: () => void; onDismiss: () => void }) {
  const { onUpdate, onDismiss } = props;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1e293b',
        color: '#f1f5f9',
        borderRadius: 10,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,.35)',
        zIndex: 9999,
        fontSize: 13,
        border: '1px solid #334155',
      }}
    >
      <span>A new version is available.</span>
      <button
        onClick={onUpdate}
        style={{
          background: '#4f46e5',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '4px 12px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Update
      </button>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          color: '#94a3b8',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: '0 2px',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* App                                                           */
/* ────────────────────────────────────────────────────────────── */

function App() {
  const [events, setEvents] = useState<DemoEvent[]>(INITIAL_EVENTS);
  const [notes, setNotes] = useState<DemoNotesMap>({});
  const [theme, setTheme] = useState<string>(INITIAL_THEME);
  const [employees, setEmployees] = useState<DemoEmployee[]>(INITIAL_EMPLOYEES);
  const [needsRefresh, setNeedsRefresh] = useState<boolean>(false);

  const [pools, setPools] = useState<DemoPool[]>(() => {
    const persisted = loadPools(DEMO_CALENDAR_ID) as DemoPool[];
    return persisted.length > 0 ? persisted : DEMO_POOLS_DEFAULT;
  });

  const handlePoolsChange = useCallback((next: DemoPool[]) => {
    setPools(next);
    savePools(DEMO_CALENDAR_ID, next);
  }, []);

  const assetLocationProvider = useMemo(
    () => createManualLocationProvider({ resources: AIRCRAFT_RESOURCES }),
    []
  );

  const [updateSW] = useState(() =>
    registerSW({
      onNeedRefresh() {
        setNeedsRefresh(true);
      },
      onOfflineReady() {
        console.info('[PWA] App ready to work offline.');
      },
      onRegisteredSW(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
        if (!registration) return;

        void registration.update();

        const check = (): void => {
          if (!document.hidden) {
            void registration.update();
          }
        };

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

  const log = useCallback((message: string) => {
    console.info(`[demo] ${message}`);
  }, []);

  const handleConfigSave = useCallback((cfg: ConfigLike) => {
    log('Config saved');
    const nextTheme = cfg.setup?.preferredTheme;
    if (nextTheme) {
      setTheme(nextTheme);
    }
  }, [log]);

  const handleEventSave = useCallback((event: DemoEvent) => {
    setEvents((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === event.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = event;
        return next;
      }
      return [...prev, event];
    });

    log(`Saved: ${event.title}`);
  }, [log]);

  const handleEventDelete = useCallback((id: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    log(`Deleted: ${id}`);
  }, [log]);

  const handleNoteSave = useCallback((note: DemoNote) => {
    setNotes((prev: DemoNotesMap) => ({
      ...prev,
      [note.eventId]: {
        id: `note-${note.eventId}`,
        ...note,
      },
    }));

    log(`Note saved for ${note.eventId}`);
  }, [log]);

  const handleNoteDelete = useCallback((noteId: string) => {
    setNotes((prev: DemoNotesMap) => {
      const next = { ...prev };
      const key = Object.keys(next).find((candidate) => next[candidate]?.id === noteId);

      if (key) {
        delete next[key];
      }

      return next;
    });

    log(`Note deleted: ${noteId}`);
  }, [log]);

  const handleEmployeeAdd = useCallback((employee: DemoEmployee) => {
    setEmployees((prev) => [...prev, employee]);
    log(`Added employee: ${employee.name}`);
  }, [log]);

  const handleEmployeeDelete = useCallback((id: string) => {
    setEmployees((prev) => prev.filter((employee) => employee.id !== id));
    log(`Removed employee: ${id}`);
  }, [log]);

  const handleApprovalAction = useCallback(
    (event: DemoEvent, actionId: string, payload?: ApprovalActionPayload) => {
      const nextStage = nextStageFor(
        event.meta?.approvalStage?.stage ?? 'requested',
        actionId
      );

      if (!nextStage) {
        log(
          `Approval: ${actionId} not allowed from ${
            event.meta?.approvalStage?.stage ?? 'requested'
          }`
        );
        return;
      }

      setEvents((prev) =>
        prev.map((item) =>
          item.id === event.id ? applyApprovalTransition(item, actionId, payload) : item
        )
      );

      log(`Approval: ${event.title} → ${nextStage}`);
    },
    [log]
  );

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#060d1a',
      }}
    >
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
            showSetupLanding={true}
            onConfigSave={handleConfigSave}
            notes={notes}
            onNoteSave={handleNoteSave}
            onNoteDelete={handleNoteDelete}
            onEventSave={handleEventSave}
            onEventDelete={handleEventDelete}
            onScheduleSave={handleEventSave}
            onAvailabilitySave={handleEventSave}
            onApprovalAction={handleApprovalAction}
            onEventClick={(event: DemoEvent) => log(`Clicked: ${event.title}`)}
            theme={theme}
            showAddButton={true}
            categoriesConfig={UNIFIED_CATEGORIES_CONFIG}
            locationProvider={assetLocationProvider}
          />
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          top: 56,
          right: 12,
          zIndex: 50,
          fontSize: 10,
          color: '#94a3b8',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        pw:{' '}
        <code
          style={{
            background: 'rgba(0,0,0,.06)',
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          demo1234
        </code>
      </div>

      {needsRefresh && (
        <UpdateToast
          onUpdate={() => {
            updateSW(true);
            setNeedsRefresh(false);
          }}
          onDismiss={() => setNeedsRefresh(false)}
        />
      )}
    </div>
  );
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root was not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

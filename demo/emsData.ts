/**
 * demo/emsData.ts — Air EMS operational demo dataset.
 *
 * Pacific Northwest + Rocky Mountain regions, 5 bases, 6 aircraft,
 * 4 staffing layers (dispatch / pilots / medical / mechanics), on-call
 * rotation, maintenance, training, aircraft requests, and one international
 * critical-care transfer mission (São Paulo → Munich, 4 legs).
 *
 * All datetimes are local-time ISO-8601 strings anchored to the week of
 * 2026-04-20 (Mon). All records are plain objects — no Date, Map, Set, or
 * class instances.
 */

import type { DemoRegion, DemoBase, DemoAircraft } from './types';

// ── Geography ─────────────────────────────────────────────────────────────────

export const regions: DemoRegion[] = [
  { id: 'r-pnw', name: 'Pacific Northwest' },
  { id: 'r-rm',  name: 'Rocky Mountain'   },
];

export const bases: DemoBase[] = [
  { id: 'b-seattle',  name: 'Seattle (Hub)',  regionId: 'r-pnw' },
  { id: 'b-portland', name: 'Portland',       regionId: 'r-pnw' },
  { id: 'b-denver',   name: 'Denver (Hub)',   regionId: 'r-rm'  },
  { id: 'b-slc',      name: 'Salt Lake City', regionId: 'r-rm'  },
  { id: 'b-bozeman',  name: 'Bozeman',        regionId: 'r-rm'  },
];

// ── Fleet ─────────────────────────────────────────────────────────────────────

export const aircraft: DemoAircraft[] = [
  {
    id: 'ac-n801aw', tail: 'N801AW', name: 'AW139 N801AW',
    type: 'helicopter', hoursRemaining: 45, basedAt: 'b-seattle',
    capabilities: ['IFR', 'Night', 'NICU', 'Vent', 'Isolette'],
    status: 'available',
  },
  {
    id: 'ac-n802ec', tail: 'N802EC', name: 'EC135 N802EC',
    type: 'helicopter', hoursRemaining: 62, basedAt: 'b-portland',
    capabilities: ['IFR', 'Night', 'Rotor'],
    status: 'available',
  },
  {
    id: 'ac-n803lj', tail: 'N803LJ', name: 'Learjet 45 N803LJ',
    type: 'fixed-wing', hoursRemaining: 38, basedAt: 'b-seattle',
    capabilities: ['IFR', 'International', 'Critical Care', 'Long-Range'],
    status: 'assigned',
  },
  {
    id: 'ac-n804aw', tail: 'N804AW', name: 'AW139 N804AW',
    type: 'helicopter', hoursRemaining: 51, basedAt: 'b-denver',
    capabilities: ['IFR', 'Night', 'NICU', 'Vent'],
    status: 'available',
  },
  {
    id: 'ac-n805pc', tail: 'N805PC', name: 'PC-12 N805PC',
    type: 'fixed-wing', hoursRemaining: 77, basedAt: 'b-slc',
    capabilities: ['IFR', 'Fixed-Wing', 'Mountain Ops'],
    status: 'available',
  },
  {
    id: 'ac-n806ec', tail: 'N806EC', name: 'EC135 N806EC',
    type: 'helicopter', hoursRemaining: 12, basedAt: 'b-bozeman',
    capabilities: ['VFR', 'Rotor'],
    status: 'maintenance',
  },
];

/** Backward-compat alias used by App.tsx. */
export const assets = aircraft;

import type { DemoEmployee } from './types';

// ── Personnel ─────────────────────────────────────────────────────────────────

export const dispatchers: DemoEmployee[] = [
  { id: 'emp-marcus', name: 'Marcus Chen',   role: 'dispatcher', certifications: [], shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-seattle'  },
  { id: 'emp-diane',  name: 'Diane Foster',  role: 'dispatcher', certifications: [], shiftType: 'night',  dutyStatus: 'on-duty',  basedAt: 'b-seattle'  },
  { id: 'emp-ryan',   name: 'Ryan Park',     role: 'dispatcher', certifications: [], shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-portland' },
  { id: 'emp-lisa',   name: 'Lisa Morales',  role: 'dispatcher', certifications: [], shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-denver'   },
  { id: 'emp-tom',    name: 'Tom Gaines',    role: 'dispatcher', certifications: [], shiftType: 'night',  dutyStatus: 'on-duty',  basedAt: 'b-denver'   },
  { id: 'emp-ana',    name: 'Ana Reeves',    role: 'dispatcher', certifications: [], shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-slc'      },
];

export const pilots: DemoEmployee[] = [
  { id: 'emp-james',  name: 'Capt. James Wright',  role: 'pilot', certifications: ['IFR', 'International', 'Fixed-Wing'], shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-seattle'  },
  { id: 'emp-priya',  name: 'Capt. Priya Shah',    role: 'pilot', certifications: ['IFR', 'Rotor', 'Night'],              shiftType: 'night',  dutyStatus: 'on-duty',  basedAt: 'b-seattle'  },
  { id: 'emp-derek',  name: 'F/O Derek Mills',     role: 'pilot', certifications: ['IFR', 'Rotor'],                       shiftType: 'day',    dutyStatus: 'off-duty', basedAt: 'b-portland' },
  { id: 'emp-elena',  name: 'Capt. Elena Vasquez', role: 'pilot', certifications: ['IFR', 'International', 'Fixed-Wing'], shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-denver'   },
  { id: 'emp-kevin',  name: 'F/O Kevin Holt',      role: 'pilot', certifications: ['IFR', 'Rotor'],                       shiftType: 'night',  dutyStatus: 'on-duty',  basedAt: 'b-denver'   },
  { id: 'emp-dana',   name: 'Capt. Dana Pierce',   role: 'pilot', certifications: ['IFR', 'Rotor', 'Mountain'],           shiftType: 'day',    dutyStatus: 'on-duty',  basedAt: 'b-slc'      },
  { id: 'emp-cody',   name: 'F/O Cody Barnes',     role: 'pilot', certifications: ['IFR', 'Rotor'],                       shiftType: 'on-call', dutyStatus: 'on-call', basedAt: 'b-bozeman'  },
];

/** Backward-compat alias used by App.tsx. */
export const crew = pilots;

export const medicalCrew: DemoEmployee[] = [
  { id: 'emp-keely',  name: 'Keely Frost',   role: 'rn',    certifications: ['RN – Critical Care', 'RN – Flight'],                              shiftType: 'day',     dutyStatus: 'on-duty',  basedAt: 'b-seattle'  },
  { id: 'emp-alex',   name: 'Alex Torres',   role: 'rt',    certifications: ['RT – Vent', 'International Transfer Capable'],                    shiftType: 'night',   dutyStatus: 'on-duty',  basedAt: 'b-seattle'  },
  { id: 'emp-sam',    name: 'Sam Nguyen',    role: 'rn',    certifications: ['RN – Flight', 'ECMO Capable', 'International Transfer Capable'],  shiftType: 'on-call', dutyStatus: 'on-call',  basedAt: 'b-seattle'  },
  { id: 'emp-jordan', name: 'Jordan Park',   role: 'medic', certifications: ['Medic – Neonatal'],                                               shiftType: 'day',     dutyStatus: 'on-duty',  basedAt: 'b-portland' },
  { id: 'emp-nina',   name: 'Nina Castro',   role: 'rn',    certifications: ['RN – Critical Care', 'RN – Flight'],                              shiftType: 'day',     dutyStatus: 'on-duty',  basedAt: 'b-denver'   },
  { id: 'emp-david',  name: 'David Kim',     role: 'rt',    certifications: ['RT – Vent'],                                                       shiftType: 'night',   dutyStatus: 'on-duty',  basedAt: 'b-denver'   },
  { id: 'emp-grace',  name: 'Grace Taylor',  role: 'medic', certifications: ['Medic – Neonatal'],                                               shiftType: 'day',     dutyStatus: 'off-duty', basedAt: 'b-slc'      },
];

export const mechanics: DemoEmployee[] = [
  { id: 'emp-mike',  name: 'Mike Santos',  role: 'mechanic', certifications: ['A&P'], shiftType: 'on-call', dutyStatus: 'on-call', basedAt: 'b-seattle' },
  { id: 'emp-sarah', name: 'Sarah Powell', role: 'mechanic', certifications: ['A&P'], shiftType: 'day',     dutyStatus: 'on-duty', basedAt: 'b-denver'  },
];

import type { DemoEvent } from './types';

// ── Internal helpers ──────────────────────────────────────────────────────────
// (Not exported — only the typed arrays below are public API.)

function nd(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

type EC = DemoEvent['category'];

function dayShifts(
  prefix: string, title: string, person: string, base: string,
  dates: readonly string[], cat: EC,
): DemoEvent[] {
  return dates.map((d, i) => ({
    id: `${prefix}-${i + 1}`, title, category: cat, visualPriority: 'muted',
    start: `${d}T07:00`, end: `${d}T19:00`, assignedTo: person, basedAt: base,
  }));
}

function nightShifts(
  prefix: string, title: string, person: string, base: string,
  dates: readonly string[], cat: EC,
): DemoEvent[] {
  return dates.map((d, i) => ({
    id: `${prefix}-${i + 1}`, title, category: cat, visualPriority: 'muted',
    start: `${d}T19:00`, end: `${nd(d)}T07:00`, assignedTo: person, basedAt: base,
  }));
}

// Weekdays of the anchor week (Mon Apr 20 – Fri Apr 24, 2026)
const WD: readonly string[] = ['2026-04-20','2026-04-21','2026-04-22','2026-04-23','2026-04-24'];
// Full week (Mon Apr 20 – Sun Apr 26)
const W1: readonly string[] = [...WD, '2026-04-25', '2026-04-26'];

// ── Dispatch shifts ───────────────────────────────────────────────────────────

export const dispatchShifts: DemoEvent[] = [
  // Seattle hub — 7 days day + night
  ...dayShifts  ('ds-marcus', 'Dispatch Day',   'emp-marcus', 'b-seattle',  W1, 'dispatch-shift'),
  ...nightShifts('ds-diane',  'Dispatch Night', 'emp-diane',  'b-seattle',  W1, 'dispatch-shift'),
  // Portland — weekdays day only
  ...dayShifts  ('ds-ryan',   'Dispatch Day',   'emp-ryan',   'b-portland', WD, 'dispatch-shift'),
  // Denver hub — 7 days day + night
  ...dayShifts  ('ds-lisa',   'Dispatch Day',   'emp-lisa',   'b-denver',   W1, 'dispatch-shift'),
  ...nightShifts('ds-tom',    'Dispatch Night', 'emp-tom',    'b-denver',   W1, 'dispatch-shift'),
  // Salt Lake — weekdays day only
  ...dayShifts  ('ds-ana',    'Dispatch Day',   'emp-ana',    'b-slc',      WD, 'dispatch-shift'),
];

// ── Pilot shifts ──────────────────────────────────────────────────────────────
// James and Elena are on the mission Apr 24, so their shifts end Thu Apr 23.

const WD_PRE_MISSION: readonly string[] = ['2026-04-20','2026-04-21','2026-04-22','2026-04-23'];

export const pilotShifts: DemoEvent[] = [
  ...dayShifts  ('ps-james',  'Pilot Day',   'emp-james',  'b-seattle',  WD_PRE_MISSION, 'pilot-shift'),
  ...nightShifts('ps-priya',  'Pilot Night', 'emp-priya',  'b-seattle',  WD,             'pilot-shift'),
  ...dayShifts  ('ps-derek',  'Pilot Day',   'emp-derek',  'b-portland', WD_PRE_MISSION, 'pilot-shift'),
  ...dayShifts  ('ps-elena',  'Pilot Day',   'emp-elena',  'b-denver',   WD_PRE_MISSION, 'pilot-shift'),
  ...nightShifts('ps-kevin',  'Pilot Night', 'emp-kevin',  'b-denver',   WD,             'pilot-shift'),
  ...dayShifts  ('ps-dana',   'Pilot Day',   'emp-dana',   'b-slc',      WD,             'pilot-shift'),
];

// ── Medical shifts ────────────────────────────────────────────────────────────

export const medicalShifts: DemoEvent[] = [
  ...dayShifts  ('ms-keely',  'Medical Day',   'emp-keely',  'b-seattle',  WD_PRE_MISSION, 'medical-shift'),
  ...nightShifts('ms-alex',   'Medical Night', 'emp-alex',   'b-seattle',  WD_PRE_MISSION, 'medical-shift'),
  ...dayShifts  ('ms-jordan', 'Medical Day',   'emp-jordan', 'b-portland', WD,             'medical-shift'),
  ...dayShifts  ('ms-nina',   'Medical Day',   'emp-nina',   'b-denver',   WD,             'medical-shift'),
  ...nightShifts('ms-david',  'Medical Night', 'emp-david',  'b-denver',   WD,             'medical-shift'),
  // Grace Taylor — PTO Mon/Tue, day shifts Wed–Fri
  ...dayShifts  ('ms-grace',  'Medical Day',   'emp-grace',  'b-slc',      ['2026-04-22','2026-04-23','2026-04-24'], 'medical-shift'),
];

// ── Mechanic shifts ───────────────────────────────────────────────────────────

export const mechanicShifts: DemoEvent[] = [
  ...dayShifts('mech-sarah', 'Mechanic Day', 'emp-sarah', 'b-denver', WD, 'mechanic-shift'),
];

// ── On-call rotation (week-long blocks) ───────────────────────────────────────

export const mechanicOnCall: DemoEvent[] = [
  { id: 'oc-mike-w1',  title: 'On Call – Week A', category: 'on-call', visualPriority: 'muted', start: '2026-04-20T00:00', end: '2026-04-27T00:00', assignedTo: 'emp-mike',  basedAt: 'b-seattle' },
  { id: 'oc-sarah-w2', title: 'On Call – Week B', category: 'on-call', visualPriority: 'muted', start: '2026-04-27T00:00', end: '2026-05-04T00:00', assignedTo: 'emp-sarah', basedAt: 'b-denver'  },
  { id: 'oc-sam-w1',   title: 'On Call – Week A', category: 'on-call', visualPriority: 'muted', start: '2026-04-20T00:00', end: '2026-04-27T00:00', assignedTo: 'emp-sam',   basedAt: 'b-seattle' },
  { id: 'oc-grace-w2', title: 'On Call – Week B', category: 'on-call', visualPriority: 'muted', start: '2026-04-27T00:00', end: '2026-05-04T00:00', assignedTo: 'emp-grace', basedAt: 'b-slc'     },
  { id: 'oc-cody-w1',  title: 'On Call – Week A', category: 'on-call', visualPriority: 'muted', start: '2026-04-20T00:00', end: '2026-04-27T00:00', assignedTo: 'emp-cody',  basedAt: 'b-bozeman' },
];

import type { DemoMissionRequest } from './types';

// ── PTO ───────────────────────────────────────────────────────────────────────

export const ptoEvents: DemoEvent[] = [
  { id: 'pto-derek', title: 'PTO – Derek Mills',  category: 'pto', visualPriority: 'muted', start: '2026-04-24T00:00', end: '2026-04-26T00:00', assignedTo: 'emp-derek', basedAt: 'b-portland' },
  { id: 'pto-grace', title: 'PTO – Grace Taylor', category: 'pto', visualPriority: 'muted', start: '2026-04-20T00:00', end: '2026-04-22T00:00', assignedTo: 'emp-grace', basedAt: 'b-slc'      },
];

// ── Maintenance ───────────────────────────────────────────────────────────────

export const maintenanceEvents: DemoEvent[] = [
  { id: 'maint-n806ec', title: 'Scheduled Inspection – EC135 N806EC', category: 'maintenance', visualPriority: 'high',  start: '2026-04-21T08:00', end: '2026-04-24T17:00', assignedTo: 'ac-n806ec', basedAt: 'b-bozeman' },
  { id: 'maint-n803lj', title: 'Pre-Mission Check – Learjet N803LJ',  category: 'maintenance', visualPriority: 'high',  start: '2026-04-22T07:00', end: '2026-04-23T12:00', assignedTo: 'ac-n803lj', basedAt: 'b-seattle'  },
];

// ── Training ──────────────────────────────────────────────────────────────────

export const trainingEvents: DemoEvent[] = [
  { id: 'trn-cody', title: 'IFR Recurrent – Cody Barnes',    category: 'training', visualPriority: 'muted', start: '2026-04-23T09:00', end: '2026-04-23T15:00', assignedTo: 'emp-cody',  basedAt: 'b-bozeman' },
  { id: 'trn-sam',  title: 'ECMO Recertification – Sam Nguyen', category: 'training', visualPriority: 'muted', start: '2026-04-22T08:00', end: '2026-04-22T16:00', assignedTo: 'emp-sam',   basedAt: 'b-seattle'  },
];

// ── Aircraft + asset requests ─────────────────────────────────────────────────

export const requests: DemoEvent[] = [
  { id: 'req-n803lj', title: 'Lift Request – N803LJ (International Mission)', category: 'aircraft-request', visualPriority: 'high',  start: '2026-04-23T08:00', end: '2026-04-23T17:00', assignedTo: 'ac-n803lj', basedAt: 'b-seattle'  },
  { id: 'req-nicu',   title: 'NICU Equipment Check – AW139 N801AW',            category: 'asset-request',    visualPriority: 'muted', start: '2026-04-24T09:00', end: '2026-04-24T11:00', assignedTo: 'ac-n801aw', basedAt: 'b-seattle'  },
];

// ── Base events ───────────────────────────────────────────────────────────────

export const baseEvents: DemoEvent[] = [
  { id: 'base-sea-allhands', title: 'Seattle All-Hands',        category: 'base-event', visualPriority: 'muted', start: '2026-04-21T08:00', end: '2026-04-21T09:00', basedAt: 'b-seattle' },
  { id: 'base-sea-brief',    title: 'Pre-Mission Briefing',     category: 'base-event', visualPriority: 'high',  start: '2026-04-23T14:00', end: '2026-04-23T15:30', basedAt: 'b-seattle' },
  { id: 'base-den-standup',  title: 'Denver Crew Standup',      category: 'base-event', visualPriority: 'muted', start: '2026-04-21T07:30', end: '2026-04-21T08:00', basedAt: 'b-denver'  },
];

// ── International mission ─────────────────────────────────────────────────────

const MISSION_TITLE = 'São Paulo → Munich Critical Care Transfer';

export const mission: DemoMissionRequest = {
  id: 'mission-sao-muc',
  title: MISSION_TITLE,
  start: '2026-04-24T06:00',
  end:   '2026-04-28T08:00',
  requirements: {
    aircraft: { minHoursRemaining: 30, requiredCapabilities: ['IFR', 'International', 'Critical Care'] },
    crew: {
      pilots:  { count: 4, certifications: ['IFR', 'International'] },
      medical: [
        { role: 'RN', certifications: ['Critical Care'] },
        { role: 'RT', certifications: ['Vent'] },
      ],
    },
    durationDays: 4,
  },
  assignments: {
    pilots:  [
      { resourceId: 'emp-james',  resourceType: 'pilot' },
      { resourceId: 'emp-elena',  resourceType: 'pilot' },
      { resourceId: 'emp-priya',  resourceType: 'pilot' },
      { resourceId: 'emp-kevin',  resourceType: 'pilot' },
    ],
    medical: [
      { resourceId: 'emp-keely', resourceType: 'medical' },
      { resourceId: 'emp-alex',  resourceType: 'medical' },
    ],
    aircraft: { resourceId: 'ac-n803lj', resourceType: 'aircraft' },
  },
  legs: [
    { id: 'leg-1', from: 'São Paulo (GRU)', to: 'New York (JFK)', start: '2026-04-24T06:00', end: '2026-04-24T14:00' },
    { id: 'leg-2', from: 'New York (JFK)',  to: 'London (LHR)',   start: '2026-04-24T16:00', end: '2026-04-25T06:00' },
    { id: 'leg-3', from: 'London (LHR)',    to: 'Munich (MUC)',   start: '2026-04-25T08:00', end: '2026-04-25T11:00' },
    { id: 'leg-4', from: 'Munich (MUC)',    to: 'Seattle (SEA)',  start: '2026-04-27T10:00', end: '2026-04-28T08:00' },
  ],
  compliance: [
    { id: 'comp-1', label: 'Brazil Exit Clearance',       status: 'approved' },
    { id: 'comp-2', label: 'Portugal Overflight Permit',  status: 'approved' },
    { id: 'comp-3', label: 'Germany Entry Clearance',     status: 'pending'  },
    { id: 'comp-4', label: 'Medical Capability Verified', status: 'approved' },
    { id: 'comp-5', label: 'Duty-Time Compliance',        status: 'pending'  },
  ],
};

// Mission calendar events — one aircraft event covering the full mission
// window plus full-window crew "shift-kind" events. The aircraft event has
// no meta.kind, so it surfaces in Month/Week as one continuous mission bar.
// Crew events are tagged kind: 'shift' so the library's viewScope filters
// them out of Month/Week (they'd otherwise stack as 6 overlapping multi-day
// pills) — they still appear in Schedule and the Crew-on-shift surfaces
// because the kind correctly marks them as active staffing.
export const missionEvents: DemoEvent[] = [
  // Aircraft — single span for the whole mission window
  {
    id: 'mission-ac-window',
    title: MISSION_TITLE,
    category: 'mission-assignment' as const,
    visualPriority: 'high' as const,
    start: mission.start, end: mission.end,
    assignedTo: 'ac-n803lj', basedAt: 'b-seattle',
  },
  // Assigned crew covering the full mission window. `meta.kind: 'shift'`
  // hides them from Month/Week noise but keeps them visible in Schedule.
  ...mission.assignments.pilots.map(p => ({
    id: `mission-pilot-${p.resourceId}`,
    title: MISSION_TITLE,
    category: 'mission-assignment' as const,
    visualPriority: 'high' as const,
    start: mission.start, end: mission.end,
    assignedTo: p.resourceId, basedAt: 'b-seattle',
    meta: { kind: 'shift' as const },
  })),
  ...mission.assignments.medical.map(m => ({
    id: `mission-med-${m.resourceId}`,
    title: MISSION_TITLE,
    category: 'mission-assignment' as const,
    visualPriority: 'high' as const,
    start: mission.start, end: mission.end,
    assignedTo: m.resourceId, basedAt: 'b-seattle',
    meta: { kind: 'shift' as const },
  })),
];

// ── Flat composite export ─────────────────────────────────────────────────────

export const allEvents: DemoEvent[] = [
  ...dispatchShifts,
  ...pilotShifts,
  ...medicalShifts,
  ...mechanicShifts,
  ...mechanicOnCall,
  ...ptoEvents,
  ...maintenanceEvents,
  ...trainingEvents,
  ...requests,
  ...baseEvents,
  ...missionEvents,
];

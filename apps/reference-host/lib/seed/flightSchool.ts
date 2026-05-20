/**
 * First-paint seed for the dashboard. One airport, two aircraft, two
 * CFIs, three students, a half-dozen lessons across today and tomorrow.
 *
 * Replace with a Supabase-backed loader once you've stood up your schema —
 * this file exists so the dashboard renders something useful before
 * anyone's written a single row.
 */
import type { WorksCalendarEvent } from 'works-calendar';

export interface FlightSchoolAircraft {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly meta: {
    readonly base: string;
    readonly tail: string;
    readonly model: string;
    readonly color: string;
  };
}

export interface FlightSchoolInstructor {
  readonly id: string;
  readonly name: string;
  readonly role: 'CFI' | 'CFII' | 'MEI';
  readonly base: string;
  readonly color: string;
}

export interface FlightSchoolBase {
  readonly id: string;
  readonly name: string;
  readonly regionId: string;
}

export const BASES: FlightSchoolBase[] = [
  { id: 'KPAO', name: 'Palo Alto (KPAO)', regionId: 'norcal' },
];

export const REGIONS = [{ id: 'norcal', name: 'Northern California' }];

export const AIRCRAFT: FlightSchoolAircraft[] = [
  {
    id: 'N12345',
    label: 'N12345 — Cessna 172',
    group: 'KPAO',
    meta: { base: 'KPAO', tail: 'N12345', model: 'C172', color: '#2980b9' },
  },
  {
    id: 'N67890',
    label: 'N67890 — Piper Cherokee',
    group: 'KPAO',
    meta: { base: 'KPAO', tail: 'N67890', model: 'PA-28', color: '#27ae60' },
  },
];

export const INSTRUCTORS: FlightSchoolInstructor[] = [
  { id: 'cfi-sam',   name: 'Sam Park',  role: 'CFI',  base: 'KPAO', color: '#e67e22' },
  { id: 'cfi-riley', name: 'Riley Chen', role: 'CFII', base: 'KPAO', color: '#8e44ad' },
];

function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function tomorrowAt(hour: number, minute = 0): Date {
  const d = todayAt(hour, minute);
  d.setDate(d.getDate() + 1);
  return d;
}

export function seedEvents(): WorksCalendarEvent[] {
  return [
    {
      id: 'lesson-1',
      title: 'Mason — Pre-solo XC',
      start: todayAt(9, 0),
      end: todayAt(11, 0),
      resource: 'cfi-sam',
      meta: { aircraftId: 'N12345', studentId: 'stu-mason', lessonType: 'XC', base: 'KPAO' },
    },
    {
      id: 'lesson-2',
      title: 'Avery — Stalls / slow flight',
      start: todayAt(11, 30),
      end: todayAt(13, 0),
      resource: 'cfi-sam',
      meta: { aircraftId: 'N12345', studentId: 'stu-avery', lessonType: 'Maneuvers', base: 'KPAO' },
    },
    {
      id: 'lesson-3',
      title: 'Jordan — Instrument approaches',
      start: todayAt(14, 0),
      end: todayAt(16, 0),
      resource: 'cfi-riley',
      meta: { aircraftId: 'N67890', studentId: 'stu-jordan', lessonType: 'IFR', base: 'KPAO' },
    },
    {
      id: 'lesson-4',
      title: 'Mason — Pattern work',
      start: tomorrowAt(8, 0),
      end: tomorrowAt(9, 30),
      resource: 'cfi-sam',
      meta: { aircraftId: 'N12345', studentId: 'stu-mason', lessonType: 'Pattern', base: 'KPAO' },
    },
    {
      id: 'lesson-5',
      title: 'Pat — Discovery flight',
      start: tomorrowAt(10, 0),
      end: tomorrowAt(11, 0),
      resource: 'cfi-riley',
      meta: { aircraftId: 'N67890', studentId: 'stu-pat', lessonType: 'Discovery', base: 'KPAO' },
    },
    {
      id: 'maint-1',
      title: 'N12345 — 100h inspection',
      start: tomorrowAt(13, 0),
      end: tomorrowAt(17, 0),
      resource: 'maintenance',
      meta: { aircraftId: 'N12345', kind: 'maintenance', base: 'KPAO' },
    },
  ];
}

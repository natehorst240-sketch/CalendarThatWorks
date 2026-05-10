import {
  startOfMonth, endOfMonth, startOfDay,
  startOfWeek, endOfWeek, addDays,
} from 'date-fns';
import type { ViewId } from './viewScope';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseValue = any;

export function opAnnouncement(op: LooseValue): string {
  switch (op.type) {
    case 'create': return `Event "${op.event?.title ?? 'Untitled'}" created.`;
    case 'update': return 'Event updated.';
    case 'delete': return 'Event deleted.';
    case 'move':   return 'Event moved.';
    case 'resize': return 'Event resized.';
    case 'group-change': return 'Event reassigned.';
    default:       return 'Change applied.';
  }
}

export type ViewGroup = 'calendar' | 'operations';
export type ViewDef = { id: ViewId; label: string; alwaysOn: boolean; hint?: string; group: ViewGroup };

export const ALL_VIEWS: readonly ViewDef[] = [
  { id: 'month',    label: 'Month',    alwaysOn: true,  hint: 'Scheduled events — appointments, missions, PTO',                   group: 'calendar' },
  { id: 'week',     label: 'Week',     alwaysOn: true,  hint: 'Scheduled events by day — not staffing or on-call',                group: 'calendar' },
  { id: 'day',      label: 'Day',      alwaysOn: false,                                                                            group: 'calendar' },
  { id: 'agenda',   label: 'Agenda',   alwaysOn: false,                                                                            group: 'calendar' },
  { id: 'schedule', label: 'Schedule', alwaysOn: false, hint: 'Staffing — day/night shifts, on-call rotation, duty status',       group: 'calendar' },
  { id: 'base',     label: 'Base',     alwaysOn: false, hint: 'Gantt-style — employees, aircraft, and base events side by side', group: 'calendar' },
  { id: 'assets',   label: 'Assets',   alwaysOn: false,                                                                            group: 'operations' },
  { id: 'dispatch', label: 'Dispatch', alwaysOn: false, hint: 'Fleet readiness at a moment in time — what can launch now?',      group: 'operations' },
  { id: 'requests', label: 'Requests', alwaysOn: false, hint: 'Pending approval queue — approve, deny, or escalate requests',    group: 'operations' },
];

export const DEFAULT_SCHEDULE_INSTANTIATION_LIMITS = {
  previewMax: 200,
  createMax: 200,
};

let exportToExcelFn: LooseValue = null;
export async function exportVisibleEvents(events: LooseValue): Promise<void> {
  if (!exportToExcelFn) {
    ({ exportToExcel: exportToExcelFn } = await import('../export/excelExport.js'));
  }
  return exportToExcelFn(events);
}

/** Compute the visible [start, end] range for a given view + date. */
export function viewRange(view: LooseValue, date: LooseValue, weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0) {
  switch (view) {
    case 'week':
      return { start: startOfWeek(date, { weekStartsOn: weekStartDay }), end: endOfWeek(date, { weekStartsOn: weekStartDay }) };
    case 'day':
      return { start: date, end: addDays(date, 1) };
    case 'base':
      return { start: startOfDay(date), end: addDays(startOfDay(date), 90) };
    case 'month': {
      const monthStart = startOfMonth(date);
      const monthEnd   = endOfMonth(date);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: weekStartDay }),
        end:   endOfWeek(monthEnd,     { weekStartsOn: weekStartDay }),
      };
    }
    default: // agenda, schedule (timeline), assets
      return { start: startOfMonth(date), end: endOfMonth(date) };
  }
}

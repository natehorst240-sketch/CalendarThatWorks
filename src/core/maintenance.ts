/**
 * Maintenance helpers — pure functions over the types in `src/types/maintenance.ts`.
 *
 * computeDueStatus(rule, current, lastService?, now?)  → DueResult
 * projectNextDue(rule, lastService)                    → next-due projection
 * completeMaintenance(event, rule, reading)            → updated event + reading
 *
 * No event storage, no async, no side effects. Callers feed in the relevant
 * pieces (typically derived from prior calendar events + asset state) and get
 * data back to display, persist, or discard.
 */

import type {
  MaintenanceRule,
  MaintenanceMeta,
  MeterReading,
  MeterType,
} from '../types/maintenance';
import type { WorksCalendarEvent } from '../types/events';

// ── Types ────────────────────────────────────────────────────────────────────

export type DueStatus = 'unknown' | 'ok' | 'due-soon' | 'overdue';

export interface DueResult {
  status: DueStatus;
  /** Per-dimension projection. Negative `remaining` = overdue by that amount. */
  miles?:  { remaining: number };
  hours?:  { remaining: number };
  days?:   { remaining: number };
  cycles?: { remaining: number };
}

export interface CurrentState {
  /** Most recent meter reading for the asset, if any. */
  meter?: { type: MeterType; value: number };
}

export interface LastService {
  /** Meter value at the moment the last service completed. */
  meterAtService?: number;
  /** ISO-8601 timestamp the last service completed. */
  completedAt?: string;
}

export interface NextDueProjection {
  nextDueMiles?: number;
  nextDueHours?: number;
  nextDueCycles?: number;
  /** ISO-8601 date string. */
  nextDueDate?: string;
}

// ── computeDueStatus ─────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
/** Worst dimension drives the overall status. */
const SEVERITY: Record<DueStatus, number> = { unknown: 0, ok: 1, 'due-soon': 2, overdue: 3 };

export function computeDueStatus(
  rule: MaintenanceRule,
  current: CurrentState,
  lastService: LastService = {},
  now: Date = new Date(),
): DueResult {
  const interval = rule.interval;
  const warning  = rule.warningWindow ?? {};

  if (!interval) return { status: 'unknown' };

  const result: DueResult = { status: 'unknown' };
  let worst: DueStatus = 'unknown';
  const promote = (s: DueStatus) => { if (SEVERITY[s] > SEVERITY[worst]) worst = s; };

  // Meter-based dimensions. Each requires both the rule interval AND a current
  // reading whose meter type matches the dimension we're evaluating.
  const meterValue = current.meter?.value;
  const meterType  = current.meter?.type;

  const meterDim = (
    key: 'miles' | 'hours' | 'cycles',
    matchType: MeterType,
  ) => {
    const intervalAmt = interval[key];
    if (intervalAmt == null) return;
    if (meterValue == null || meterType !== matchType || lastService.meterAtService == null) {
      promote('unknown');
      return;
    }
    const nextDue   = lastService.meterAtService + intervalAmt;
    const remaining = nextDue - meterValue;
    result[key] = { remaining };
    if (remaining < 0) promote('overdue');
    else if (warning[key] != null && remaining <= warning[key]!) promote('due-soon');
    else promote('ok');
  };

  meterDim('miles',  'miles');
  meterDim('hours',  'hours');
  meterDim('cycles', 'cycles');

  // Days dimension — relative to lastService.completedAt.
  if (interval.days != null) {
    if (!lastService.completedAt) {
      promote('unknown');
    } else {
      const completed = new Date(lastService.completedAt);
      if (isNaN(completed.getTime())) {
        promote('unknown');
      } else {
        const dueAt     = completed.getTime() + interval.days * MS_PER_DAY;
        const remaining = Math.floor((dueAt - now.getTime()) / MS_PER_DAY);
        result.days = { remaining };
        if (remaining < 0) promote('overdue');
        else if (warning.days != null && remaining <= warning.days) promote('due-soon');
        else promote('ok');
      }
    }
  }

  result.status = worst;
  return result;
}

// ── projectNextDue ───────────────────────────────────────────────────────────

export function projectNextDue(
  rule: MaintenanceRule,
  lastService: LastService,
): NextDueProjection {
  const out: NextDueProjection = {};
  const interval = rule.interval;
  if (!interval) return out;

  if (interval.miles  != null && lastService.meterAtService != null) out.nextDueMiles  = lastService.meterAtService + interval.miles;
  if (interval.hours  != null && lastService.meterAtService != null) out.nextDueHours  = lastService.meterAtService + interval.hours;
  if (interval.cycles != null && lastService.meterAtService != null) out.nextDueCycles = lastService.meterAtService + interval.cycles;

  if (interval.days != null && lastService.completedAt) {
    const completed = new Date(lastService.completedAt);
    if (!isNaN(completed.getTime())) {
      const due = new Date(completed.getTime() + interval.days * MS_PER_DAY);
      out.nextDueDate = due.toISOString();
    }
  }

  return out;
}

// ── completeMaintenance ──────────────────────────────────────────────────────

/**
 * Mark a maintenance event complete: stamps lifecycle, meter, and projected
 * next-due fields on `event.meta.maintenance`, and produces a `MeterReading`
 * the caller can append to its history. Pure — does not mutate inputs.
 */
export function completeMaintenance(
  event: WorksCalendarEvent,
  rule: MaintenanceRule,
  reading: { assetId: string; type: MeterType; value: number; asOf?: string; reportedBy?: string },
): { event: WorksCalendarEvent; reading: MeterReading } {
  const asOf = reading.asOf ?? new Date().toISOString();

  const projection = projectNextDue(rule, {
    meterAtService: reading.value,
    completedAt:    asOf,
  });

  const prior = (event.meta?.['maintenance'] as MaintenanceMeta | undefined) ?? {};
  const maintenance: MaintenanceMeta = {
    ...prior,
    ruleId: prior.ruleId ?? rule.id,
    lifecycle: 'complete',
    meterAtService: reading.value,
    ...(projection.nextDueMiles  != null && { nextDueMiles:  projection.nextDueMiles }),
    ...(projection.nextDueHours  != null && { nextDueHours:  projection.nextDueHours }),
    ...(projection.nextDueCycles != null && { nextDueCycles: projection.nextDueCycles }),
    ...(projection.nextDueDate            && { nextDueDate:  projection.nextDueDate }),
  };

  const nextEvent: WorksCalendarEvent = {
    ...event,
    meta: {
      ...(event.meta ?? {}),
      maintenance,
    },
  };

  const meterReading: MeterReading = {
    assetId: reading.assetId,
    type:    reading.type,
    value:   reading.value,
    asOf,
    ...(reading.reportedBy && { reportedBy: reading.reportedBy }),
  };

  return { event: nextEvent, reading: meterReading };
}

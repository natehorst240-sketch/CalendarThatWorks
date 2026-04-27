/**
 * shiftEmployeeIdsAt — pure helper that extracts the set of employee ids
 * who have a shift / on-call event overlapping a given moment in time.
 *
 * Used by the AppShell RightPanel's CrewOnShiftList to narrow the
 * configured roster to "people currently scheduled to work."
 *
 * Filtering rules (delegating to scheduleModel for kind detection so the
 * notion of "shift" stays canonical):
 *   - Event is a shift OR on-call (per isShiftOrOnCallEvent).
 *   - asOf is in [event.start, event.end] (inclusive on both ends — a
 *     shift ending at exactly 18:00 still covers the clock turning over
 *     at 18:00).
 *   - resource (or meta.employeeId / meta.empId) yields a non-empty id.
 *
 * No React state, no useMemo here — callers wrap in their own useMemo if
 * needed. Pure function so it's trivial to test against fixture events.
 */
import { isShiftOrOnCallEvent } from '../core/scheduleModel';

type ShiftLike = {
  start?: Date | string | number | null;
  end?: Date | string | number | null;
  resource?: string | number | null;
  meta?: {
    employeeId?: string | number | null;
    empId?: string | number | null;
    [k: string]: unknown;
  } | null;
  kind?: unknown;
  category?: unknown;
};

function toMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function eventEmployeeId(ev: ShiftLike): string | null {
  const fromResource = ev.resource;
  if (fromResource != null && String(fromResource).length > 0) return String(fromResource);
  const meta = ev.meta;
  if (meta) {
    const fromMeta = meta.employeeId ?? meta.empId;
    if (fromMeta != null && String(fromMeta).length > 0) return String(fromMeta);
  }
  return null;
}

export function shiftEmployeeIdsAt(
  events: readonly ShiftLike[] | null | undefined,
  asOf: Date | number | string = new Date(),
  onCallCategory: string = 'on-call',
): Set<string> {
  const out = new Set<string>();
  if (!events || events.length === 0) return out;
  const now = toMs(asOf);
  if (now == null) return out;

  for (const ev of events) {
    if (!isShiftOrOnCallEvent(ev as Parameters<typeof isShiftOrOnCallEvent>[0], onCallCategory)) continue;
    const start = toMs(ev.start);
    const end = toMs(ev.end);
    if (start == null || end == null) continue;
    if (start > now || end < now) continue;
    const empId = eventEmployeeId(ev);
    if (empId !== null) out.add(empId);
  }
  return out;
}

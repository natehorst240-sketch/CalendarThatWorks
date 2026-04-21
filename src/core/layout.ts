/**
 * layout.js — shared event layout algorithms.
 *
 *   layoutOverlaps  — column-pack timed events that share the same time slot
 *   layoutSpans     — lane-pack multi-day events for month/all-day row rendering
 */
import { startOfDay, differenceInCalendarDays, addDays, isSameDay } from 'date-fns';

type LayoutEvent = {
  start: Date;
  end: Date;
  allDay?: boolean;
  [k: string]: unknown;
};

// ─── Timed event overlap layout (week / day view) ──────────────────────────

/**
 * Assign non-overlapping horizontal columns to a set of timed events.
 *
 * @param {LayoutEvent[]} events
 * @returns {Array<LayoutEvent & { _col: number; _numCols: number }>}
 */
export function layoutOverlaps(
  events: LayoutEvent[],
): Array<LayoutEvent & { _col: number; _numCols: number }> {
  if (!events.length) return [];

  // Sort by start time, then longer events first for visual stability
  const sorted = [...events].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
      || (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime()),
  );

  const colEnds: Date[] = []; // colEnds[i] = end time of the last event placed in column i

  const withCols = sorted.map(ev => {
    const col = colEnds.findIndex(end => end <= ev.start);
    const assigned = col === -1 ? colEnds.length : col;
    colEnds[assigned] = ev.end;
    return { ...ev, _col: assigned };
  });

  const numCols = colEnds.length;
  return withCols.map(ev => ({ ...ev, _numCols: numCols }));
}

// ─── Multi-day event span layout (month view / all-day row) ───────────────

/**
 * The "display end day" of an event — the last calendar day the event
 * occupies (inclusive), accounting for exclusive all-day ends.
 */
export function displayEndDay(ev: LayoutEvent): Date {
  const end = ev.end;
  const day = startOfDay(end);
  const atMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
  if (ev.allDay) {
    // All-day events use iCal's exclusive DTEND convention:
    // DTEND=Jan4 means the event covers Jan1–Jan3, not Jan4.
    return atMidnight ? addDays(day, -1) : day;
  }
  // Timed events that end exactly at midnight and started on an earlier date
  // should not "occupy" the boundary day in month-span lane packing.
  // This prevents adjacent back-to-back rotations from double-stacking.
  if (atMidnight && !isSameDay(ev.start, end)) return addDays(day, -1);
  // Otherwise, timed events use their real end day.
  return day;
}

/**
 * Pack multi-day (spanning) events into non-overlapping lanes for one week row.
 *
 * @param {LayoutEvent[]} events   — already filtered to multi-day events
 * @param {Date}              weekStart — first day (Monday/Sunday) of the week row
 * @param {Date}              weekEnd   — last day of the week row
 * @returns {Array<{
 *   ev: LayoutEvent;
 *   startCol: number;      // 0–6, clipped to week
 *   endCol: number;        // 0–6, clipped to week (inclusive)
 *   lane: number;
 *   continuesBefore: boolean;
 *   continuesAfter: boolean;
 * }>}
 */
export type LayoutSpanItem = {
  ev: LayoutEvent;
  evStartDay: Date;
  evEndDay: Date;
  startCol: number;
  endCol: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
};

export function layoutSpans(
  events: LayoutEvent[],
  weekStart: Date,
  weekEnd: Date,
): LayoutSpanItem[] {
  const items = events
    .map(ev => {
      const evStartDay = startOfDay(ev.start);
      const evEndDay   = displayEndDay(ev);
      return {
        ev,
        evStartDay,
        evEndDay,
        startCol: Math.max(0, differenceInCalendarDays(evStartDay, weekStart)),
        endCol:   Math.min(6, differenceInCalendarDays(evEndDay,   weekStart)),
        continuesBefore: evStartDay < weekStart,
        continuesAfter:  evEndDay   > weekEnd,
      };
    })
    // Must actually overlap this week
    .filter(item => item.evStartDay <= weekEnd && item.evEndDay >= weekStart)
    // Sort by visual start position, then longer spans first
    .sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));

  const laneEnds: number[] = []; // laneEnds[i] = last endCol placed in lane i

  return items.map(item => {
    let lane = laneEnds.findIndex(end => end < item.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.endCol;
    return { ...item, lane };
  });
}

/**
 * CalendarEngine — wall-clock time semantics.
 *
 * "Wall clock" means the time as displayed on a clock in a specific timezone,
 * e.g. "9:00 AM in Denver".
 *
 * This matters for recurring events: "every Monday at 9 AM" should stay at
 * 9 AM local time, even when DST transitions change the UTC offset.
 *
 * Key concept: wall-clock events are stored with their IANA timezone so the
 * engine can always recover the correct UTC instant for any given date.
 */

import { wallClockToUtc, hoursInTimezone, partsInTimezone } from './timezone';
import { buildOccurrenceDateKey } from '../recurrence/recurrenceMath';

// ─── Wall-clock anchor ────────────────────────────────────────────────────────

/**
 * A timezone-aware wall-clock time anchor.
 * Represents "HH:MM in <tz>" without binding to a specific date.
 */
export interface WallClockAnchor {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly timezone: string;
}

/**
 * Extract the wall-clock anchor from a Date in the given timezone.
 */
export function extractWallClockAnchor(d: Date, tz: string): WallClockAnchor {
  const parts = partsInTimezone(d, tz);
  return { hour: parts.hour, minute: parts.minute, second: parts.second, timezone: tz };
}

/**
 * Apply a wall-clock anchor to a specific date (year/month/day) in the
 * anchor's timezone.  Returns the UTC Date.
 *
 * Use this when expanding recurring events: take the series master's
 * wall-clock time and project it onto each occurrence date.
 */
export function applyWallClockAnchor(
  year: number,
  month: number, // 1-based
  day: number,
  anchor: WallClockAnchor,
): Date {
  return wallClockToUtc(year, month, day, anchor.hour, anchor.minute, anchor.second, anchor.timezone);
}

// ─── Duration preservation ────────────────────────────────────────────────────

/**
 * Compute the end time for an occurrence given:
 *   - the occurrence start (UTC)
 *   - the original event duration in ms
 *   - the event's timezone (for DST-aware duration)
 *
 * In most cases this is just `start + durationMs`.
 * The timezone parameter is reserved for future DST-aware duration math.
 */
export function computeOccurrenceEnd(
  start: Date,
  durationMs: number,
  _tz?: string | null,
): Date {
  // Currently: simple addition.
  // TODO: For DST-aware semantics (preserve wall-clock end time), use _tz.
  return new Date(start.getTime() + durationMs);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Return the fractional hour position (0..24) for a date in the given
 * timezone.  Used by time-grid views to position events.
 */
export function eventStartHour(d: Date, tz: string | null): number {
  if (!tz) return d.getHours() + d.getMinutes() / 60;
  return hoursInTimezone(d, tz);
}

/**
 * CalendarEngine — timezone utilities.
 *
 * Wraps the Intl API for timezone-aware date operations.
 * All functions are pure (no side effects).
 *
 * Strategy: store and transmit dates as UTC (JS Date objects).
 * Convert to/from the display timezone only at the view boundary.
 */

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Return the IANA timezone identifier for the current browser/runtime.
 * Falls back to "UTC" if detection fails.
 */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** True if the given IANA timezone identifier is valid. */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── Display formatting ───────────────────────────────────────────────────────

/**
 * Format a Date in a specific IANA timezone.
 * Returns a plain object with numeric date/time parts.
 */
export function partsInTimezone(
  d: Date,
  tz: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(d).map(p => [p.type, p.value]),
  );

  return {
    year:   parseInt(parts.year   ?? '0', 10),
    month:  parseInt(parts.month  ?? '0', 10),
    day:    parseInt(parts.day    ?? '0', 10),
    hour:   parseInt(parts.hour   ?? '0', 10) % 24, // hour12=false can give 24
    minute: parseInt(parts.minute ?? '0', 10),
    second: parseInt(parts.second ?? '0', 10),
  };
}

/**
 * Get the UTC offset (in minutes) of a timezone at a specific instant.
 * Positive = east of UTC (e.g. +60 = UTC+1), negative = west.
 */
export function utcOffsetMinutes(d: Date, tz: string): number {
  const parts = partsInTimezone(d, tz);
  // Build the wall-clock time as if it were UTC, then compute difference
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs  = wallAsUtc - d.getTime();
  // Round to nearest minute to avoid sub-minute DST quirks
  return Math.round(offsetMs / 60_000);
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert a "wall clock" date (year/month/day/hour/minute in a timezone)
 * to a UTC Date object.
 *
 * Example: 9:00 AM in America/Denver → UTC Date
 *
 * This is an approximation that iterates once to handle DST correctly.
 * For precise scheduling use a full timezone library (e.g. date-fns-tz).
 */
export function wallClockToUtc(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): Date {
  // First pass: assume current UTC offset
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset    = utcOffsetMinutes(approxUtc, tz);
  // Second pass: correct for offset
  const corrected = new Date(approxUtc.getTime() - offset * 60_000);
  return corrected;
}

/**
 * Return the "local" hours decimal (0..24) for a date in the given timezone.
 * Useful for positioning events on a time grid.
 */
export function hoursInTimezone(d: Date, tz: string): number {
  const p = partsInTimezone(d, tz);
  return p.hour + p.minute / 60 + p.second / 3600;
}

// ─── Event timezone handling ──────────────────────────────────────────────────

/**
 * Normalize an event's start/end from its stored timezone to the display
 * timezone.
 *
 * For floating events (timezone === null), start/end are already in local time
 * and are returned unchanged.
 */
export function convertEventToDisplayZone(
  start: Date,
  end: Date,
  eventTz: string | null,
  displayTz: string | null,
): { start: Date; end: Date } {
  // If either timezone is null (floating), no conversion needed
  if (!eventTz || !displayTz || eventTz === displayTz) {
    return { start, end };
  }

  // JS Date is always UTC internally; Intl handles display conversion.
  // No data transformation needed — the same Date object displays
  // differently depending on the timezone used for formatting.
  return { start, end };
}

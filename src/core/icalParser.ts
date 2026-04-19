/**
 * Lightweight ICS / iCal parser (RFC 5545).
 *
 * Handles:
 *  - VCALENDAR / VEVENT blocks
 *  - Line unfolding
 *  - DTSTART, DTEND, DURATION (date-only and datetime)
 *  - SUMMARY, DESCRIPTION, LOCATION, CATEGORIES, STATUS, UID
 *  - RRULE: FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH
 *  - EXDATE
 *
 * No external dependencies.
 */

const DAY_MS = 86_400_000;
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// ─── Low-level helpers ─────────────────────────────────────────────────────

/** Unfold RFC 5545 line continuations (CRLF + LWSP). */
function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

/** Parse an ICS date/datetime string → Date (local). */
function parseICSDate(str) {
  if (!str) return null;
  const s = str.trim();
  if (s.length === 8) {
    // DATE: YYYYMMDD — treat as local midnight
    return new Date(
      parseInt(s.slice(0, 4), 10),
      parseInt(s.slice(4, 6), 10) - 1,
      parseInt(s.slice(6, 8), 10),
    );
  }
  // DATETIME: YYYYMMDDTHHmmss[Z]
  const y  = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(4, 6), 10) - 1;
  const d  = parseInt(s.slice(6, 8), 10);
  const h  = parseInt(s.slice(9, 11), 10);
  const mi = parseInt(s.slice(11, 13), 10);
  const sc = parseInt(s.slice(13, 15), 10) || 0;
  return s.endsWith('Z')
    ? new Date(Date.UTC(y, mo, d, h, mi, sc))
    : new Date(y, mo, d, h, mi, sc);
}

/** Parse ISO 8601 duration string → milliseconds. */
function parseDuration(dur) {
  if (!dur) return 0;
  const m = dur.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!m) return 0;
  const [, w, dd, h, mi, s] = m;
  return (parseInt(w  || 0) * 7 * DAY_MS)
       + (parseInt(dd || 0) * DAY_MS)
       + (parseInt(h  || 0) * 3_600_000)
       + (parseInt(mi || 0) * 60_000)
       + (parseInt(s  || 0) * 1_000);
}

/** Parse RRULE string "FREQ=WEEKLY;BYDAY=MO,WE" → plain object. */
function parseRRule(str) {
  const rule: Record<string, string> = {};
  str.split(';').forEach(part => {
    const eq = part.indexOf('=');
    if (eq > 0) rule[part.slice(0, eq)] = part.slice(eq + 1);
  });
  return rule;
}

/** Convert a Date to a simple day-key for deduplication. */
function dayKey(dt) {
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

// ─── RRULE expansion ───────────────────────────────────────────────────────

/**
 * Expand a recurring rule into concrete start dates within [rangeStart, rangeEnd].
 * Returns sorted array of Date objects.
 *
 * Exported so useOccurrences can expand native recurring events.
 */
export function expandRRule(dtstart, rruleStr, exdates, rangeStart, rangeEnd) {
  const rule     = parseRRule(rruleStr);
  const freq     = rule.FREQ;
  if (!freq) return [new Date(dtstart)];

  const interval = parseInt(rule.INTERVAL || '1', 10);
  const maxCount = rule.COUNT ? parseInt(rule.COUNT, 10) : 500; // safe cap
  const until    = rule.UNTIL ? parseICSDate(rule.UNTIL) : null;
  const ceiling  = until
    ? new Date(Math.min(until.getTime(), rangeEnd.getTime()))
    : new Date(rangeEnd);

  // Parse BYDAY: "MO,FR" or "1MO,-1FR"
  const byDays = rule.BYDAY
    ? rule.BYDAY.split(',').map(s => {
        const m = s.match(/^([+-]?\d*)([A-Z]{2})$/);
        return m ? { n: m[1] ? parseInt(m[1], 10) : null, day: DAYS[m[2]] } : null;
      }).filter(Boolean)
    : null;

  const byMonthDays = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  const byMonths    = rule.BYMONTH    ? rule.BYMONTH.split(',').map(Number) : null;

  const exSet = new Set((exdates || []).map(d => dayKey(d)));

  const results = [];
  let count = 0;
  let period = new Date(dtstart);

  for (let iter = 0; iter < 2000 && period <= ceiling && count < maxCount; iter++) {
    const candidates = getCandidatesForPeriod(period, freq, byDays, byMonthDays, byMonths, dtstart);

    for (const c of candidates) {
      if (c < dtstart || c > ceiling) continue;
      if (exSet.has(dayKey(c))) continue;
      if (c >= rangeStart) {
        results.push(new Date(c));
        count++;
        if (count >= maxCount) break;
      }
    }

    period = advancePeriod(period, freq, interval);
  }

  return results.sort((a, b) => a - b);
}

/** Generate the concrete occurrence dates within a single recurrence period. */
function getCandidatesForPeriod(period, freq, byDays, byMonthDays, byMonths, dtstart) {
  // No modifiers → the period itself is the occurrence
  if (!byDays && !byMonthDays) {
    if (byMonths && !byMonths.includes(period.getMonth() + 1)) return [];
    return [new Date(period)];
  }

  const hms: [number, number, number] = [dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds()];

  if (freq === 'WEEKLY' && byDays) {
    // Expand all matching weekdays in the same week as `period`
    const weekSun = new Date(period);
    weekSun.setDate(weekSun.getDate() - weekSun.getDay()); // rewind to Sunday
    return byDays.map(bd => {
      const c = new Date(weekSun);
      c.setDate(weekSun.getDate() + bd.day);
      c.setHours(...hms, 0);
      return c;
    });
  }

  if (freq === 'MONTHLY') {
    if (byMonthDays) {
      return byMonthDays.flatMap(md => {
        const c = new Date(period.getFullYear(), period.getMonth(), md, ...hms, 0);
        return c.getMonth() === period.getMonth() ? [c] : [];
      });
    }
    if (byDays) {
      return byDays.flatMap(bd => nthWeekdayOfMonth(period.getFullYear(), period.getMonth(), bd, hms));
    }
  }

  if (freq === 'YEARLY') {
    const months = byMonths ?? [period.getMonth() + 1];
    return months.flatMap(mo => {
      if (byDays) {
        return byDays.flatMap(bd => nthWeekdayOfMonth(period.getFullYear(), mo - 1, bd, hms));
      }
      return [new Date(period.getFullYear(), mo - 1, period.getDate(), ...hms, 0)];
    });
  }

  return [new Date(period)];
}

/** Find the nth (or every) occurrence of a weekday in a given month. */
function nthWeekdayOfMonth(year, month, bd, hms) {
  if (bd.n === null) {
    // Every occurrence
    const days = [];
    const d = new Date(year, month, 1);
    while (d.getMonth() === month) {
      if (d.getDay() === bd.day) days.push(new Date(year, month, d.getDate(), ...hms, 0));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  if (bd.n > 0) {
    const d = new Date(year, month, 1);
    let occ = 0;
    while (d.getMonth() === month) {
      if (d.getDay() === bd.day && ++occ === bd.n) {
        return [new Date(year, month, d.getDate(), ...hms, 0)];
      }
      d.setDate(d.getDate() + 1);
    }
    return [];
  }

  // Negative (from end)
  const last = new Date(year, month + 1, 0);
  let occ = 0;
  while (last.getMonth() === month) {
    if (last.getDay() === bd.day && ++occ === Math.abs(bd.n)) {
      return [new Date(year, month, last.getDate(), ...hms, 0)];
    }
    last.setDate(last.getDate() - 1);
  }
  return [];
}

/** Advance a period by one recurrence interval. */
function advancePeriod(dt, freq, interval) {
  const next = new Date(dt);
  switch (freq) {
    case 'DAILY':   next.setDate(next.getDate() + interval);             break;
    case 'WEEKLY':  next.setDate(next.getDate() + 7 * interval);         break;
    case 'MONTHLY': next.setMonth(next.getMonth() + interval);           break;
    case 'YEARLY':  next.setFullYear(next.getFullYear() + interval);     break;
  }
  return next;
}

// ─── Property parsing ──────────────────────────────────────────────────────

/** Parse a VEVENT's raw lines into a property map. */
function parseBlock(lines) {
  const props = {};
  for (const line of lines) {
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    const rawKey = line.slice(0, ci).toUpperCase();
    const value  = line.slice(ci + 1);

    const si  = rawKey.indexOf(';');
    const key = si >= 0 ? rawKey.slice(0, si) : rawKey;
    const params = si >= 0 ? rawKey.slice(si + 1) : '';

    if (key === 'EXDATE' || key === 'RDATE') {
      if (!props[key]) props[key] = [];
      props[key].push(...value.split(',').map(s => s.trim()));
    } else {
      props[key] = { value: value.trim(), params };
    }
  }
  return props;
}

function val(props, key) { return props[key]?.value ?? null; }
function isDateOnly(props, key) { return (props[key]?.params ?? '').includes('VALUE=DATE'); }

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Parse an ICS text string into WorksCalendarEvent objects.
 *
 * @param {string} text - Raw .ics content
 * @param {object} [options]
 * @param {Date}   [options.rangeStart] - Start of expansion window (default: 1 year ago)
 * @param {Date}   [options.rangeEnd]   - End of expansion window   (default: 2 years from now)
 * @returns {import('../index.d.ts').WorksCalendarEvent[]}
 */
export function parseICS(text, options: { rangeStart?: Date; rangeEnd?: Date } = {}) {
  const today = new Date();
  const rangeStart = options.rangeStart ?? new Date(today.getFullYear() - 1, 0, 1);
  const rangeEnd   = options.rangeEnd   ?? new Date(today.getFullYear() + 2, 11, 31);

  const unfolded = unfold(text);
  const lines    = unfolded.split(/\r?\n/).filter(l => l.trim());

  const events  = [];
  let inEvent   = false;
  let evLines   = [];

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; evLines = []; continue; }
    if (line === 'END:VEVENT')   {
      inEvent = false;
      const parsed = parseVEvent(evLines, rangeStart, rangeEnd);
      if (parsed) events.push(...parsed);
      continue;
    }
    if (inEvent) evLines.push(line);
  }

  return events;
}

/** Parse one VEVENT block → 0..N WorksCalendarEvent objects (N>1 for recurring). */
function parseVEvent(lines, rangeStart, rangeEnd) {
  const props = parseBlock(lines);

  const uid        = val(props, 'UID') || `ical-${Math.random().toString(36).slice(2)}`;
  const summary    = val(props, 'SUMMARY') || '(untitled)';
  const desc       = val(props, 'DESCRIPTION');
  const location   = val(props, 'LOCATION');
  const statusRaw  = val(props, 'STATUS');
  const categories = val(props, 'CATEGORIES');
  const rruleStr   = val(props, 'RRULE');
  const dtStartStr = val(props, 'DTSTART');
  const dtEndStr   = val(props, 'DTEND');
  const durationStr= val(props, 'DURATION');
  const allDay     = isDateOnly(props, 'DTSTART');

  if (!dtStartStr) return null;
  const dtStart = parseICSDate(dtStartStr);
  if (!dtStart) return null;

  let dtEnd;
  if (dtEndStr) {
    dtEnd = parseICSDate(dtEndStr);
  } else if (durationStr) {
    dtEnd = new Date(dtStart.getTime() + parseDuration(durationStr));
  } else {
    dtEnd = allDay
      ? new Date(dtStart.getTime() + DAY_MS)
      : new Date(dtStart.getTime() + 3_600_000);
  }

  const durationMs = (dtEnd || new Date(dtStart.getTime() + 3_600_000)).getTime() - dtStart.getTime();

  const exdateStrs = props['EXDATE'] || [];
  const exdates = exdateStrs.flatMap(s => s.split(',')).map(s => parseICSDate(s.trim())).filter(Boolean);

  let status = 'confirmed';
  if (statusRaw === 'TENTATIVE') status = 'tentative';
  if (statusRaw === 'CANCELLED') status = 'cancelled';

  const meta: Record<string, string> = {};
  if (desc)     meta.description = desc.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
  if (location) meta.location    = location;

  const category = categories?.split(',')[0]?.trim() || null;

  const makeEvent = (start, idx) => ({
    id:       idx > 0 ? `${uid}-r${idx}` : uid,
    title:    summary,
    start,
    end:      new Date(start.getTime() + durationMs),
    allDay,
    category,
    status,
    meta,
  });

  if (rruleStr) {
    const starts = expandRRule(dtStart, rruleStr, exdates, rangeStart, rangeEnd);
    return starts.map((s, i) => makeEvent(s, i));
  }

  // Single occurrence — skip if outside range
  if (!dtEnd || dtEnd < rangeStart || dtStart > rangeEnd) return null;
  return [makeEvent(dtStart, 0)];
}

/**
 * Fetch an ICS feed URL and parse it.
 * Note: the server must allow CORS (or use a CORS proxy) for browser use.
 *
 * @param {string} url
 * @param {object} [options]
 * @returns {Promise<import('../index.d.ts').WorksCalendarEvent[]>}
 */
export async function fetchAndParseICS(url, options = {}) {
  const res = await fetch(url.replace(/^webcal:\/\//i, 'https://'));
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  return parseICS(text, options);
}

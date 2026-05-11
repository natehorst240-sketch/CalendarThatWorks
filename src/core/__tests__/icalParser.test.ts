import { describe, it, expect } from 'vitest'
import { parseICS, expandRRule } from '../icalParser.ts'

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal valid ICS string wrapping one or more VEVENT blocks. */
function ics(...events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

function vevent(props: Record<string, string>): string {
  const lines = ['BEGIN:VEVENT']
  for (const [k, v] of Object.entries(props)) lines.push(`${k}:${v}`)
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

// Fixed range so tests are deterministic regardless of system date
const rangeStart = new Date(2024, 0, 1)  // 2024-01-01
const rangeEnd   = new Date(2025, 11, 31) // 2025-12-31
const opts = { rangeStart, rangeEnd }

// ─── parseICS – basic single events ───────────────────────────────────────────

describe('parseICS – single non-recurring events', () => {
  it('parses a simple timed event', () => {
    const text = ics(vevent({
      UID: 'simple-1',
      SUMMARY: 'Team Meeting',
      DTSTART: '20240315T090000Z',
      DTEND: '20240315T100000Z',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    expect(ev['id']).toBe('simple-1')
    expect(ev['title']).toBe('Team Meeting')
    expect(ev['allDay']).toBe(false)
    expect(ev['status']).toBe('confirmed')
    expect(ev['start']).toBeInstanceOf(Date)
    expect(ev['end']).toBeInstanceOf(Date)
  })

  it('parses a DATE-only (all-day) event', () => {
    const text = ics(vevent({
      UID: 'allday-1',
      SUMMARY: 'Holiday',
      'DTSTART;VALUE=DATE': '20240704',
      'DTEND;VALUE=DATE': '20240705',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(1)
    expect(events[0]!['allDay']).toBe(true)
    expect(events[0]!['title']).toBe('Holiday')
  })

  it('uses (untitled) when SUMMARY is absent', () => {
    const text = ics(vevent({
      UID: 'notitle',
      DTSTART: '20240315T090000Z',
      DTEND: '20240315T100000Z',
    }))
    const events = parseICS(text, opts)
    expect(events[0]!['title']).toBe('(untitled)')
  })

  it('assigns a random uid when UID is absent', () => {
    const text = ics(vevent({
      SUMMARY: 'No UID',
      DTSTART: '20240315T090000Z',
      DTEND: '20240315T100000Z',
    }))
    const events = parseICS(text, opts)
    expect(typeof events[0]!['id']).toBe('string')
    expect((events[0]!['id'] as string).length).toBeGreaterThan(0)
  })

  it('returns [] for an event with no DTSTART', () => {
    const text = ics(vevent({
      UID: 'no-start',
      SUMMARY: 'Broken',
      DTEND: '20240315T100000Z',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(0)
  })

  it('skips events that end before rangeStart', () => {
    const text = ics(vevent({
      UID: 'past',
      SUMMARY: 'Ancient Event',
      DTSTART: '20200101T090000Z',
      DTEND: '20200101T100000Z',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(0)
  })

  it('skips events that start after rangeEnd', () => {
    const text = ics(vevent({
      UID: 'future',
      SUMMARY: 'Far Future',
      DTSTART: '20300101T090000Z',
      DTEND: '20300101T100000Z',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(0)
  })

  it('includes event whose start equals rangeStart boundary', () => {
    const text = ics(vevent({
      UID: 'boundary-start',
      SUMMARY: 'Boundary',
      DTSTART: '20240101T000000Z',
      DTEND: '20240101T010000Z',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(1)
  })
})

// ─── parseICS – duration fallback ─────────────────────────────────────────────

describe('parseICS – DURATION fallback for DTEND', () => {
  it('computes end from DURATION when DTEND is absent', () => {
    const text = ics(vevent({
      UID: 'dur-1',
      SUMMARY: 'Duration Event',
      DTSTART: '20240315T090000Z',
      DURATION: 'PT2H',
    }))
    const events = parseICS(text, opts)
    expect(events).toHaveLength(1)
    const ev = events[0]!
    const start = ev['start'] as Date
    const end   = ev['end'] as Date
    expect(end.getTime() - start.getTime()).toBe(2 * 3_600_000)
  })

  it('defaults timed event duration to 1 hour when no DTEND or DURATION', () => {
    const text = ics(vevent({
      UID: 'noend-1',
      SUMMARY: 'No End',
      DTSTART: '20240315T090000Z',
    }))
    const events = parseICS(text, opts)
    const ev = events[0]!
    const diff = (ev['end'] as Date).getTime() - (ev['start'] as Date).getTime()
    expect(diff).toBe(3_600_000)
  })

  it('defaults all-day event duration to 1 day when no DTEND or DURATION', () => {
    const text = ics(vevent({
      UID: 'allday-noend',
      SUMMARY: 'All Day No End',
      'DTSTART;VALUE=DATE': '20240315',
    }))
    const events = parseICS(text, opts)
    const ev = events[0]!
    const diff = (ev['end'] as Date).getTime() - (ev['start'] as Date).getTime()
    expect(diff).toBe(86_400_000)
  })
})

// ─── parseICS – STATUS ─────────────────────────────────────────────────────────

describe('parseICS – STATUS field', () => {
  it('maps STATUS:TENTATIVE correctly', () => {
    const text = ics(vevent({
      UID: 'tent-1',
      SUMMARY: 'Maybe',
      DTSTART: '20240315T090000Z',
      STATUS: 'TENTATIVE',
    }))
    expect(parseICS(text, opts)[0]!['status']).toBe('tentative')
  })

  it('maps STATUS:CANCELLED correctly', () => {
    const text = ics(vevent({
      UID: 'canc-1',
      SUMMARY: 'Cancelled',
      DTSTART: '20240315T090000Z',
      STATUS: 'CANCELLED',
    }))
    expect(parseICS(text, opts)[0]!['status']).toBe('cancelled')
  })

  it('defaults unknown STATUS to confirmed', () => {
    const text = ics(vevent({
      UID: 'conf-1',
      SUMMARY: 'Confirmed',
      DTSTART: '20240315T090000Z',
      STATUS: 'ANYTHING_ELSE',
    }))
    expect(parseICS(text, opts)[0]!['status']).toBe('confirmed')
  })
})

// ─── parseICS – meta fields ────────────────────────────────────────────────────

describe('parseICS – meta (description, location, categories)', () => {
  it('populates description in meta with escape sequences resolved', () => {
    const text = ics(vevent({
      UID: 'meta-desc',
      SUMMARY: 'With Desc',
      DTSTART: '20240315T090000Z',
      DESCRIPTION: 'Line1\\nLine2\\,comma\\\\backslash',
    }))
    const ev = parseICS(text, opts)[0]!
    expect((ev['meta'] as Record<string, string>)['description']).toBe('Line1\nLine2,comma\\backslash')
  })

  it('populates location in meta', () => {
    const text = ics(vevent({
      UID: 'meta-loc',
      SUMMARY: 'With Location',
      DTSTART: '20240315T090000Z',
      LOCATION: 'Conference Room A',
    }))
    const ev = parseICS(text, opts)[0]!
    expect((ev['meta'] as Record<string, string>)['location']).toBe('Conference Room A')
  })

  it('takes first category from comma-separated CATEGORIES', () => {
    const text = ics(vevent({
      UID: 'cats-1',
      SUMMARY: 'Categorised',
      DTSTART: '20240315T090000Z',
      CATEGORIES: 'Work,Personal,Urgent',
    }))
    expect(parseICS(text, opts)[0]!['category']).toBe('Work')
  })

  it('sets category to null when CATEGORIES is absent', () => {
    const text = ics(vevent({
      UID: 'nocat',
      SUMMARY: 'No Category',
      DTSTART: '20240315T090000Z',
    }))
    expect(parseICS(text, opts)[0]!['category']).toBeNull()
  })
})

// ─── parseICS – line unfolding ─────────────────────────────────────────────────

describe('parseICS – RFC 5545 line unfolding', () => {
  it('unfolds CRLF + space continuations (LWSP is stripped, not a space)', () => {
    // RFC 5545 §3.1: the CRLF and the leading whitespace are both removed.
    // "SUMMARY:Long\r\n TitleCont" → "SUMMARY:LongTitleCont" (no space added).
    const text =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold-1\r\n' +
      'SUMMARY:Long\r\n TitleContinues\r\n' +
      'DTSTART:20240315T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR'
    const events = parseICS(text, opts)
    expect(events[0]!['title']).toBe('LongTitleContinues')
  })

  it('unfolds CRLF + tab continuations', () => {
    const text =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold-2\r\n' +
      'SUMMARY:Tab\r\n\tFolded\r\n' +
      'DTSTART:20240315T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR'
    const events = parseICS(text, opts)
    // CRLF+tab is stripped; continuation is joined directly: "TabFolded"
    expect(events[0]!['title']).toBe('TabFolded')
  })

  it('parses a normally-folded long property after unfolding', () => {
    // Build a long description using two continuation lines
    const text =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:fold-3\r\n' +
      'SUMMARY:Normal\r\n' +
      'DESCRIPTION:Part1\r\n Part2\r\n Part3\r\n' +
      'DTSTART:20240315T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR'
    const events = parseICS(text, opts)
    // The description after unfolding becomes "Part1Part2Part3"
    expect((events[0]!['meta'] as Record<string, string>)['description']).toBe('Part1Part2Part3')
  })
})

// ─── parseICS – EXDATE ─────────────────────────────────────────────────────────

describe('parseICS – EXDATE exclusions on recurring events', () => {
  it('excludes specified dates from a daily recurrence', () => {
    // Note: COUNT in this implementation counts occurrences pushed into results,
    // not total occurrences from dtstart. So COUNT=5 with 1 exclusion still yields 5 results
    // (the excluded date is skipped and the next one fills its place).
    const text = ics(vevent({
      UID: 'exdate-1',
      SUMMARY: 'Daily',
      DTSTART: '20240101T090000Z',
      DTEND: '20240101T100000Z',
      RRULE: 'FREQ=DAILY;COUNT=5',
      EXDATE: '20240102T090000Z',
    }))
    const events = parseICS(text, opts)
    const starts = events.map(e => (e['start'] as Date).toISOString().slice(0, 10))
    expect(starts).not.toContain('2024-01-02')
    // 5 results, skipping Jan 2 → Jan 1, 3, 4, 5, 6
    expect(events).toHaveLength(5)
  })
})

// ─── parseICS – multiple events ────────────────────────────────────────────────

describe('parseICS – multiple events in one file', () => {
  it('parses two separate events', () => {
    const text = ics(
      vevent({ UID: 'ev1', SUMMARY: 'First',  DTSTART: '20240101T090000Z', DTEND: '20240101T100000Z' }),
      vevent({ UID: 'ev2', SUMMARY: 'Second', DTSTART: '20240201T090000Z', DTEND: '20240201T100000Z' }),
    )
    const events = parseICS(text, opts)
    expect(events).toHaveLength(2)
    const ids = events.map(e => e['id'])
    expect(ids).toContain('ev1')
    expect(ids).toContain('ev2')
  })
})

// ─── parseICS – default range (no options) ────────────────────────────────────

describe('parseICS – default date range', () => {
  it('accepts call without options and returns events near today', () => {
    const now = new Date()
    const dtStart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}T090000Z`
    const text = ics(vevent({
      UID: 'default-range',
      SUMMARY: 'Today',
      DTSTART: dtStart,
      DTEND: dtStart.replace('T090000Z', 'T100000Z'),
    }))
    const events = parseICS(text) // no options
    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── expandRRule – DAILY ───────────────────────────────────────────────────────

describe('expandRRule – DAILY frequency', () => {
  it('expands COUNT occurrences', () => {
    const dtstart = new Date(2024, 0, 1) // 2024-01-01
    const results = expandRRule(dtstart, 'FREQ=DAILY;COUNT=5', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(5)
    expect(results[0]!.toDateString()).toBe(new Date(2024, 0, 1).toDateString())
    expect(results[4]!.toDateString()).toBe(new Date(2024, 0, 5).toDateString())
  })

  it('respects INTERVAL=2 (every other day)', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=DAILY;COUNT=3;INTERVAL=2', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(3)
    expect(results[1]!.toDateString()).toBe(new Date(2024, 0, 3).toDateString())
    expect(results[2]!.toDateString()).toBe(new Date(2024, 0, 5).toDateString())
  })

  it('respects UNTIL boundary', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=DAILY;UNTIL=20240105T000000Z', null, rangeStart, rangeEnd)
    const dates = results.map(d => d.toDateString())
    expect(dates).toContain(new Date(2024, 0, 5).toDateString())
    expect(results.length).toBeLessThanOrEqual(5)
    // No date after Jan 5
    for (const d of results) expect(d.getTime()).toBeLessThanOrEqual(new Date(2024, 0, 5, 23, 59, 59).getTime())
  })

  it('excludes dates before rangeStart', () => {
    const dtstart = new Date(2023, 11, 28) // starts before range
    const results = expandRRule(dtstart, 'FREQ=DAILY;COUNT=10', null, rangeStart, rangeEnd)
    for (const d of results) expect(d >= rangeStart).toBe(true)
  })

  it('returns just dtstart when FREQ is missing', () => {
    const dtstart = new Date(2024, 0, 15)
    const results = expandRRule(dtstart, 'INTERVAL=1', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(1)
    expect(results[0]!.toDateString()).toBe(dtstart.toDateString())
  })
})

// ─── expandRRule – WEEKLY ──────────────────────────────────────────────────────

describe('expandRRule – WEEKLY frequency', () => {
  it('expands every Monday for 4 weeks', () => {
    const dtstart = new Date(2024, 0, 1) // Monday
    const results = expandRRule(dtstart, 'FREQ=WEEKLY;COUNT=4;BYDAY=MO', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(4)
    for (const d of results) expect(d.getDay()).toBe(1) // Monday = 1
  })

  it('expands MO and FR in the same week', () => {
    const dtstart = new Date(2024, 0, 1) // Mon
    const results = expandRRule(dtstart, 'FREQ=WEEKLY;COUNT=6;BYDAY=MO,FR', null, rangeStart, rangeEnd)
    // should have both Monday and Friday occurrences
    const days = results.map(d => d.getDay())
    expect(days).toContain(1)
    expect(days).toContain(5)
    expect(results).toHaveLength(6)
  })

  it('respects INTERVAL=2 (bi-weekly)', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=WEEKLY;COUNT=3;INTERVAL=2;BYDAY=MO', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(3)
    // Gap between first two should be 14 days
    const gap = results[1]!.getTime() - results[0]!.getTime()
    expect(gap).toBe(14 * 86_400_000)
  })

  it('applies EXDATE exclusions', () => {
    // COUNT counts pushes into results; excluded dates don't consume the count,
    // so COUNT=4 with 1 exclusion still yields 4 results (skipping Jan 8 and continuing).
    const dtstart = new Date(2024, 0, 1)
    const exdates = [new Date(2024, 0, 8)] // skip second Monday
    const results = expandRRule(dtstart, 'FREQ=WEEKLY;COUNT=4;BYDAY=MO', exdates, rangeStart, rangeEnd)
    const dateStrings = results.map(d => d.toDateString())
    expect(dateStrings).not.toContain(new Date(2024, 0, 8).toDateString())
    expect(results).toHaveLength(4) // excluded date is replaced by the next occurrence
  })
})

// ─── expandRRule – MONTHLY ─────────────────────────────────────────────────────

describe('expandRRule – MONTHLY frequency', () => {
  it('recurs on same date each month', () => {
    const dtstart = new Date(2024, 0, 15) // Jan 15
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=3', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(3)
    const dates = results.map(d => d.getDate())
    expect(dates).toEqual([15, 15, 15])
    const months = results.map(d => d.getMonth())
    expect(months).toEqual([0, 1, 2])
  })

  it('expands BYMONTHDAY', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=4;BYMONTHDAY=5,20', null, rangeStart, rangeEnd)
    const dates = results.map(d => d.getDate())
    expect(dates).toContain(5)
    expect(dates).toContain(20)
  })

  it('expands BYDAY (e.g. 2MO = 2nd Monday)', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=3;BYDAY=2MO', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(3)
    for (const d of results) expect(d.getDay()).toBe(1) // all Mondays
  })

  it('expands BYDAY with every weekday (no n prefix) — COUNT limits total pushes', () => {
    // COUNT=1 means only 1 total occurrence is returned, even though there are
    // multiple Mondays in the month. Use COUNT>1 to get multiple.
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=5;BYDAY=MO', null, rangeStart, rangeEnd)
    // January 2024 has 5 Mondays: 1, 8, 15, 22, 29
    expect(results.length).toBeGreaterThanOrEqual(4)
    for (const d of results) expect(d.getDay()).toBe(1)
  })

  it('expands BYDAY with negative n (-1MO = last Monday)', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=1;BYDAY=-1MO', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(1)
    expect(results[0]!.getDay()).toBe(1) // Monday
    // Last Monday of Jan 2024 is Jan 29
    expect(results[0]!.getDate()).toBe(29)
  })
})

// ─── expandRRule – YEARLY ──────────────────────────────────────────────────────

describe('expandRRule – YEARLY frequency', () => {
  it('recurs on same date each year', () => {
    const dtstart = new Date(2024, 2, 15) // Mar 15, 2024
    const results = expandRRule(dtstart, 'FREQ=YEARLY;COUNT=2', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(2)
    expect(results[0]!.getMonth()).toBe(2)
    expect(results[0]!.getDate()).toBe(15)
  })

  it('expands BYMONTH when dtstart month is in BYMONTH list', () => {
    // Without BYDAY/BYMONTHDAY, BYMONTH filters the period itself.
    // The period advances yearly from dtstart month. If dtstart month is in BYMONTH,
    // it will match on each yearly iteration.
    const dtstart = new Date(2024, 5, 1) // June 1, 2024 — June is month 6
    const results = expandRRule(dtstart, 'FREQ=YEARLY;COUNT=2;BYMONTH=6', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(2)
    for (const d of results) expect(d.getMonth()).toBe(5) // June
  })

  it('expands YEARLY with BYDAY and BYMONTH', () => {
    // First Monday of March every year
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=YEARLY;COUNT=2;BYMONTH=3;BYDAY=1MO', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(2)
    for (const d of results) {
      expect(d.getMonth()).toBe(2) // March
      expect(d.getDay()).toBe(1)   // Monday
    }
  })

  it('expands YEARLY with BYDAY (no n) across all matching months', () => {
    // BYDAY=MO with no n = every Monday in the target month; BYMONTH=3 = only March.
    // March 2024 has 4 Mondays: 4, 11, 18, 25. COUNT must be high enough to collect them.
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=YEARLY;COUNT=10;BYMONTH=3;BYDAY=MO', null, rangeStart, rangeEnd)
    // March 2024: 4 Mondays; March 2025: 4 Mondays → up to 8 total within rangeEnd
    expect(results.length).toBeGreaterThanOrEqual(4)
    for (const d of results) {
      expect(d.getDay()).toBe(1)   // all Mondays
      expect(d.getMonth()).toBe(2) // all in March
    }
  })
})

// ─── expandRRule – RRULE expansion edge cases ──────────────────────────────────

describe('expandRRule – edge cases', () => {
  it('returns empty array when rangeStart is after all occurrences', () => {
    // COUNT counts pushes with c >= rangeStart only, so occurrences before rangeStart
    // are skipped but don't consume the count. Use a rangeEnd before any occurrence.
    const dtstart = new Date(2024, 0, 1)
    const futureRangeStart = new Date(2026, 0, 1)
    const futureRangeEnd   = new Date(2026, 0, 31)
    // Daily but only 3 COUNT slots — since COUNT only counts >= rangeStart hits,
    // and dtstart is way before futureRangeStart, the loop will push occurrences
    // in Jan 2026 once it gets there (COUNT=3 pushes).
    // To truly get empty: use UNTIL before rangeStart.
    const results = expandRRule(dtstart, 'FREQ=DAILY;UNTIL=20240110T000000Z', null, futureRangeStart, futureRangeEnd)
    expect(results).toHaveLength(0)
  })

  it('excludes dates before rangeStart without consuming COUNT', () => {
    // If dtstart is before rangeStart, those early occurrences are skipped (not counted).
    // The COUNT budget is only spent on occurrences >= rangeStart.
    const dtstart = new Date(2023, 11, 28) // Dec 28 2023 — before rangeStart (Jan 1 2024)
    const results = expandRRule(dtstart, 'FREQ=WEEKLY;COUNT=3', null, rangeStart, rangeEnd)
    // First 1 occurrence (Dec 28) is before rangeStart and won't be pushed.
    // Jan 4, 11, 18 are in range → 3 results (COUNT=3 consumed by in-range occurrences)
    expect(results).toHaveLength(3)
    for (const d of results) expect(d >= rangeStart).toBe(true)
  })

  it('returns results sorted ascending', () => {
    const dtstart = new Date(2024, 0, 1)
    const results = expandRRule(dtstart, 'FREQ=DAILY;COUNT=5', null, rangeStart, rangeEnd)
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.getTime()).toBeGreaterThanOrEqual(results[i - 1]!.getTime())
    }
  })

  it('handles null exdates gracefully', () => {
    const dtstart = new Date(2024, 0, 1)
    expect(() => expandRRule(dtstart, 'FREQ=DAILY;COUNT=3', null, rangeStart, rangeEnd)).not.toThrow()
    expect(() => expandRRule(dtstart, 'FREQ=DAILY;COUNT=3', undefined, rangeStart, rangeEnd)).not.toThrow()
  })

  it('caps at safe limit of 500 when no COUNT or UNTIL', () => {
    const dtstart = new Date(2024, 0, 1)
    const bigEnd  = new Date(2030, 11, 31)
    const results = expandRRule(dtstart, 'FREQ=DAILY', null, rangeStart, bigEnd)
    expect(results.length).toBeLessThanOrEqual(500)
  })

  it('handles unknown BYDAY value gracefully (filters out nulls)', () => {
    const dtstart = new Date(2024, 0, 1)
    // 'XX' is not a valid day abbreviation — should be filtered out
    const results = expandRRule(dtstart, 'FREQ=WEEKLY;COUNT=3;BYDAY=MO,XX', null, rangeStart, rangeEnd)
    // Only MO is valid; XX should be dropped
    for (const d of results) expect(d.getDay()).toBe(1)
  })
})

// ─── parseICS – recurring event id generation ──────────────────────────────────

describe('parseICS – recurring event IDs', () => {
  it('gives the first recurrence the base UID', () => {
    const text = ics(vevent({
      UID: 'recur-uid',
      SUMMARY: 'Recurring',
      DTSTART: '20240101T090000Z',
      DTEND: '20240101T100000Z',
      RRULE: 'FREQ=DAILY;COUNT=3',
    }))
    const events = parseICS(text, opts)
    expect(events[0]!['id']).toBe('recur-uid')
  })

  it('suffixes subsequent recurrences with -r<index>', () => {
    const text = ics(vevent({
      UID: 'recur-uid',
      SUMMARY: 'Recurring',
      DTSTART: '20240101T090000Z',
      DTEND: '20240101T100000Z',
      RRULE: 'FREQ=DAILY;COUNT=3',
    }))
    const events = parseICS(text, opts)
    expect(events[1]!['id']).toBe('recur-uid-r1')
    expect(events[2]!['id']).toBe('recur-uid-r2')
  })

  it('recurring events share duration from the base event', () => {
    const text = ics(vevent({
      UID: 'recur-dur',
      SUMMARY: 'Recurring',
      DTSTART: '20240101T090000Z',
      DTEND: '20240101T110000Z', // 2 hours
      RRULE: 'FREQ=DAILY;COUNT=3',
    }))
    const events = parseICS(text, opts)
    for (const ev of events) {
      const dur = (ev['end'] as Date).getTime() - (ev['start'] as Date).getTime()
      expect(dur).toBe(2 * 3_600_000)
    }
  })
})

// ─── parseICS – datetime parsing ──────────────────────────────────────────────

describe('parseICS – datetime string formats', () => {
  it('parses UTC datetime (trailing Z)', () => {
    const text = ics(vevent({
      UID: 'utc',
      SUMMARY: 'UTC',
      DTSTART: '20240315T090000Z',
      DTEND: '20240315T100000Z',
    }))
    const ev = parseICS(text, opts)[0]!
    const start = ev['start'] as Date
    expect(start.toISOString()).toBe('2024-03-15T09:00:00.000Z')
  })

  it('parses local datetime (no trailing Z)', () => {
    const text = ics(vevent({
      UID: 'local',
      SUMMARY: 'Local',
      DTSTART: '20240315T090000',
      DTEND: '20240315T100000',
    }))
    const ev = parseICS(text, opts)[0]!
    const start = ev['start'] as Date
    // Local interpretation — year/month/day are correct
    expect(start.getFullYear()).toBe(2024)
    expect(start.getMonth()).toBe(2)   // March
    expect(start.getDate()).toBe(15)
    expect(start.getHours()).toBe(9)
  })

  it('handles seconds field (HHmmss)', () => {
    const text = ics(vevent({
      UID: 'secs',
      SUMMARY: 'Seconds',
      DTSTART: '20240315T093045Z',
      DTEND: '20240315T100000Z',
    }))
    const ev = parseICS(text, opts)[0]!
    const start = ev['start'] as Date
    expect(start.getUTCSeconds()).toBe(45)
  })
})

// ─── parseDuration helper (tested via DURATION property) ──────────────────────

describe('parseDuration – via DURATION property', () => {
  it('parses weeks: P1W', () => {
    const text = ics(vevent({
      UID: 'dur-w',
      SUMMARY: 'Week Event',
      DTSTART: '20240101T000000Z',
      DURATION: 'P1W',
    }))
    const ev = parseICS(text, opts)[0]!
    const dur = (ev['end'] as Date).getTime() - (ev['start'] as Date).getTime()
    expect(dur).toBe(7 * 86_400_000)
  })

  it('parses days and hours: P1DT2H', () => {
    const text = ics(vevent({
      UID: 'dur-dh',
      SUMMARY: 'Day+Hour',
      DTSTART: '20240101T000000Z',
      DURATION: 'P1DT2H',
    }))
    const ev = parseICS(text, opts)[0]!
    const dur = (ev['end'] as Date).getTime() - (ev['start'] as Date).getTime()
    expect(dur).toBe(86_400_000 + 2 * 3_600_000)
  })

  it('parses minutes and seconds: PT30M45S', () => {
    const text = ics(vevent({
      UID: 'dur-ms',
      SUMMARY: 'Minutes+Secs',
      DTSTART: '20240101T000000Z',
      DURATION: 'PT30M45S',
    }))
    const ev = parseICS(text, opts)[0]!
    const dur = (ev['end'] as Date).getTime() - (ev['start'] as Date).getTime()
    expect(dur).toBe(30 * 60_000 + 45 * 1_000)
  })
})

// ─── parseICS – BYMONTH filter without BYDAY on non-YEARLY ────────────────────

describe('expandRRule – BYMONTH filter on DAILY', () => {
  it('only includes dates in matching months when BYMONTH is set without BYDAY/BYMONTHDAY', () => {
    // No BYDAY or BYMONTHDAY: each period is the occurrence, gated by BYMONTH
    const dtstart = new Date(2024, 0, 15) // Jan 15
    // FREQ=MONTHLY, BYMONTH=3 → only March occurrences
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=5;BYMONTH=3', null, rangeStart, rangeEnd)
    // Only March should appear (one occurrence per year since MONTHLY)
    for (const d of results) expect(d.getMonth()).toBe(2)
  })
})

// ─── nthWeekdayOfMonth edge cases ─────────────────────────────────────────────

describe('expandRRule – nthWeekdayOfMonth edge cases', () => {
  it('returns empty when positive nth exceeds month (e.g. 5th Monday in a month with only 4)', () => {
    // February 2024: Mondays on 5, 12, 19, 26 — no 5th Monday
    const dtstart = new Date(2024, 1, 1) // Feb 1
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=1;BYDAY=5MO', null,
      new Date(2024, 1, 1), new Date(2024, 1, 29))
    // February 2024 has 4 Mondays only; 5MO should yield nothing for Feb
    expect(results).toHaveLength(0)
  })

  it('handles negative nthWeekday that exceeds available count (no match)', () => {
    // Need a month with fewer than 5 occurrences of the target weekday.
    // February 2024 is a leap year and has 5 Thursdays (1,8,15,22,29), so -5TH matches!
    // Use a non-leap year: February 2025 starts on Saturday, so Thursdays are 6,13,20,27 (only 4).
    const dtstart = new Date(2025, 1, 1) // Feb 2025
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;COUNT=1;BYDAY=-5TH', null,
      new Date(2025, 1, 1), new Date(2025, 1, 28))
    expect(results).toHaveLength(0)
  })
})

// ─── parseBlock – property parsing edge cases ──────────────────────────────────

describe('parseICS – property parsing edge cases', () => {
  it('handles multiple EXDATE lines', () => {
    // Two separate EXDATE lines — both should be excluded.
    // COUNT counts pushes into results (not total occurrences), so 2 excluded dates
    // still yields COUNT=5 total results; they just skip Jan 2 and Jan 3.
    const text =
      'BEGIN:VCALENDAR\r\n' +
      'BEGIN:VEVENT\r\n' +
      'UID:multi-exdate\r\n' +
      'SUMMARY:Daily\r\n' +
      'DTSTART:20240101T090000Z\r\n' +
      'DTEND:20240101T100000Z\r\n' +
      'RRULE:FREQ=DAILY;COUNT=5\r\n' +
      'EXDATE:20240102T090000Z\r\n' +
      'EXDATE:20240103T090000Z\r\n' +
      'END:VEVENT\r\n' +
      'END:VCALENDAR'
    const events = parseICS(text, opts)
    const starts = events.map(e => (e['start'] as Date).toISOString().slice(0, 10))
    expect(starts).not.toContain('2024-01-02')
    expect(starts).not.toContain('2024-01-03')
    expect(events).toHaveLength(5) // excluded dates replaced by next occurrences
  })

  it('ignores lines without a colon', () => {
    // A malformed line should not crash the parser
    const text =
      'BEGIN:VCALENDAR\r\n' +
      'BEGIN:VEVENT\r\n' +
      'UID:malformed\r\n' +
      'THIS_HAS_NO_COLON\r\n' +
      'SUMMARY:Ok\r\n' +
      'DTSTART:20240315T090000Z\r\n' +
      'END:VEVENT\r\n' +
      'END:VCALENDAR'
    expect(() => parseICS(text, opts)).not.toThrow()
    expect(parseICS(text, opts)[0]!['title']).toBe('Ok')
  })

  it('properties outside VEVENT are ignored', () => {
    const text =
      'BEGIN:VCALENDAR\r\n' +
      'X-WR-CALNAME:My Calendar\r\n' +
      'BEGIN:VEVENT\r\n' +
      'UID:outertest\r\n' +
      'SUMMARY:Inner\r\n' +
      'DTSTART:20240315T090000Z\r\n' +
      'END:VEVENT\r\n' +
      'END:VCALENDAR'
    const events = parseICS(text, opts)
    expect(events).toHaveLength(1)
    expect(events[0]!['title']).toBe('Inner')
  })

  it('handles semicolon parameters in property keys (e.g. DTSTART;TZID=...)', () => {
    const text =
      'BEGIN:VCALENDAR\r\n' +
      'BEGIN:VEVENT\r\n' +
      'UID:tzid-test\r\n' +
      'SUMMARY:Timezone Event\r\n' +
      'DTSTART;TZID=America/New_York:20240315T090000\r\n' +
      'DTEND;TZID=America/New_York:20240315T100000\r\n' +
      'END:VEVENT\r\n' +
      'END:VCALENDAR'
    const events = parseICS(text, opts)
    // Should still parse the value correctly (as local datetime)
    expect(events).toHaveLength(1)
    expect(events[0]!['title']).toBe('Timezone Event')
  })

  it('handles empty text with no events', () => {
    const text = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR'
    expect(parseICS(text, opts)).toEqual([])
  })

  it('handles completely empty string', () => {
    expect(parseICS('', opts)).toEqual([])
  })
})

// ─── getCandidatesForPeriod — branch coverage ──────────────────────────────────

describe('expandRRule — getCandidatesForPeriod branch coverage', () => {
  it('YEARLY with BYMONTHDAY (no BYDAY) hits line-193 return path', () => {
    // BYMONTHDAY makes byMonthDays non-null, bypassing the early `!byDays && !byMonthDays`
    // return.  Inside the YEARLY block, byDays is null so the `if (byDays)` FALSE path
    // is taken and line 193 constructs the date from month/day components.
    const dtstart = new Date(2024, 2, 15)  // Mar 15 2024
    const results = expandRRule(dtstart, 'FREQ=YEARLY;BYMONTHDAY=15;COUNT=2', null, rangeStart, rangeEnd)
    expect(results).toHaveLength(2)
    expect(results[0]!.getDate()).toBe(15)
    expect(results[1]!.getDate()).toBe(15)
    expect(results[0]!.getMonth()).toBe(2) // March
  })

  it('DAILY with BYMONTHDAY hits line-197 fallback return', () => {
    // DAILY frequency does not have a special handler in getCandidatesForPeriod —
    // the BYMONTHDAY modifier is present (making byMonthDays non-null, bypassing the
    // early return), but none of the WEEKLY/MONTHLY/YEARLY branches match, so the
    // final `return [new Date(period)]` fallback on line 197 is taken.
    const dtstart = new Date(2024, 0, 1)  // Jan 1 2024
    const results = expandRRule(dtstart, 'FREQ=DAILY;BYMONTHDAY=1;COUNT=3', null, rangeStart, rangeEnd)
    // Returns 3 occurrences (BYMONTHDAY is ignored for DAILY in this implementation)
    expect(results).toHaveLength(3)
  })

  it('MONTHLY with BYMONTHDAY overflow skips invalid dates (line-179 cond-expr FALSE)', () => {
    // BYMONTHDAY=31 for February 2024 (29 days): new Date(2024, 1, 31) overflows to
    // March, making c.getMonth() !== period.getMonth() → returns [] for that month.
    const dtstart = new Date(2024, 1, 1)  // Feb 1 2024
    const results = expandRRule(dtstart, 'FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', null,
      new Date(2024, 1, 1), new Date(2024, 6, 31))
    // Feb and Apr don't have day 31; Jan, Mar, May, Jul do.
    // Starting from Feb 2024: Feb (skip), Mar 31, Apr (skip), May 31, Jun (skip), Jul 31
    // Since dtstart is Feb 2024 and rangeStart is also Feb 2024, we get 3 valid ones.
    expect(results.every(d => d.getDate() === 31)).toBe(true)
  })
})

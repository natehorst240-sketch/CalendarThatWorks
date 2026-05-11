import { describe, it, expect } from 'vitest';
import { validateChange } from '../validator';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const d = (iso: string) => new Date(iso);

function makeChange(overrides: Partial<Parameters<typeof validateChange>[0]> = {}) {
  return {
    type:     'move',
    newStart: d('2026-06-10T09:00:00Z'),
    newEnd:   d('2026-06-10T10:00:00Z'),
    ...overrides,
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id:       'ev-1',
    title:    'Meeting',
    resource: 'emp-1',
    allDay:   false,
    start:    d('2026-06-10T08:00:00Z'),
    end:      d('2026-06-10T09:00:00Z'),
    ...overrides,
  };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('validateChange — clean case', () => {
  it('returns allowed=true, severity=none for a valid change', () => {
    const result = validateChange(makeChange());
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe('none');
    expect(result.violations).toHaveLength(0);
    expect(result.suggestedChange).toBeNull();
  });

  it('works when context is omitted', () => {
    const result = validateChange(makeChange());
    expect(result.allowed).toBe(true);
  });
});

// ─── checkInvalidDuration ─────────────────────────────────────────────────────

describe('validateChange — checkInvalidDuration', () => {
  it('returns hard violation when end === start', () => {
    const result = validateChange(makeChange({
      newStart: d('2026-06-10T09:00:00Z'),
      newEnd:   d('2026-06-10T09:00:00Z'),
    }));
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('hard');
    const v = result.violations.find(v => v.rule === 'invalid-duration');
    expect(v).toBeDefined();
  });

  it('returns hard violation when end is before start', () => {
    const result = validateChange(makeChange({
      newStart: d('2026-06-10T11:00:00Z'),
      newEnd:   d('2026-06-10T09:00:00Z'),
    }));
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('hard');
  });

  it('passes when end is 1ms after start', () => {
    const start = d('2026-06-10T09:00:00Z');
    const end   = new Date(start.getTime() + 1);
    const result = validateChange(makeChange({ newStart: start, newEnd: end }));
    expect(result.violations.find(v => v.rule === 'invalid-duration')).toBeUndefined();
  });
});

// ─── checkBlockedWindow ───────────────────────────────────────────────────────

describe('validateChange — checkBlockedWindow', () => {
  const window = {
    start:  d('2026-06-10T08:00:00Z'),
    end:    d('2026-06-10T12:00:00Z'),
    reason: 'Maintenance downtime',
  };

  it('returns hard violation when change overlaps a blocked window', () => {
    const result = validateChange(makeChange(), { blockedWindows: [window] });
    expect(result.allowed).toBe(false);
    const v = result.violations.find(v => v.rule === 'blocked-window');
    expect(v!.severity).toBe('hard');
    expect(v!.message).toContain('Maintenance downtime');
  });

  it('passes when change does not overlap the blocked window', () => {
    const result = validateChange(
      makeChange({ newStart: d('2026-06-10T13:00:00Z'), newEnd: d('2026-06-10T14:00:00Z') }),
      { blockedWindows: [window] },
    );
    expect(result.violations.find(v => v.rule === 'blocked-window')).toBeUndefined();
  });

  it('skips blocked window for a different resource', () => {
    const resourceWindow = { ...window, resource: 'emp-2' };
    const result = validateChange(
      makeChange({ event: makeEvent({ resource: 'emp-1' }) }),
      { blockedWindows: [resourceWindow] },
    );
    expect(result.violations.find(v => v.rule === 'blocked-window')).toBeUndefined();
  });

  it('applies global window (no resource) to any event', () => {
    const result = validateChange(
      makeChange({ event: makeEvent({ resource: 'emp-1' }) }),
      { blockedWindows: [window] },
    );
    expect(result.violations.find(v => v.rule === 'blocked-window')).toBeDefined();
  });

  it('includes resource name in message when resource is set and no reason given', () => {
    const noReason = { start: window.start, end: window.end };
    const result = validateChange(
      makeChange({ event: makeEvent({ resource: 'emp-1' }) }),
      { blockedWindows: [noReason] },
    );
    const v = result.violations.find(v => v.rule === 'blocked-window');
    expect(v!.message).toContain('emp-1');
  });

  it('uses generic message when no resource and no reason', () => {
    const noReason = { start: window.start, end: window.end };
    const result = validateChange(makeChange(), { blockedWindows: [noReason] });
    const v = result.violations.find(v => v.rule === 'blocked-window');
    expect(v!.message).toContain('blocked');
  });

  it('parses string start/end for blocked windows', () => {
    const strWindow = {
      start: '2026-06-10T08:00:00Z',
      end:   '2026-06-10T12:00:00Z',
    };
    const result = validateChange(makeChange(), { blockedWindows: [strWindow] });
    expect(result.violations.find(v => v.rule === 'blocked-window')).toBeDefined();
  });

  it('returns clean when blockedWindows is empty', () => {
    const result = validateChange(makeChange(), { blockedWindows: [] });
    expect(result.violations.find(v => v.rule === 'blocked-window')).toBeUndefined();
  });
});

// ─── checkOverlap ─────────────────────────────────────────────────────────────

describe('validateChange — checkOverlap', () => {
  const existing = {
    id:       'ev-existing',
    title:    'Other Meeting',
    resource: 'emp-1',
    allDay:   false,
    start:    d('2026-06-10T08:00:00Z'),
    end:      d('2026-06-10T10:00:00Z'),
  };

  it('returns soft violation when same-resource events overlap', () => {
    const result = validateChange(
      makeChange({ event: makeEvent(), resource: 'emp-1' }),
      { events: [existing as any] },
    );
    const v = result.violations.find(v => v.rule === 'overlap');
    expect(v!.severity).toBe('soft');
    expect(v!.message).toContain('emp-1');
  });

  it('skips overlap check when no resource is set', () => {
    const result = validateChange(
      makeChange({ event: makeEvent({ resource: null }) }),
      { events: [existing as any] },
    );
    expect(result.violations.find(v => v.rule === 'overlap')).toBeUndefined();
  });

  it('skips self when event.id matches existing.id', () => {
    const result = validateChange(
      makeChange({ event: makeEvent({ id: 'ev-existing', resource: 'emp-1' }) }),
      { events: [existing as any] },
    );
    expect(result.violations.find(v => v.rule === 'overlap')).toBeUndefined();
  });

  it('skips all-day events in overlap check', () => {
    const allDayExisting = { ...existing, allDay: true };
    const result = validateChange(
      makeChange({ event: makeEvent(), resource: 'emp-1' }),
      { events: [allDayExisting as any] },
    );
    expect(result.violations.find(v => v.rule === 'overlap')).toBeUndefined();
  });

  it('skips events for different resource', () => {
    const result = validateChange(
      makeChange({ event: makeEvent({ resource: 'emp-2' }) }),
      { events: [existing as any] },
    );
    expect(result.violations.find(v => v.rule === 'overlap')).toBeUndefined();
  });

  it('is clean when events list is empty', () => {
    const result = validateChange(
      makeChange({ event: makeEvent(), resource: 'emp-1' }),
      { events: [] },
    );
    expect(result.violations.find(v => v.rule === 'overlap')).toBeUndefined();
  });
});

// ─── checkBusinessHours ───────────────────────────────────────────────────────

describe('validateChange — checkBusinessHours', () => {
  const biz = { days: [1, 2, 3, 4, 5], start: 8, end: 18 };

  it('returns soft violation when start is on a weekend', () => {
    // 2026-06-07 is a Sunday (day 0)
    const result = validateChange(
      makeChange({ newStart: d('2026-06-07T09:00:00Z'), newEnd: d('2026-06-07T10:00:00Z') }),
      { businessHours: biz },
    );
    const v = result.violations.find(v => v.rule === 'outside-business-hours');
    expect(v!.severity).toBe('soft');
    expect(v!.message).toContain('day');
  });

  it('returns soft violation when start is before business hours', () => {
    // 2026-06-08 is a Monday
    const result = validateChange(
      makeChange({ newStart: d('2026-06-08T06:00:00Z'), newEnd: d('2026-06-08T07:00:00Z') }),
      { businessHours: biz },
    );
    const v = result.violations.find(v => v.rule === 'outside-business-hours');
    expect(v!.message).toContain('time');
  });

  it('returns soft violation when end is after business hours', () => {
    const result = validateChange(
      makeChange({ newStart: d('2026-06-08T17:00:00Z'), newEnd: d('2026-06-08T19:00:00Z') }),
      { businessHours: biz },
    );
    const v = result.violations.find(v => v.rule === 'outside-business-hours');
    expect(v).toBeDefined();
  });

  it('passes when event is within business hours on a weekday', () => {
    const result = validateChange(
      makeChange({ newStart: d('2026-06-08T09:00:00Z'), newEnd: d('2026-06-08T10:00:00Z') }),
      { businessHours: biz },
    );
    expect(result.violations.find(v => v.rule === 'outside-business-hours')).toBeUndefined();
  });

  it('skips business hours check when businessHours is absent', () => {
    const result = validateChange(makeChange());
    expect(result.violations.find(v => v.rule === 'outside-business-hours')).toBeUndefined();
  });

  it('skips business hours check for allDay events', () => {
    const result = validateChange(
      makeChange({ event: makeEvent({ allDay: true }) }),
      { businessHours: biz },
    );
    expect(result.violations.find(v => v.rule === 'outside-business-hours')).toBeUndefined();
  });

  it('skips business hours for events spanning 24+ hours', () => {
    const result = validateChange(
      makeChange({
        newStart: d('2026-06-07T09:00:00Z'),
        newEnd:   d('2026-06-08T10:00:00Z'), // 25h span
      }),
      { businessHours: biz },
    );
    expect(result.violations.find(v => v.rule === 'outside-business-hours')).toBeUndefined();
  });

  it('defaults to weekdays Mon-Fri when days is absent', () => {
    const bizNoDays = { start: 8, end: 18 };
    // Sunday (day 0) should be outside by default
    const result = validateChange(
      makeChange({ newStart: d('2026-06-07T09:00:00Z'), newEnd: d('2026-06-07T10:00:00Z') }),
      { businessHours: bizNoDays },
    );
    const v = result.violations.find(v => v.rule === 'outside-business-hours');
    expect(v!.message).toContain('day');
  });
});

// ─── Severity aggregation ─────────────────────────────────────────────────────

describe('validateChange — severity aggregation', () => {
  it('severity is hard when any violation is hard', () => {
    // Zero duration (hard) + overlap (soft)
    const existing = { id: 'ev-x', title: 'X', resource: 'emp-1', allDay: false,
      start: d('2026-06-10T09:00:00Z'), end: d('2026-06-10T10:00:00Z') };
    const result = validateChange(
      makeChange({
        newStart: d('2026-06-10T09:00:00Z'),
        newEnd:   d('2026-06-10T09:00:00Z'), // zero duration → hard
        event:    makeEvent(),
        resource: 'emp-1',
      }),
      { events: [existing as any] },
    );
    expect(result.severity).toBe('hard');
    expect(result.allowed).toBe(false);
  });

  it('severity is soft when only soft violations exist', () => {
    const existing = { id: 'ev-x', title: 'X', resource: 'emp-1', allDay: false,
      start: d('2026-06-10T08:00:00Z'), end: d('2026-06-10T10:00:00Z') };
    const result = validateChange(
      makeChange({ event: makeEvent(), resource: 'emp-1' }),
      { events: [existing as any] },
    );
    expect(result.severity).toBe('soft');
    expect(result.allowed).toBe(true);
  });
});

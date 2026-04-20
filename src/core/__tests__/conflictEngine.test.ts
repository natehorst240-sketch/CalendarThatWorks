/**
 * conflictEngine — unit specs (ticket #134-13).
 *
 * Owner-configurable conflict detection. These specs pin the built-in rule
 * semantics (resource-overlap, category-mutex, min-rest) and the engine's
 * aggregation + allowed/severity contract. Runtime consumers rely on
 * `allowed === false` for hard violations and truthy `violations[]` for soft
 * ones — so a regression here would silently break the ConflictModal.
 */
import { describe, it, expect } from 'vitest';

import {
  evaluateConflicts,
  type ConflictEvent,
  type ConflictRule,
} from '../conflictEngine';
import type { EngineResource } from '../engine/schema/resourceSchema';
import { makeAssignment, type Assignment } from '../engine/schema/assignmentSchema';
import type { CategoryDef } from '../../types/assets';
import type { Hold } from '../holds/holdRegistry';
import type { AvailabilityRule } from '../availability/availabilityRule';

const day = (d: number, h = 9, m = 0) => new Date(2026, 3, d, h, m);

const base: ConflictEvent = {
  id: 'proposed',
  start: day(10, 9),
  end:   day(10, 11),
  resource: 'N100',
  category: 'flight',
};

describe('conflictEngine — no-op paths', () => {
  it('returns allowed=true with no violations when `enabled` is false', () => {
    const result = evaluateConflicts({
      proposed: base,
      events: [{ ...base, id: 'other' }],
      rules: [{ id: 'r1', type: 'resource-overlap' }],
      enabled: false,
    });
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe('none');
    expect(result.violations).toEqual([]);
  });

  it('returns allowed=true when rules[] is empty', () => {
    const result = evaluateConflicts({
      proposed: base,
      events: [{ ...base, id: 'other' }],
      rules: [],
    });
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('skips the proposed event itself (same id)', () => {
    const result = evaluateConflicts({
      proposed: { ...base, id: 'e1' },
      events: [{ ...base, id: 'e1' }],
      rules: [{ id: 'r1', type: 'resource-overlap' }],
    });
    expect(result.allowed).toBe(true);
  });
});

describe('conflictEngine — resource-overlap rule', () => {
  const rule: ConflictRule = { id: 'ovr', type: 'resource-overlap', severity: 'hard' };

  it('flags an overlapping same-resource event as hard', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
      category: 'maintenance',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [rule] });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('hard');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].conflictingEventId).toBe('e1');
  });

  it('ignores a non-overlapping event', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(11, 9),
      end:   day(11, 11),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [rule] });
    expect(result.allowed).toBe(true);
  });

  it('ignores a different-resource event', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N200',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [rule] });
    expect(result.allowed).toBe(true);
  });

  it('treats touching endpoints (aEnd === bStart) as NOT overlapping', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 11),
      end:   day(10, 13),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [rule] });
    expect(result.allowed).toBe(true);
  });

  it('respects the ignoreCategories allowlist', () => {
    const ignoreRule: ConflictRule = {
      id: 'ovr',
      type: 'resource-overlap',
      severity: 'hard',
      ignoreCategories: ['flight'],
    };
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [ignoreRule] });
    expect(result.allowed).toBe(true);
  });

  it('accepts soft severity and sets allowed=true', () => {
    const softRule: ConflictRule = { id: 'ovr', type: 'resource-overlap', severity: 'soft' };
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [softRule] });
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe('soft');
    expect(result.violations).toHaveLength(1);
  });
});

describe('conflictEngine — category-mutex rule', () => {
  const rule: ConflictRule = {
    id: 'pto-shift',
    type: 'category-mutex',
    severity: 'hard',
    categories: ['pto', 'shift'],
  };

  it('flags overlapping events whose categories are both in the mutex set', () => {
    const proposed: ConflictEvent = { ...base, id: 'req', category: 'pto' };
    const shift: ConflictEvent = {
      id: 's1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
      category: 'shift',
    };
    const result = evaluateConflicts({ proposed, events: [shift], rules: [rule] });
    expect(result.allowed).toBe(false);
    expect(result.violations[0].details).toMatchObject({ type: 'category-mutex' });
  });

  it('does not flag when only one side is in the mutex set', () => {
    const proposed: ConflictEvent = { ...base, id: 'req', category: 'meeting' };
    const shift: ConflictEvent = {
      id: 's1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
      category: 'shift',
    };
    const result = evaluateConflicts({ proposed, events: [shift], rules: [rule] });
    expect(result.allowed).toBe(true);
  });

  it('does not flag when same category on both sides', () => {
    const proposed: ConflictEvent = { ...base, id: 'req', category: 'pto' };
    const other: ConflictEvent = {
      id: 's1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
      category: 'pto',
    };
    const result = evaluateConflicts({ proposed, events: [other], rules: [rule] });
    expect(result.allowed).toBe(true);
  });

  it('no-ops when categories[] has fewer than two entries', () => {
    const badRule: ConflictRule = { ...rule, categories: ['pto'] };
    const proposed: ConflictEvent = { ...base, id: 'req', category: 'pto' };
    const shift: ConflictEvent = {
      id: 's1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
      category: 'shift',
    };
    const result = evaluateConflicts({ proposed, events: [shift], rules: [badRule] });
    expect(result.allowed).toBe(true);
  });
});

describe('conflictEngine — min-rest rule', () => {
  const rule: ConflictRule = { id: 'rest', type: 'min-rest', severity: 'soft', minutes: 60 };

  it('flags when the gap is shorter than the required rest', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 11, ), // proposed ends at 11:00, this starts at 11:30
      end:   day(10, 13),
      resource: 'N100',
    };
    // Nudge start to 11:30 so gap = 30 min.
    const otherClose: ConflictEvent = {
      ...other,
      start: new Date(2026, 3, 10, 11, 30),
    };
    const result = evaluateConflicts({
      proposed: base,
      events: [otherClose],
      rules: [rule],
    });
    expect(result.allowed).toBe(true); // soft severity
    expect(result.severity).toBe('soft');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({ type: 'min-rest' });
  });

  it('does not flag when the gap meets the rest requirement', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 12, ),
      end:   day(10, 14),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [rule] });
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('does not flag overlapping events (overlap owned by resource-overlap rule)', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [rule] });
    expect(result.allowed).toBe(true);
  });

  it('no-ops when minutes <= 0', () => {
    const zeroRule: ConflictRule = { ...rule, minutes: 0 };
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 11, 30),
      end:   day(10, 13),
      resource: 'N100',
    };
    const result = evaluateConflicts({ proposed: base, events: [other], rules: [zeroRule] });
    expect(result.allowed).toBe(true);
  });
});

describe('conflictEngine — aggregation', () => {
  it('collects violations from multiple rules; severity is worst-case', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
      category: 'shift',
    };
    const proposed: ConflictEvent = { ...base, category: 'pto' };
    const rules: ConflictRule[] = [
      { id: 'ovr',       type: 'resource-overlap', severity: 'soft' },
      { id: 'pto-shift', type: 'category-mutex',   severity: 'hard', categories: ['pto', 'shift'] },
    ];
    const result = evaluateConflicts({ proposed, events: [other], rules });
    expect(result.violations).toHaveLength(2);
    expect(result.severity).toBe('hard');
    expect(result.allowed).toBe(false);
  });

  it('returns severity=soft when every violation is soft', () => {
    const other: ConflictEvent = {
      id: 'e1',
      start: day(10, 10),
      end:   day(10, 12),
      resource: 'N100',
    };
    const rules: ConflictRule[] = [
      { id: 'ovr', type: 'resource-overlap', severity: 'soft' },
    ];
    const result = evaluateConflicts({ proposed: base, events: [other], rules });
    expect(result.severity).toBe('soft');
    expect(result.allowed).toBe(true);
  });
});

// ─── Capacity overflow — issue #210 ──────────────────────────────────────────

describe('conflictEngine — capacity-overflow rule', () => {
  const rule: ConflictRule = { id: 'cap', type: 'capacity-overflow' };
  const room: EngineResource = {
    id: 'N100',
    name: 'Conf Room A',
    capacity: 2,
  };
  const resources = new Map<string, EngineResource>([[room.id, room]]);

  it('flags overflow when three full-unit events overlap a capacity-2 resource', () => {
    const a: ConflictEvent = { id: 'a', start: day(10, 10), end: day(10, 12), resource: 'N100' };
    const b: ConflictEvent = { id: 'b', start: day(10, 9),  end: day(10, 11), resource: 'N100' };
    const result = evaluateConflicts({
      proposed: base,     // 9-11 on N100
      events:   [a, b],
      rules:    [rule],
      resources,
    });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('hard');
    expect(result.violations[0]).toMatchObject({
      rule: 'cap',
      details: { type: 'capacity-overflow' },
    });
  });

  it('does NOT flag when fewer events overlap than capacity allows', () => {
    const a: ConflictEvent = { id: 'a', start: day(10, 10), end: day(10, 12), resource: 'N100' };
    const result = evaluateConflicts({
      proposed: base,
      events:   [a],
      rules:    [rule],
      resources,
    });
    expect(result.allowed).toBe(true);
  });

  it('respects partial assignment units (half-allocation)', () => {
    // Three half-unit assignments = 150 units total, capacity 200 → allowed.
    const a: ConflictEvent = { id: 'a', start: day(10, 10), end: day(10, 12), resource: 'N100' };
    const b: ConflictEvent = { id: 'b', start: day(10, 9),  end: day(10, 11), resource: 'N100' };
    const assignments = new Map<string, Assignment>([
      ['asn-base', makeAssignment('asn-base', { eventId: base.id, resourceId: 'N100', units: 50 })],
      ['asn-a',    makeAssignment('asn-a',    { eventId: 'a',     resourceId: 'N100', units: 50 })],
      ['asn-b',    makeAssignment('asn-b',    { eventId: 'b',     resourceId: 'N100', units: 50 })],
    ]);
    const result = evaluateConflicts({
      proposed: base,
      events:   [a, b],
      rules:    [rule],
      resources,
      assignments,
    });
    expect(result.allowed).toBe(true);
  });

  it('skips when capacity is null (unlimited)', () => {
    const unlimited = new Map<string, EngineResource>([
      ['N100', { id: 'N100', name: 'Open', capacity: null }],
    ]);
    const a: ConflictEvent = { id: 'a', start: day(10, 10), end: day(10, 12), resource: 'N100' };
    const b: ConflictEvent = { id: 'b', start: day(10, 9),  end: day(10, 11), resource: 'N100' };
    const result = evaluateConflicts({
      proposed: base,
      events:   [a, b],
      rules:    [rule],
      resources: unlimited,
    });
    expect(result.allowed).toBe(true);
  });

  it('skips when `resources` map is not provided (cannot evaluate)', () => {
    const result = evaluateConflicts({
      proposed: base,
      events:   [],
      rules:    [rule],
    });
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('respects ignoreCategories', () => {
    const skipRule: ConflictRule = {
      id: 'cap', type: 'capacity-overflow', ignoreCategories: ['flight'],
    };
    const a: ConflictEvent = { id: 'a', start: day(10, 10), end: day(10, 12), resource: 'N100' };
    const b: ConflictEvent = { id: 'b', start: day(10, 9),  end: day(10, 11), resource: 'N100' };
    const result = evaluateConflicts({
      proposed: base, events: [a, b], rules: [skipRule], resources,
    });
    expect(result.allowed).toBe(true);
  });

  it('only counts events overlapping the proposed window', () => {
    // `a` and `b` are outside the 9-11 proposed window
    const a: ConflictEvent = { id: 'a', start: day(10, 13), end: day(10, 15), resource: 'N100' };
    const b: ConflictEvent = { id: 'b', start: day(10, 15), end: day(10, 17), resource: 'N100' };
    const result = evaluateConflicts({
      proposed: base, events: [a, b], rules: [rule], resources,
    });
    expect(result.allowed).toBe(true);
  });
});

// ─── Outside business hours — issue #210 ─────────────────────────────────────

describe('conflictEngine — outside-business-hours rule', () => {
  const rule: ConflictRule = { id: 'bh', type: 'outside-business-hours' };
  const withHours = (bh: EngineResource['businessHours']): Map<string, EngineResource> =>
    new Map([[ 'N100', {
      id: 'N100', name: 'Conf Room A', businessHours: bh, timezone: 'UTC',
    }]]);

  it('flags an event on a non-working day (Sunday, when M–F only)', () => {
    // 2026-04-12 is a Sunday.
    const sunday = new Date(Date.UTC(2026, 3, 12, 10, 0));
    const sundayEnd = new Date(Date.UTC(2026, 3, 12, 11, 0));
    const proposed: ConflictEvent = { ...base, start: sunday, end: sundayEnd };
    const resources = withHours({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' });
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.allowed).toBe(true); // soft by default
    expect(result.severity).toBe('soft');
    expect(result.violations[0].details).toMatchObject({ reason: 'closed-day' });
  });

  it('flags an event starting before business-hours open', () => {
    const earlyStart = new Date(Date.UTC(2026, 3, 13, 7, 0));  // Mon 07:00 UTC
    const earlyEnd   = new Date(Date.UTC(2026, 3, 13, 8, 0));
    const proposed: ConflictEvent = { ...base, start: earlyStart, end: earlyEnd };
    const resources = withHours({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' });
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.violations[0].details).toMatchObject({ reason: 'outside-hours' });
  });

  it('flags an event ending after business-hours close', () => {
    const lateStart = new Date(Date.UTC(2026, 3, 13, 16, 30)); // Mon 16:30
    const lateEnd   = new Date(Date.UTC(2026, 3, 13, 18, 0));  // past 17:00
    const proposed: ConflictEvent = { ...base, start: lateStart, end: lateEnd };
    const resources = withHours({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' });
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.violations).toHaveLength(1);
  });

  it('allows an event fully inside business hours on a working day', () => {
    const okStart = new Date(Date.UTC(2026, 3, 13, 10, 0));    // Mon 10:00
    const okEnd   = new Date(Date.UTC(2026, 3, 13, 11, 0));
    const proposed: ConflictEvent = { ...base, start: okStart, end: okEnd };
    const resources = withHours({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' });
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.violations).toEqual([]);
  });

  it('respects resource timezone (event at midnight UTC = 19:00 America/New_York → inside)', () => {
    // 2026-04-14 00:00 UTC = 2026-04-13 20:00 EDT (NY is UTC-4 in April).
    const proposed: ConflictEvent = {
      ...base,
      start: new Date(Date.UTC(2026, 3, 14, 0, 0)),
      end:   new Date(Date.UTC(2026, 3, 14, 1, 0)),
    };
    const nyResources = new Map<string, EngineResource>([[
      'N100',
      {
        id: 'N100', name: 'NY Room',
        businessHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '21:00' },
        timezone: 'America/New_York',
      },
    ]]);
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources: nyResources });
    expect(result.violations).toEqual([]); // 20:00 NYC is inside 09:00-21:00
  });

  it('skips when the resource has no businessHours', () => {
    const resources = new Map<string, EngineResource>([[ 'N100', { id: 'N100', name: 'No hours' } ]]);
    const result = evaluateConflicts({ proposed: base, events: [], rules: [rule], resources });
    expect(result.violations).toEqual([]);
  });

  it('skips multi-day events', () => {
    const proposed: ConflictEvent = {
      ...base,
      start: new Date(Date.UTC(2026, 3, 13, 0, 0)),
      end:   new Date(Date.UTC(2026, 3, 15, 0, 0)),
    };
    const resources = withHours({ days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' });
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.violations).toEqual([]);
  });
});

describe('conflictEngine — policy-violation rule (#213)', () => {
  const rule: ConflictRule = { id: 'pol', type: 'policy-violation' };

  const categoryMap = (policy: CategoryDef['policy']): Map<string, CategoryDef> =>
    new Map([[
      'flight',
      { id: 'flight', label: 'Flight', color: '#000', policy } as CategoryDef,
    ]]);

  it('skips silently when the category has no policy', () => {
    const categories = categoryMap(undefined);
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(10, 0),
    });
    expect(result.violations).toEqual([]);
  });

  it('skips silently when categories map is not provided', () => {
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], now: day(10, 0),
    });
    expect(result.violations).toEqual([]);
  });

  it('flags min-lead-time violation as hard', () => {
    const categories = categoryMap({ minLeadTimeMinutes: 120 });
    // "now" is 30 min before the event start — lead is only 30 min.
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(10, 8, 30),
    });
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({
      type: 'policy-violation',
      check: 'min-lead-time',
      requiredMinutes: 120,
    });
  });

  it('passes min-lead-time when lead is exactly the required minutes', () => {
    const categories = categoryMap({ minLeadTimeMinutes: 60 });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(10, 8, 0),
    });
    expect(result.violations).toEqual([]);
  });

  it('flags max-duration when event exceeds the cap', () => {
    // base event is 2h (9–11); cap is 60 min.
    const categories = categoryMap({ maxDurationMinutes: 60 });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(10, 0),
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({
      type: 'policy-violation',
      check: 'max-duration',
      maxMinutes: 60,
    });
  });

  it('ignores max-duration set to 0 (disabled)', () => {
    const categories = categoryMap({ maxDurationMinutes: 0 });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(10, 0),
    });
    expect(result.violations).toEqual([]);
  });

  it('flags max-advance when event is farther out than allowed', () => {
    // Event is April 10; allowed 3 days; now is April 1 ⇒ 9 days out.
    const categories = categoryMap({ maxAdvanceDays: 3 });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(1, 0),
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({
      type: 'policy-violation',
      check: 'max-advance',
      maxDays: 3,
    });
  });

  it('passes max-advance when within the window', () => {
    const categories = categoryMap({ maxAdvanceDays: 30 });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(1, 0),
    });
    expect(result.violations).toEqual([]);
  });

  it('flags blackout-dates when the event start falls on a blackout', () => {
    const categories = categoryMap({ blackoutDates: ['2026-04-10'] });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(9, 0),
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({
      type: 'policy-violation',
      check: 'blackout-dates',
      blackoutDate: '2026-04-10',
    });
  });

  it('ignores blackout-dates that don\'t match the event day', () => {
    const categories = categoryMap({ blackoutDates: ['2026-04-11', '2026-12-25'] });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(9, 0),
    });
    expect(result.violations).toEqual([]);
  });

  it('uses the resource timezone when deriving the blackout key', () => {
    // 2026-04-10 23:30 UTC is 2026-04-11 in Tokyo — only the Tokyo-side
    // blackout should fire.
    const resources = new Map<string, EngineResource>([[
      'N100',
      { id: 'N100', name: 'Tokyo', timezone: 'Asia/Tokyo' } as EngineResource,
    ]]);
    const categories = categoryMap({ blackoutDates: ['2026-04-11'] });
    const proposed: ConflictEvent = {
      ...base,
      start: new Date(Date.UTC(2026, 3, 10, 23, 30)),
      end:   new Date(Date.UTC(2026, 3, 10, 23, 45)),
    };
    const result = evaluateConflicts({
      proposed, events: [], rules: [rule], categories, resources,
      now: new Date(Date.UTC(2026, 3, 10, 0, 0)),
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({ blackoutDate: '2026-04-11' });
  });

  it('aggregates multiple sub-check violations into separate entries', () => {
    const categories = categoryMap({
      minLeadTimeMinutes: 120,
      maxDurationMinutes: 30,
    });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule], categories,
      now: day(10, 8, 30),
    });
    expect(result.violations).toHaveLength(2);
    const checks = result.violations.map(v =>
      (v.details as { check: string } | undefined)?.check,
    ).sort();
    expect(checks).toEqual(['max-duration', 'min-lead-time']);
  });

  it('honors the `checks` allowlist — only runs listed sub-checks', () => {
    const ruleLeadOnly: ConflictRule = {
      id: 'pol-lead', type: 'policy-violation', checks: ['min-lead-time'],
    };
    const categories = categoryMap({
      minLeadTimeMinutes: 120,
      maxDurationMinutes: 30,
    });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [ruleLeadOnly], categories,
      now: day(10, 8, 30),
    });
    expect(result.violations).toHaveLength(1);
    expect((result.violations[0].details as { check: string }).check).toBe('min-lead-time');
  });

  it('respects severity override to "soft"', () => {
    const softRule: ConflictRule = {
      id: 'pol-soft', type: 'policy-violation', severity: 'soft',
    };
    const categories = categoryMap({ blackoutDates: ['2026-04-10'] });
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [softRule], categories,
      now: day(9, 0),
    });
    expect(result.severity).toBe('soft');
    expect(result.allowed).toBe(true);
  });
});

describe('conflictEngine — hold-conflict rule (#211)', () => {
  const rule: ConflictRule = { id: 'hc', type: 'hold-conflict' };
  const now = new Date(Date.UTC(2026, 3, 10, 8, 0));
  const hold: Hold = {
    id: 'h1',
    resourceId: 'N100',
    holderId: 'alice',
    window: {
      start: new Date(Date.UTC(2026, 3, 10, 9, 30)),
      end:   new Date(Date.UTC(2026, 3, 10, 10, 30)),
    },
    expiresAt: '2026-04-10T08:05:00.000Z',
  };

  it('flags an overlapping hold from a different holder as soft', () => {
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule],
      holds: [hold], holderId: 'bob', now,
    });
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe('soft');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].details).toMatchObject({
      type: 'hold-conflict',
      holdId: 'h1',
      holderId: 'alice',
    });
  });

  it('does not flag the proposer\'s own hold', () => {
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule],
      holds: [hold], holderId: 'alice', now,
    });
    expect(result.violations).toEqual([]);
  });

  it('ignores expired holds', () => {
    const expired: Hold = { ...hold, expiresAt: '2026-04-10T07:00:00.000Z' };
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [rule],
      holds: [expired], holderId: 'bob', now,
    });
    expect(result.violations).toEqual([]);
  });

  it('skips when holds[] is missing or empty', () => {
    const empty = evaluateConflicts({
      proposed: base, events: [], rules: [rule],
      holds: [], holderId: 'bob', now,
    });
    const missing = evaluateConflicts({
      proposed: base, events: [], rules: [rule],
      holderId: 'bob', now,
    });
    expect(empty.violations).toEqual([]);
    expect(missing.violations).toEqual([]);
  });

  it('respects severity="hard" to block submits', () => {
    const hardRule: ConflictRule = { id: 'hc-hard', type: 'hold-conflict', severity: 'hard' };
    const result = evaluateConflicts({
      proposed: base, events: [], rules: [hardRule],
      holds: [hold], holderId: 'bob', now,
    });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('hard');
  });
});

describe('conflictEngine — availability-violation rule (#214)', () => {
  const rule: ConflictRule = { id: 'av', type: 'availability-violation' };

  const mkRes = (availability: AvailabilityRule[]): Map<string, EngineResource> =>
    new Map([[ 'N100', { id: 'N100', name: 'Tower', availability, timezone: 'UTC' } as EngineResource ]]);

  it('skips silently when the resource has no availability rules', () => {
    const resources = new Map<string, EngineResource>([[ 'N100', { id: 'N100', name: 'T' } ]]);
    const result = evaluateConflicts({ proposed: base, events: [], rules: [rule], resources });
    expect(result.violations).toEqual([]);
  });

  it('flags a blackout overlap as hard', () => {
    const resources = mkRes([
      { id: 'b', kind: 'blackout', start: '2026-04-10T08:00:00Z', end: '2026-04-10T14:00:00Z', reason: 'Maintenance' },
    ]);
    const proposed: ConflictEvent = {
      ...base,
      start: new Date(Date.UTC(2026, 3, 10, 9, 0)),
      end:   new Date(Date.UTC(2026, 3, 10, 11, 0)),
    };
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.allowed).toBe(false);
    expect(result.violations[0].details).toMatchObject({
      type: 'availability-violation',
      reason: 'blackout',
      availabilityRuleId: 'b',
    });
  });

  it('passes a window inside the open hours', () => {
    const resources = mkRes([
      { id: 'o', kind: 'open', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    ]);
    const proposed: ConflictEvent = {
      ...base,
      // 2026-04-20 Monday 10:00-11:00 UTC.
      start: new Date(Date.UTC(2026, 3, 20, 10, 0)),
      end:   new Date(Date.UTC(2026, 3, 20, 11, 0)),
    };
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.violations).toEqual([]);
  });

  it('flags a window outside open hours as hard', () => {
    const resources = mkRes([
      { id: 'o', kind: 'open', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    ]);
    const proposed: ConflictEvent = {
      ...base,
      start: new Date(Date.UTC(2026, 3, 20, 17, 0)),
      end:   new Date(Date.UTC(2026, 3, 20, 19, 0)),
    };
    const result = evaluateConflicts({ proposed, events: [], rules: [rule], resources });
    expect(result.allowed).toBe(false);
    expect(result.violations[0].details).toMatchObject({ reason: 'outside-open-hours' });
  });

  it('respects ignoreCategories', () => {
    const resources = mkRes([
      { id: 'b', kind: 'blackout', start: '2026-04-10T08:00:00Z', end: '2026-04-10T14:00:00Z' },
    ]);
    const ruleSkip: ConflictRule = { id: 'av', type: 'availability-violation', ignoreCategories: ['flight'] };
    const proposed: ConflictEvent = {
      ...base,
      start: new Date(Date.UTC(2026, 3, 10, 9, 0)),
      end:   new Date(Date.UTC(2026, 3, 10, 11, 0)),
    };
    const result = evaluateConflicts({ proposed, events: [], rules: [ruleSkip], resources });
    expect(result.violations).toEqual([]);
  });
});

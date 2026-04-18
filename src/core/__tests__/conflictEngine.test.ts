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
} from '../conflictEngine.js';

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

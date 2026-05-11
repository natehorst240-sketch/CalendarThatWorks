import { describe, it, expect } from 'vitest';
import {
  VIEW_SCOPES,
  getViewScope,
  captureSavedViewFields,
  type SavedViewCaptureCtx,
  type ViewScopeContext,
} from '../viewScope';
import { SCHEDULE_TAB_CATEGORY_SEEDS } from '../scheduleModel';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Shared fixtures                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

/** A plain calendar event that must NOT be treated as a schedule workflow event. */
const normalEvent = {
  id: 'e1',
  title: 'Team meeting',
  start: new Date('2026-05-10T09:00:00Z'),
  end:   new Date('2026-05-10T10:00:00Z'),
  category: 'meeting',
};

/**
 * A schedule workflow event.  A category in SCHEDULE_WORKFLOW_CATEGORIES
 * is the simplest way to trigger isScheduleWorkflowEvent.
 */
const scheduleEvent = {
  id: 'e2',
  title: 'Morning Shift',
  start: new Date('2026-05-10T06:00:00Z'),
  end:   new Date('2026-05-10T14:00:00Z'),
  category: 'shift',
};

const onCallEvent = {
  id: 'e3',
  title: 'On-call',
  start: new Date('2026-05-10T00:00:00Z'),
  end:   new Date('2026-05-11T00:00:00Z'),
  category: 'on-call',
};

/** A minimal but valid ViewScopeContext. */
const emptyCtx: ViewScopeContext = {
  employees:       [],
  assets:          [],
  bases:           [],
  selectedBaseIds: [],
};

const FULL_CTX: SavedViewCaptureCtx = {
  groupBy:         'role',
  sort:            [{ field: 'title', direction: 'asc' }],
  showAllGroups:   true,
  zoomLevel:       'week',
  collapsedGroups: new Set(['a']),
  selectedBaseIds: ['base-1'],
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  getViewScope                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

describe('getViewScope', () => {
  it('returns the month scope for "month"', () => {
    const scope = getViewScope('month');
    expect(scope).toBe(VIEW_SCOPES.month);
    expect(scope.id).toBe('month');
  });

  it('returns each named view scope correctly', () => {
    const viewIds = ['week', 'day', 'agenda', 'schedule', 'base', 'assets', 'dispatch', 'requests', 'map'] as const;
    for (const id of viewIds) {
      expect(getViewScope(id).id).toBe(id);
    }
  });

  it('falls back to the month scope for an unknown view id', () => {
    expect(getViewScope('unknown-view')).toBe(VIEW_SCOPES.month);
    expect(getViewScope('')).toBe(VIEW_SCOPES.month);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  VIEW_SCOPES.month/week/day/agenda — normal-event filter                  */
/* ────────────────────────────────────────────────────────────────────────── */

describe.each([
  ['month',  VIEW_SCOPES.month],
  ['week',   VIEW_SCOPES.week],
  ['day',    VIEW_SCOPES.day],
  ['agenda', VIEW_SCOPES.agenda],
] as const)('VIEW_SCOPES.%s.includes', (_label, scope) => {
  it('returns true for a normal (non-schedule) event', () => {
    expect(scope.includes(normalEvent, emptyCtx)).toBe(true);
  });

  it('returns false for a schedule workflow event (category: shift)', () => {
    expect(scope.includes(scheduleEvent, emptyCtx)).toBe(false);
  });

  it('returns false for an on-call event', () => {
    expect(scope.includes(onCallEvent, emptyCtx)).toBe(false);
  });

  it('returns false for an event with meta.kind = "shift"', () => {
    const ev = { ...normalEvent, category: 'flight', meta: { kind: 'shift' } };
    expect(scope.includes(ev, emptyCtx)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  VIEW_SCOPES.schedule                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

describe('VIEW_SCOPES.schedule.includes', () => {
  it('returns true for a shift event', () => {
    expect(VIEW_SCOPES.schedule.includes(scheduleEvent, emptyCtx)).toBe(true);
  });

  it('returns true for an on-call event', () => {
    expect(VIEW_SCOPES.schedule.includes(onCallEvent, emptyCtx)).toBe(true);
  });

  it('returns true for an open-shift event', () => {
    const ev = { ...normalEvent, category: 'open-shift' };
    expect(VIEW_SCOPES.schedule.includes(ev, emptyCtx)).toBe(true);
  });

  it('returns true for a covering event', () => {
    const ev = { ...normalEvent, category: 'covering' };
    expect(VIEW_SCOPES.schedule.includes(ev, emptyCtx)).toBe(true);
  });

  it('returns true for an event with meta.onCall = true', () => {
    const ev = { ...normalEvent, category: 'flight', meta: { onCall: true } };
    expect(VIEW_SCOPES.schedule.includes(ev, emptyCtx)).toBe(true);
  });

  it('returns true for a PTO event', () => {
    const ev = { ...normalEvent, category: 'PTO' };
    expect(VIEW_SCOPES.schedule.includes(ev, emptyCtx)).toBe(true);
  });

  it('returns false for a normal meeting event', () => {
    expect(VIEW_SCOPES.schedule.includes(normalEvent, emptyCtx)).toBe(false);
  });

  it('returns false for null', () => {
    expect(VIEW_SCOPES.schedule.includes(null, emptyCtx)).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  VIEW_SCOPES.schedule.seedCategoryOptions                                  */
/* ────────────────────────────────────────────────────────────────────────── */

describe('VIEW_SCOPES.schedule.seedCategoryOptions', () => {
  it('is defined and is the SCHEDULE_TAB_CATEGORY_SEEDS array', () => {
    expect(VIEW_SCOPES.schedule.seedCategoryOptions).toBeDefined();
    expect(VIEW_SCOPES.schedule.seedCategoryOptions).toEqual(SCHEDULE_TAB_CATEGORY_SEEDS);
  });

  it('contains expected seed categories', () => {
    const seeds = VIEW_SCOPES.schedule.seedCategoryOptions ?? [];
    expect(seeds).toContain('on-call');
    expect(seeds).toContain('shift');
    expect(seeds).toContain('PTO');
    expect(seeds).toContain('base');
    expect(seeds).toContain('availability');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  VIEW_SCOPES.base — includesForBase logic                                  */
/* ────────────────────────────────────────────────────────────────────────── */

describe('VIEW_SCOPES.base.includes', () => {
  const ctx: ViewScopeContext = {
    employees:       [{ id: 'emp-1', base: 'base-a' }, { id: 'emp-2', base: 'base-b' }],
    assets:          [
      { id: 'asset-1', meta: { base: 'base-a' } },
      { id: 'asset-2', meta: { base: 'base-b' } },
    ],
    bases:           [{ id: 'base-a', name: 'Alpha' }, { id: 'base-b', name: 'Bravo' }],
    selectedBaseIds: ['base-a'],
  };

  it('returns true when ev.meta.base matches a selected base ID', () => {
    const ev = { ...normalEvent, meta: { base: 'base-a' } };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(true);
  });

  it('returns false when ev.meta.base does not match any selected base ID', () => {
    const ev = { ...normalEvent, meta: { base: 'base-b' } };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(false);
  });

  it('returns true when ev.resource matches an employee whose base matches', () => {
    const ev = { ...normalEvent, resource: 'emp-1' };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(true);
  });

  it('returns false when ev.resource matches an employee at a non-selected base', () => {
    const ev = { ...normalEvent, resource: 'emp-2' };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(false);
  });

  it('returns true when ev.resource matches an asset whose meta.base matches', () => {
    const ev = { ...normalEvent, resource: 'asset-1' };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(true);
  });

  it('returns false when ev.resource matches an asset at a non-selected base', () => {
    const ev = { ...normalEvent, resource: 'asset-2' };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(false);
  });

  it('returns false when neither meta.base nor resource matches', () => {
    const ev = { ...normalEvent, resource: 'unknown-id' };
    expect(VIEW_SCOPES.base.includes(ev, ctx)).toBe(false);
  });

  it('when selectedBaseIds is empty, uses all bases (falls back to entire bases list)', () => {
    const allBasesCtx: ViewScopeContext = { ...ctx, selectedBaseIds: [] };
    // emp-2 belongs to base-b which is in the full bases list
    const ev = { ...normalEvent, resource: 'emp-2' };
    expect(VIEW_SCOPES.base.includes(ev, allBasesCtx)).toBe(true);
  });

  it('returns false when bases list is empty and selectedBaseIds is also empty', () => {
    const emptyBasesCtx: ViewScopeContext = {
      employees:       [],
      assets:          [],
      bases:           [],
      selectedBaseIds: [],
    };
    const ev = { ...normalEvent, meta: { base: 'base-a' } };
    expect(VIEW_SCOPES.base.includes(ev, emptyBasesCtx)).toBe(false);
  });

  it('matches on stringified IDs (handles numeric-like IDs)', () => {
    const numericCtx: ViewScopeContext = {
      employees:       [{ id: '10', base: '99' }],
      assets:          [],
      bases:           [{ id: '99', name: 'Numeric Base' }],
      selectedBaseIds: ['99'],
    };
    const ev = { ...normalEvent, resource: '10' };
    expect(VIEW_SCOPES.base.includes(ev, numericCtx)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Pass-through scopes (assets, dispatch, requests, map)                     */
/* ────────────────────────────────────────────────────────────────────────── */

describe.each([
  ['assets',   VIEW_SCOPES.assets],
  ['dispatch', VIEW_SCOPES.dispatch],
  ['requests', VIEW_SCOPES.requests],
  ['map',      VIEW_SCOPES.map],
] as const)('VIEW_SCOPES.%s.includes — always true', (_label, scope) => {
  it('returns true for a normal event', () => {
    expect(scope.includes(normalEvent, emptyCtx)).toBe(true);
  });

  it('returns true for a schedule workflow event', () => {
    expect(scope.includes(scheduleEvent, emptyCtx)).toBe(true);
  });

  it('returns true for null', () => {
    expect(scope.includes(null, emptyCtx)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  captureSavedViewFields                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

describe('captureSavedViewFields', () => {
  it('returns an empty object for views without persistedFields', () => {
    expect(captureSavedViewFields('month', FULL_CTX)).toEqual({});
    expect(captureSavedViewFields('week',  FULL_CTX)).toEqual({});
    expect(captureSavedViewFields('day',   FULL_CTX)).toEqual({});
  });

  it('picks only the fields declared on agenda scope', () => {
    expect(captureSavedViewFields('agenda', FULL_CTX)).toEqual({
      groupBy:       'role',
      sort:          FULL_CTX.sort,
      showAllGroups: true,
    });
  });

  it('picks only the fields declared on schedule scope', () => {
    expect(captureSavedViewFields('schedule', FULL_CTX)).toEqual({
      groupBy: 'role',
      sort:    FULL_CTX.sort,
    });
  });

  it('picks only selectedBaseIds on base scope', () => {
    expect(captureSavedViewFields('base', FULL_CTX)).toEqual({
      selectedBaseIds: ['base-1'],
    });
  });

  it('picks the assets-specific fields on assets scope', () => {
    expect(captureSavedViewFields('assets', FULL_CTX)).toEqual({
      groupBy:         'role',
      sort:            FULL_CTX.sort,
      zoomLevel:       'week',
      collapsedGroups: FULL_CTX.collapsedGroups,
    });
  });

  it('drops undefined entries', () => {
    expect(
      captureSavedViewFields('assets', {
        groupBy:         undefined,
        sort:            FULL_CTX.sort,
        zoomLevel:       undefined,
        collapsedGroups: FULL_CTX.collapsedGroups,
      }),
    ).toEqual({
      sort:            FULL_CTX.sort,
      collapsedGroups: FULL_CTX.collapsedGroups,
    });
  });

  it('preserves null (distinct from undefined) so callers can clear state', () => {
    expect(captureSavedViewFields('agenda', { groupBy: null, sort: null, showAllGroups: false }))
      .toEqual({ groupBy: null, sort: null, showAllGroups: false });
  });

  it('falls back to the month scope (empty) for unknown view ids', () => {
    expect(captureSavedViewFields('nope', FULL_CTX)).toEqual({});
  });

  it('registry lists each field exactly once per view', () => {
    for (const scope of Object.values(VIEW_SCOPES)) {
      const fields = scope.persistedFields ?? [];
      expect(new Set(fields).size).toBe(fields.length);
    }
  });
});

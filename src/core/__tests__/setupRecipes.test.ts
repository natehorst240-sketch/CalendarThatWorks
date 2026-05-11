/**
 * setupRecipes — unit specs for buildRecipeSavedView.
 *
 * No React, no rendering — pure function tests.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startOfWeek, endOfWeek } from 'date-fns';
import { buildRecipeSavedView } from '../setupRecipes';

/* ────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/** Assert that a filters object has completely empty Sets and an empty search string. */
function expectEmptyBaseFilters(filters: Record<string, unknown>): void {
  expect(filters['categories']).toBeInstanceOf(Set);
  expect((filters['categories'] as Set<string>).size).toBe(0);
  expect(filters['resources']).toBeInstanceOf(Set);
  expect((filters['resources'] as Set<string>).size).toBe(0);
  expect(filters['sources']).toBeInstanceOf(Set);
  expect((filters['sources'] as Set<string>).size).toBe(0);
  expect(filters['search']).toBe('');
}

/** Parse an ISO string returned in dateRange and make sure it's a valid Date. */
function parseIso(iso: unknown): Date {
  expect(typeof iso).toBe('string');
  const d = new Date(iso as string);
  expect(isNaN(d.getTime())).toBe(false);
  return d;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Fixed "now" for this-week tests                                          */
/*                                                                            */
/*  We freeze Date to a known Wednesday so weekStart/weekEnd are predictable. */
/* ────────────────────────────────────────────────────────────────────────── */

const FIXED_NOW = new Date('2026-05-13T12:00:00.000Z'); // Wednesday 2026-05-13

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  'everything'                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildRecipeSavedView('everything')", () => {
  it('returns the expected name', () => {
    const result = buildRecipeSavedView('everything', 0);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Show everything');
  });

  it('returns null view', () => {
    expect(buildRecipeSavedView('everything', 0)!.view).toBeNull();
  });

  it('returns null groupBy', () => {
    expect(buildRecipeSavedView('everything', 0)!.groupBy).toBeNull();
  });

  it('returns empty categories, resources, sources Sets and empty search', () => {
    const { filters } = buildRecipeSavedView('everything', 0)!;
    expectEmptyBaseFilters(filters);
  });

  it('has null dateRange', () => {
    expect(buildRecipeSavedView('everything', 0)!.filters['dateRange']).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  'by-person'                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildRecipeSavedView('by-person')", () => {
  it('returns the expected name', () => {
    expect(buildRecipeSavedView('by-person', 0)!.name).toBe('Group by person');
  });

  it('returns schedule view', () => {
    expect(buildRecipeSavedView('by-person', 0)!.view).toBe('schedule');
  });

  it('returns resource groupBy', () => {
    expect(buildRecipeSavedView('by-person', 0)!.groupBy).toBe('resource');
  });

  it('returns empty base filters', () => {
    expectEmptyBaseFilters(buildRecipeSavedView('by-person', 0)!.filters);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  'by-type'                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildRecipeSavedView('by-type')", () => {
  it('returns the expected name', () => {
    expect(buildRecipeSavedView('by-type', 0)!.name).toBe('Group by type');
  });

  it('returns null view', () => {
    expect(buildRecipeSavedView('by-type', 0)!.view).toBeNull();
  });

  it('returns category groupBy', () => {
    expect(buildRecipeSavedView('by-type', 0)!.groupBy).toBe('category');
  });

  it('returns empty base filters', () => {
    expectEmptyBaseFilters(buildRecipeSavedView('by-type', 0)!.filters);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  'on-call'                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildRecipeSavedView('on-call')", () => {
  it('returns the expected name', () => {
    expect(buildRecipeSavedView('on-call', 0)!.name).toBe('On-call only');
  });

  it('returns null view', () => {
    expect(buildRecipeSavedView('on-call', 0)!.view).toBeNull();
  });

  it('returns null groupBy', () => {
    expect(buildRecipeSavedView('on-call', 0)!.groupBy).toBeNull();
  });

  it('returns categories Set containing "on-call"', () => {
    const { filters } = buildRecipeSavedView('on-call', 0)!;
    expect(filters['categories']).toBeInstanceOf(Set);
    expect((filters['categories'] as Set<string>).has('on-call')).toBe(true);
  });

  it('has no extra category entries beyond "on-call"', () => {
    const cats = buildRecipeSavedView('on-call', 0)!.filters['categories'] as Set<string>;
    expect(cats.size).toBe(1);
  });

  it('returns empty resources, sources Sets and empty search', () => {
    const { filters } = buildRecipeSavedView('on-call', 0)!;
    expect((filters['resources'] as Set<string>).size).toBe(0);
    expect((filters['sources'] as Set<string>).size).toBe(0);
    expect(filters['search']).toBe('');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  'this-week' — weekStartsOn: 0 (Sunday)                                   */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildRecipeSavedView('this-week', 0) — Sunday start", () => {
  it('returns the expected name', () => {
    expect(buildRecipeSavedView('this-week', 0)!.name).toBe('This week only');
  });

  it('returns week view', () => {
    expect(buildRecipeSavedView('this-week', 0)!.view).toBe('week');
  });

  it('returns null groupBy', () => {
    expect(buildRecipeSavedView('this-week', 0)!.groupBy).toBeNull();
  });

  it('returns empty categories, resources, sources Sets and empty search', () => {
    const { filters } = buildRecipeSavedView('this-week', 0)!;
    // dateRange is set, but the base sets must still be empty
    expect((filters['categories'] as Set<string>).size).toBe(0);
    expect((filters['resources'] as Set<string>).size).toBe(0);
    expect((filters['sources'] as Set<string>).size).toBe(0);
    expect(filters['search']).toBe('');
  });

  it('has a dateRange with valid ISO start and end strings', () => {
    const { filters } = buildRecipeSavedView('this-week', 0)!;
    const dr = filters['dateRange'] as { start: string; end: string } | null;
    expect(dr).not.toBeNull();
    parseIso(dr!.start);
    parseIso(dr!.end);
  });

  it('start matches startOfWeek(now, { weekStartsOn: 0 })', () => {
    const { filters } = buildRecipeSavedView('this-week', 0)!;
    const dr = filters['dateRange'] as { start: string; end: string };
    const expected = startOfWeek(FIXED_NOW, { weekStartsOn: 0 });
    expect(new Date(dr.start).toISOString()).toBe(expected.toISOString());
  });

  it('end matches endOfWeek(now, { weekStartsOn: 0 })', () => {
    const { filters } = buildRecipeSavedView('this-week', 0)!;
    const dr = filters['dateRange'] as { start: string; end: string };
    const expected = endOfWeek(FIXED_NOW, { weekStartsOn: 0 });
    expect(new Date(dr.end).toISOString()).toBe(expected.toISOString());
  });

  it('start is before end', () => {
    const { filters } = buildRecipeSavedView('this-week', 0)!;
    const dr = filters['dateRange'] as { start: string; end: string };
    expect(new Date(dr.start).getTime()).toBeLessThan(new Date(dr.end).getTime());
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  'this-week' — weekStartsOn: 1 (Monday)                                   */
/* ────────────────────────────────────────────────────────────────────────── */

describe("buildRecipeSavedView('this-week', 1) — Monday start", () => {
  it('start matches startOfWeek(now, { weekStartsOn: 1 })', () => {
    const { filters } = buildRecipeSavedView('this-week', 1)!;
    const dr = filters['dateRange'] as { start: string; end: string };
    const expected = startOfWeek(FIXED_NOW, { weekStartsOn: 1 });
    expect(new Date(dr.start).toISOString()).toBe(expected.toISOString());
  });

  it('end matches endOfWeek(now, { weekStartsOn: 1 })', () => {
    const { filters } = buildRecipeSavedView('this-week', 1)!;
    const dr = filters['dateRange'] as { start: string; end: string };
    const expected = endOfWeek(FIXED_NOW, { weekStartsOn: 1 });
    expect(new Date(dr.end).toISOString()).toBe(expected.toISOString());
  });

  it('produces different boundaries than Sunday start (0)', () => {
    const sunday = buildRecipeSavedView('this-week', 0)!.filters['dateRange'] as { start: string; end: string };
    const monday = buildRecipeSavedView('this-week', 1)!.filters['dateRange'] as { start: string; end: string };
    // For our fixed Wednesday 2026-05-13, Sunday week starts 2026-05-10,
    // Monday week starts 2026-05-11 — they must differ.
    expect(sunday.start).not.toBe(monday.start);
    expect(sunday.end).not.toBe(monday.end);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/*  Unknown recipe id                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

describe('buildRecipeSavedView with an unknown id', () => {
  it('returns null for an unrecognised recipe id', () => {
    // Cast needed because the type system rejects non-recipe ids at compile time.
    expect(buildRecipeSavedView('unknown' as any, 0)).toBeNull();
  });
});

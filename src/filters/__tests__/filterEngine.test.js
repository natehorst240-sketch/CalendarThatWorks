/**
 * filterEngine unit tests — applyFilters (all stages), getSources.
 */
import { describe, it, expect } from 'vitest';
import { applyFilters, getCategories, getResources, getSources } from '../filterEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ev = (overrides) => ({
  id:       overrides.id ?? 'e1',
  title:    overrides.title ?? 'Event',
  start:    overrides.start ?? new Date('2026-04-10T09:00'),
  end:      overrides.end   ?? new Date('2026-04-10T10:00'),
  category: overrides.category ?? undefined,
  resource: overrides.resource ?? undefined,
  ...overrides,
});

const srcA = ev({ id: 'a', title: 'From A', _sourceId: 'src-a', _sourceLabel: 'Source A' });
const srcB = ev({ id: 'b', title: 'From B', _sourceId: 'src-b', _sourceLabel: 'Source B' });
const noProp = ev({ id: 'c', title: 'No source' }); // prop event — no _sourceId

// ── Source filter ─────────────────────────────────────────────────────────────

describe('applyFilters — sources', () => {
  it('shows all events when sources Set is empty', () => {
    const result = applyFilters([srcA, srcB, noProp], { sources: new Set() });
    expect(result).toHaveLength(3);
  });

  it('shows only matching source events when sources is non-empty', () => {
    const result = applyFilters([srcA, srcB, noProp], { sources: new Set(['src-a']) });
    expect(result.map(e => e.id)).toEqual(['a', 'c']); // src-a + prop event
  });

  it('always includes events with no _sourceId (prop events)', () => {
    const result = applyFilters([srcA, noProp], { sources: new Set(['src-a']) });
    expect(result.some(e => e.id === 'c')).toBe(true);
  });

  it('shows events from multiple selected sources', () => {
    const result = applyFilters([srcA, srcB, noProp], { sources: new Set(['src-a', 'src-b']) });
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no events match selected source', () => {
    const result = applyFilters([srcA, srcB], { sources: new Set(['src-x']) });
    expect(result).toHaveLength(0);
  });

  it('works when sources filter is absent (undefined)', () => {
    const result = applyFilters([srcA, srcB], {});
    expect(result).toHaveLength(2);
  });
});

// ── Combined source + category filter ────────────────────────────────────────

describe('applyFilters — sources + categories combined', () => {
  const catA = ev({ id: 'ca', category: 'Meeting', _sourceId: 'src-a' });
  const catB = ev({ id: 'cb', category: 'PTO',     _sourceId: 'src-b' });
  const catC = ev({ id: 'cc', category: 'Meeting', _sourceId: 'src-b' });

  it('applies both filters independently', () => {
    const result = applyFilters([catA, catB, catC], {
      sources:    new Set(['src-a']),
      categories: new Set(['Meeting']),
    });
    // Only catA matches both (src-a AND Meeting); catC is Meeting but src-b
    expect(result.map(e => e.id)).toEqual(['ca']);
  });
});

// ── Category filter ───────────────────────────────────────────────────────────

describe('applyFilters — categories', () => {
  const events = [
    ev({ id: '1', category: 'Meeting' }),
    ev({ id: '2', category: 'PTO' }),
    ev({ id: '3', category: 'Meeting' }),
  ];

  it('shows all when categories Set is empty', () => {
    expect(applyFilters(events, { categories: new Set() })).toHaveLength(3);
  });

  it('filters to selected categories', () => {
    const result = applyFilters(events, { categories: new Set(['Meeting']) });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.category === 'Meeting')).toBe(true);
  });
});

// ── Resource filter ───────────────────────────────────────────────────────────

describe('applyFilters — resources', () => {
  const events = [
    ev({ id: '1', resource: 'Alice' }),
    ev({ id: '2', resource: 'Bob' }),
  ];

  it('shows all when resources Set is empty', () => {
    expect(applyFilters(events, { resources: new Set() })).toHaveLength(2);
  });

  it('filters to selected resources', () => {
    const result = applyFilters(events, { resources: new Set(['Alice']) });
    expect(result).toHaveLength(1);
    expect(result[0].resource).toBe('Alice');
  });
});

// ── Text search filter ────────────────────────────────────────────────────────

describe('applyFilters — search', () => {
  const events = [
    ev({ id: '1', title: 'Team standup' }),
    ev({ id: '2', title: 'Quarterly review', resource: 'Alice' }),
  ];

  it('matches title case-insensitively', () => {
    const result = applyFilters(events, { search: 'STANDUP' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('matches resource', () => {
    const result = applyFilters(events, { search: 'alice' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('shows all when search is empty', () => {
    expect(applyFilters(events, { search: '' })).toHaveLength(2);
  });
});

// ── getSources ────────────────────────────────────────────────────────────────

describe('getSources', () => {
  it('extracts unique source pairs from events', () => {
    const events = [srcA, srcB, ev({ id: 'a2', _sourceId: 'src-a', _sourceLabel: 'Source A' })];
    const sources = getSources(events);
    expect(sources).toHaveLength(2);
    expect(sources.find(s => s.id === 'src-a')?.label).toBe('Source A');
  });

  it('excludes events with no _sourceId', () => {
    const sources = getSources([noProp]);
    expect(sources).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(getSources([])).toEqual([]);
  });
});

// ── getCategories / getResources ──────────────────────────────────────────────

describe('getCategories', () => {
  it('returns sorted unique categories', () => {
    const events = [ev({ category: 'PTO' }), ev({ category: 'Meeting' }), ev({ category: 'PTO' })];
    expect(getCategories(events)).toEqual(['Meeting', 'PTO']);
  });

  it('excludes undefined categories', () => {
    expect(getCategories([ev({})])).toEqual([]);
  });
});

describe('getResources', () => {
  it('returns sorted unique resources', () => {
    const events = [ev({ resource: 'Zara' }), ev({ resource: 'Alice' })];
    expect(getResources(events)).toEqual(['Alice', 'Zara']);
  });
});

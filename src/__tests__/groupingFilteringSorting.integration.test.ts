/**
 * Integration matrix — grouping × filtering × sorting (ticket #134-5).
 *
 * The WorksCalendar event pipeline is:
 *
 *   events
 *     → applyFilters(events, filters, schema)        (filtered)
 *     → sortEvents(filtered, sortConfigs)            (sorted, stable)
 *     → buildGroupTree(sorted, groupBy)              (grouped, in views)
 *
 * These specs exercise the three stages in combination so we catch
 * interactions the single-stage unit tests miss: e.g. group sort is
 * alphabetical by key regardless of event sort, but *within* a leaf group
 * the event sort must be preserved; filtering must shrink group counts and
 * can fully remove a group when its last event is filtered out; etc.
 *
 * Ticket scope called for ~15 specs covering the matrix.
 */
import { describe, it, expect } from 'vitest';

import { applyFilters } from '../filters/filterEngine';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema.ts';
import { sortEvents } from '../core/sortEngine.ts';
import { buildGroupTree } from '../hooks/useGrouping.ts';

const baseDay = (day: number) => new Date(2026, 3, day);

const events = [
  { id: 'e1', title: 'Charlie Flight', start: baseDay(2), end: baseDay(2),  category: 'training',    resource: 'N100', meta: { region: 'West', priority: 1 } },
  { id: 'e2', title: 'Alpha Flight',   start: baseDay(1), end: baseDay(1),  category: 'training',    resource: 'N200', meta: { region: 'East', priority: 3 } },
  { id: 'e3', title: 'Bravo Flight',   start: baseDay(3), end: baseDay(3),  category: 'maintenance', resource: 'N100', meta: { region: 'West', priority: 2 } },
  { id: 'e4', title: 'Delta Flight',   start: baseDay(4), end: baseDay(4),  category: 'pr',          resource: 'N300', meta: { region: 'East', priority: 3 } },
  { id: 'e5', title: 'Echo Flight',    start: baseDay(5), end: baseDay(5),  category: 'training',    resource: 'N100', meta: { region: 'West', priority: 2 } },
  { id: 'e6', title: 'Foxtrot Flight', start: baseDay(6), end: baseDay(6),  category: 'maintenance', resource: 'N200', meta: { region: 'East', priority: 1 } },
];

/** Apply the three-stage pipeline end-to-end. */
function pipeline({ filters = {}, sort = [], groupBy = null }: any = {}) {
  const filtered = applyFilters(events, filters, DEFAULT_FILTER_SCHEMA);
  const sorted   = sortEvents(filtered as any, sort);
  const tree     = groupBy ? buildGroupTree(sorted, groupBy) : [];
  return { filtered, sorted, tree };
}

function mustFindGroup(tree: any[], key: string) {
  const group = tree.find((entry) => entry.key === key);
  expect(group).toBeDefined();
  return group!;
}

// ── Sort + group (no filter) ────────────────────────────────────────────────

describe('integration — sort × group', () => {
  it('1-level group retains within-group event sort (title asc)', () => {
    const { tree } = pipeline({
      sort: [{ field: 'title', direction: 'asc' }],
      groupBy: 'category',
    });
    // category groups sort alphabetically (maintenance, pr, training).
    const maintenanceTitles = mustFindGroup(tree, 'maintenance').events.map((e: any) => e.title);
    expect(maintenanceTitles).toEqual(['Bravo Flight', 'Foxtrot Flight']);
    const trainingTitles = mustFindGroup(tree, 'training').events.map((e: any) => e.title);
    expect(trainingTitles).toEqual(['Alpha Flight', 'Charlie Flight', 'Echo Flight']);
  });

  it('within-group sort is stable across sort direction flips', () => {
    const { tree } = pipeline({
      sort: [{ field: 'title', direction: 'desc' }],
      groupBy: 'category',
    });
    const trainingTitles = mustFindGroup(tree, 'training').events.map((e: any) => e.title);
    expect(trainingTitles).toEqual(['Echo Flight', 'Charlie Flight', 'Alpha Flight']);
  });

  it('multi-field sort survives the grouping step', () => {
    // Primary: meta.priority asc; tiebreaker: title asc.
    const { tree } = pipeline({
      sort: [
        { field: 'priority', direction: 'asc' },
        { field: 'title',    direction: 'asc' },
      ],
      groupBy: 'category',
    });
    const training = mustFindGroup(tree, 'training').events.map((e: any) => ({
      title: e.title, priority: e.meta.priority,
    }));
    expect(training).toEqual([
      { title: 'Charlie Flight', priority: 1 },
      { title: 'Echo Flight',    priority: 2 },
      { title: 'Alpha Flight',   priority: 3 },
    ]);
  });

  it('2-level nested group preserves inner sort in deepest leaves', () => {
    const { tree } = pipeline({
      sort: [{ field: 'start', direction: 'asc' }],
      groupBy: ['region', 'category'],
    });
    // East → training: [Alpha only]; East → pr: [Delta]; East → maintenance: [Foxtrot].
    const east = mustFindGroup(tree, 'East');
    expect(east.children.map((c: any) => c.key)).toEqual(['maintenance', 'pr', 'training']);
    expect(mustFindGroup(east.children, 'training').events.map((e: any) => e.id)).toEqual(['e2']);
    expect(mustFindGroup(east.children, 'maintenance').events.map((e: any) => e.id)).toEqual(['e6']);
  });
});

// ── Filter + sort ────────────────────────────────────────────────────────────

describe('integration — filter × sort', () => {
  it('filtering then sorting returns only surviving events in sort order', () => {
    const filters = { categories: ['training'] };
    const { sorted } = pipeline({
      filters,
      sort: [{ field: 'title', direction: 'asc' }],
    });
    expect(sorted.map(e => e.title)).toEqual(['Alpha Flight', 'Charlie Flight', 'Echo Flight']);
  });

  it('resource filter narrows to a single asset before sorting by start', () => {
    const { sorted } = pipeline({
      filters: { resources: ['N100'] },
      sort: [{ field: 'start', direction: 'asc' }],
    });
    expect(sorted.map(e => e.id)).toEqual(['e1', 'e3', 'e5']);
  });

  it('text search filter runs before the sort step', () => {
    const { sorted } = pipeline({
      filters: { search: 'Alpha' },
      sort: [{ field: 'title', direction: 'asc' }],
    });
    expect(sorted.map(e => e.id)).toEqual(['e2']);
  });

  it('empty filters pass every event through to the sort step', () => {
    const { sorted } = pipeline({
      filters: {},
      sort: [{ field: 'start', direction: 'asc' }],
    });
    expect(sorted).toHaveLength(events.length);
  });
});

// ── Filter + group ──────────────────────────────────────────────────────────

describe('integration — filter × group', () => {
  it('category filter removes groups with no surviving events', () => {
    const { tree } = pipeline({
      filters: { categories: ['training'] },
      groupBy: 'category',
    });
    expect(tree.map(g => g.key)).toEqual(['training']);
    expect(tree[0].events).toHaveLength(3);
  });

  it('resource filter shrinks per-group counts without dropping the group', () => {
    // Filter to resource N100 (West region only).
    const { tree } = pipeline({
      filters: { resources: ['N100'] },
      groupBy: 'region',
    });
    expect(tree.map(g => g.key)).toEqual(['West']);
    expect(tree[0].events.map(e => e.id)).toEqual(['e1', 'e3', 'e5']);
  });

  it('filtering to zero events produces an empty tree', () => {
    const { tree } = pipeline({
      filters: { categories: ['does-not-exist'] },
      groupBy: 'category',
    });
    expect(tree).toEqual([]);
  });

  it('2-level nested group drops empty inner branches after filter', () => {
    // After filtering to training only, East group keeps just Alpha;
    // West group keeps Charlie + Echo. Inner "maintenance" and "pr" go away.
    const { tree } = pipeline({
      filters: { categories: ['training'] },
      groupBy: ['region', 'category'],
    });
    const east = mustFindGroup(tree, 'East');
    const west = mustFindGroup(tree, 'West');
    expect(east.children.map((c: any) => c.key)).toEqual(['training']);
    expect(west.children.map((c: any) => c.key)).toEqual(['training']);
  });
});

// ── Full matrix: filter × sort × group ──────────────────────────────────────

describe('integration — filter × sort × group', () => {
  it('all three stages compose: filter → sort → group with inner order preserved', () => {
    const { tree } = pipeline({
      filters: { categories: ['training'] },
      sort:    [{ field: 'start', direction: 'desc' }],
      groupBy: 'region',
    });
    // Only training events survive; sorted by start desc; grouped by region.
    const east = mustFindGroup(tree, 'East');
    const west = mustFindGroup(tree, 'West');
    expect(east.events.map((e: any) => e.id)).toEqual(['e2']); // Alpha only
    expect(west.events.map((e: any) => e.id)).toEqual(['e5', 'e1']); // Echo, Charlie (desc)
  });

  it('group order is alphabetical regardless of event sort direction', () => {
    const { tree: asc } = pipeline({
      sort: [{ field: 'start', direction: 'asc' }],
      groupBy: 'category',
    });
    const { tree: desc } = pipeline({
      sort: [{ field: 'start', direction: 'desc' }],
      groupBy: 'category',
    });
    expect(asc.map(g => g.key)).toEqual(desc.map(g => g.key));
    expect(asc.map(g => g.key)).toEqual(['maintenance', 'pr', 'training']);
  });

  it('changing sort mid-pipeline does not mutate the source events array', () => {
    const snapshot = events.map(e => e.id);
    pipeline({ sort: [{ field: 'title', direction: 'desc' }], groupBy: 'category' });
    expect(events.map(e => e.id)).toEqual(snapshot);
  });

  it('group event counts equal post-filter event totals per bucket', () => {
    const { tree } = pipeline({
      filters: { resources: ['N100', 'N200'] },
      groupBy: 'region',
    });
    const total = tree.reduce((sum, g) => sum + g.events.length, 0);
    const filteredCount = pipeline({ filters: { resources: ['N100', 'N200'] } }).filtered.length;
    expect(total).toBe(filteredCount);
  });

  it('absent groupBy leaves the tree empty while filter + sort still apply', () => {
    const { filtered, sorted, tree } = pipeline({
      filters: { categories: ['training'] },
      sort:    [{ field: 'title', direction: 'asc' }],
    });
    expect(filtered).toHaveLength(3);
    expect(sorted.map(e => e.title)).toEqual(['Alpha Flight', 'Charlie Flight', 'Echo Flight']);
    expect(tree).toEqual([]);
  });
});

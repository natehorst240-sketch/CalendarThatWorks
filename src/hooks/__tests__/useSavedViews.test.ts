/**
 * useSavedViews unit tests.
 *
 * Tests the hook, serialization helpers, and localStorage persistence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useSavedViews,
  serializeFilters,
  deserializeFilters,
} from '../useSavedViews';

const CAL_ID = 'test-cal';
type LiveFilters = {
  categories: Set<string>;
  resources: Set<string>;
  sources: Set<string>;
  search: string;
  dateRange: { start: Date; end: Date } | null;
};
type StoredFilters = {
  categories: string[];
  resources: string[];
  sources: string[];
  search: string;
  dateRange: { start: string; end: string } | null;
};
const makeEmptyLiveFilters = (): LiveFilters => ({
  categories: new Set<string>(),
  resources: new Set<string>(),
  sources: new Set<string>(),
  search: '',
  dateRange: null,
});
const makeEmptyStoredFilters = (): StoredFilters => ({
  categories: [],
  resources: [],
  sources: [],
  search: '',
  dateRange: null,
});

beforeEach(() => {
  localStorage.clear();
});

// ── serializeFilters / deserializeFilters ──────────────────────────────────────

describe('serializeFilters', () => {
  it('converts Sets to arrays', () => {
    const filters: LiveFilters = {
      categories: new Set(['Work', 'PTO']),
      resources:  new Set(['Alice']),
      sources:    new Set(['src-a']),
      search:     'hello',
      dateRange:  null,
    };
    const serialized = serializeFilters(filters);
    expect(Array.isArray(serialized.categories)).toBe(true);
    expect(serialized.categories).toContain('Work');
    expect(Array.isArray(serialized.resources)).toBe(true);
    expect(Array.isArray(serialized.sources)).toBe(true);
    expect(serialized.search).toBe('hello');
    expect(serialized.dateRange).toBeNull();
  });

  it('serializes dateRange dates as ISO strings', () => {
    const start = new Date('2026-04-01T00:00:00.000Z');
    const end   = new Date('2026-04-30T00:00:00.000Z');
    const serialized = serializeFilters({
      categories: new Set(),
      resources:  new Set(),
      sources:    new Set(),
      search:     '',
      dateRange:  { start, end },
    });
    expect(typeof serialized.dateRange.start).toBe('string');
    expect(typeof serialized.dateRange.end).toBe('string');
  });

  it('handles empty Sets', () => {
    const serialized = serializeFilters({
      categories: new Set(),
      resources:  new Set(),
      sources:    new Set(),
      search:     '',
      dateRange:  null,
    });
    expect(serialized.categories).toEqual([]);
    expect(serialized.resources).toEqual([]);
    expect(serialized.sources).toEqual([]);
  });
});

describe('deserializeFilters', () => {
  it('converts arrays back to Sets', () => {
    const saved: StoredFilters = {
      categories: ['Work', 'PTO'],
      resources:  ['Alice'],
      sources:    ['src-a'],
      search:     'test',
      dateRange:  null,
    };
    const filters = deserializeFilters(saved);
    expect(filters.categories).toBeInstanceOf(Set);
    expect(filters.categories.has('Work')).toBe(true);
    expect(filters.categories.has('PTO')).toBe(true);
    expect(filters.resources).toBeInstanceOf(Set);
    expect(filters.resources.has('Alice')).toBe(true);
    expect(filters.sources).toBeInstanceOf(Set);
    expect(filters.sources.has('src-a')).toBe(true);
    expect(filters.search).toBe('test');
    expect(filters.dateRange).toBeNull();
  });

  it('converts dateRange strings to Date objects', () => {
    const saved: StoredFilters = {
      categories: [] as string[],
      resources:  [] as string[],
      sources:    [] as string[],
      search:     '',
      dateRange:  {
        start: '2026-04-01T00:00:00.000Z',
        end:   '2026-04-30T00:00:00.000Z',
      },
    };
    const filters = deserializeFilters(saved);
    expect(filters.dateRange.start).toBeInstanceOf(Date);
    expect(filters.dateRange.end).toBeInstanceOf(Date);
  });

  it('round-trip preserves Sets, search, and dateRange', () => {
    const original = {
      categories: new Set(['Work']),
      resources:  new Set(['Bob']),
      sources:    new Set(['src-x']),
      search:     'quarterly',
      dateRange:  {
        start: new Date('2026-04-01T00:00:00.000Z'),
        end:   new Date('2026-04-30T00:00:00.000Z'),
      },
    };
    const roundTripped = deserializeFilters(serializeFilters(original));
    expect(roundTripped.categories.has('Work')).toBe(true);
    expect(roundTripped.resources.has('Bob')).toBe(true);
    expect(roundTripped.sources.has('src-x')).toBe(true);
    expect(roundTripped.search).toBe('quarterly');
    expect(roundTripped.dateRange.start).toBeInstanceOf(Date);
    expect(roundTripped.dateRange.end.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });
});

// ── useSavedViews hook ─────────────────────────────────────────────────────────

describe('useSavedViews', () => {
  it('starts with empty views when nothing in localStorage', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toEqual([]);
  });

  it('saveView adds a view with generated id and serialized filters', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    const filters: LiveFilters = {
      categories: new Set(['Work']),
      resources:  new Set(),
      sources:    new Set(),
      search:     '',
      dateRange:  null,
    };
    act(() => {
      result.current.saveView('My View', filters);
    });
    expect(result.current.views).toHaveLength(1);
    const view = result.current.views[0];
    expect(view!.name).toBe('My View');
    expect(typeof view!.id).toBe('string');
    expect(view!.id.length).toBeGreaterThan(0);
    expect(view!.createdAt).toBeDefined();
    // Filters should be serialized (arrays, not Sets)
    expect(Array.isArray(view!.filters.categories)).toBe(true);
    expect(view!.filters.categories).toContain('Work');
  });

  it('saveView returns the created view object', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    let created: ReturnType<ReturnType<typeof useSavedViews>['saveView']> | undefined;
    act(() => {
      created = result.current.saveView('Return Test', {
        categories: new Set(),
        resources:  new Set(),
        sources:    new Set(),
        search:     '',
        dateRange:  null,
      });
    });
    expect(created).toBeDefined();
    if (!created) throw new Error('Expected saveView to return the created view');
    expect(created.name).toBe('Return Test');
  });

  it('deleteView removes a view by id', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('View A', { categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null });
      result.current.saveView('View B', { categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null });
    });
    expect(result.current.views).toHaveLength(2);
    const idToDelete = result.current.views[0].id!;
    act(() => {
      result.current.deleteView(idToDelete);
    });
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name!).toBe('View B');
  });

  it('persists views to localStorage', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persisted', {
        categories: new Set(['Work']),
        resources:  new Set(),
        sources:    new Set(),
        search:     '',
        dateRange:  null,
      });
    });
    const storedJson = localStorage.getItem(`wc-saved-views-${CAL_ID}`);
    expect(storedJson).not.toBeNull();
    if (!storedJson) throw new Error('Expected saved views payload in localStorage');
    const stored = JSON.parse(storedJson);
    expect(stored.version).toBe(4);
    expect(stored.views).toHaveLength(1);
    expect(stored.views[0].name).toBe('Persisted');
  });

  it('loads existing views from localStorage on init', () => {
    const existingViews = [
      {
        id:        'v1',
        name:      'Stored View',
        createdAt: new Date().toISOString(),
        filters:   { ...makeEmptyStoredFilters(), categories: ['PTO'] },
      },
    ];
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify({
      version: 2,
      views: existingViews,
    }));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name!).toBe('Stored View');
  });

  it('migrates old array-only saved views payload', () => {
    const existingViews = [
      {
        id: 'v-old',
        name: 'Old Shape',
        createdAt: new Date().toISOString(),
        filters: makeEmptyStoredFilters(),
      },
    ];
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify(existingViews));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name!).toBe('Old Shape');
  });

  it('calendarId switching reloads from correct localStorage key', () => {
    const viewsA = [{ id: 'va', name: 'View A', createdAt: '', filters: makeEmptyStoredFilters() }];
    const viewsB = [{ id: 'vb', name: 'View B', createdAt: '', filters: makeEmptyStoredFilters() }];
    localStorage.setItem('wc-saved-views-cal-a', JSON.stringify(viewsA));
    localStorage.setItem('wc-saved-views-cal-b', JSON.stringify(viewsB));

    const { result, rerender } = renderHook(({ id }: { id: string }) => useSavedViews(id), {
      initialProps: { id: 'cal-a' },
    });
    expect(result.current.views[0].name!).toBe('View A');

    rerender({ id: 'cal-b' });
    expect(result.current.views[0].name!).toBe('View B');
  });

  it('saveView stores color and view when provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Colored', {
        categories: new Set(),
        resources:  new Set(),
        sources:    new Set(),
        search:     '',
        dateRange:  null,
      }, { color: '#ef4444', view: 'week' });
    });
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].color!).toBe('#ef4444');
    expect(result.current.views[0].view!).toBe('week');
  });

  it('updateView renames a view', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Original', {
        categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.updateView(id, { name: 'Renamed' });
    });
    expect(result.current.views[0].name!).toBe('Renamed');
  });

  it('updateView changes a view color', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('My View', {
        categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      }, { color: '#3b82f6' });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.updateView(id, { color: '#10b981' });
    });
    expect(result.current.views[0].color!).toBe('#10b981');
  });

  it('resaveView replaces the filters of an existing view', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Work View', {
        categories: new Set(['Work']), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, {
        categories: new Set(['PTO']), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      }, 'month');
    });
    expect(result.current.views[0].filters.categories!).toContain('PTO');
    expect(result.current.views[0].filters.categories!).not.toContain('Work');
    expect(result.current.views[0].view!).toBe('month');
  });

  it('migrates legacy wc-profiles-* data on first load', () => {
    const legacyProfiles = [{
      id: 'p1', name: 'Old Profile', color: '#3b82f6', view: 'week',
      filters: { categories: ['Work'], resources: [] as string[], search: '' },
    }];
    localStorage.setItem('wc-profiles-test-cal', JSON.stringify(legacyProfiles));
    const { result } = renderHook(() => useSavedViews('test-cal'));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name!).toBe('Old Profile');
    expect(result.current.views[0].color!).toBe('#3b82f6');
    expect(result.current.views[0].view!).toBe('week');
  });

  it('saveView stores conditions metadata when provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    const conditions = [
      { field: 'category', operator: 'is', value: 'Work', logic: 'AND' },
      { field: 'person', operator: 'is', value: 'Alice', logic: 'OR' },
    ];
    act(() => {
      result.current.saveView('Cond View', {
        categories: new Set(['Work']),
        resources: new Set(['Alice']),
        sources: new Set(),
        search: '',
        dateRange: null,
      }, { conditions });
    });
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].conditions!).toEqual(conditions);
  });

  it('conditions survive localStorage round-trip', () => {
    const conditions = [
      { field: 'category', operator: 'is', value: 'PTO', logic: 'AND' },
    ];
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persisted Cond', {
        categories: new Set(['PTO']),
        resources: new Set(),
        sources: new Set(),
        search: '',
        dateRange: null,
      }, { conditions });
    });

    // Re-mount hook to reload from localStorage
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views).toHaveLength(1);
    expect(result2.current.views[0].conditions!).toEqual(conditions);
  });

  it('updateView persists conditions', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Update Cond', {
        categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      });
    });
    const id = result.current.views[0].id!;
    const newConditions = [
      { field: 'title', operator: 'contains', value: 'meeting', logic: 'AND' },
    ];
    act(() => {
      result.current.updateView(id, { conditions: newConditions });
    });
    expect(result.current.views[0].conditions!).toEqual(newConditions);
  });
});

describe('deserializeFilters dateRange validation', () => {
  it('nulls malformed dateRange objects', () => {
    const filters = deserializeFilters({
      categories: [],
      resources: [],
      sources: [],
      search: '',
      dateRange: { start: 'not-a-date', end: '2026-04-30T00:00:00.000Z' },
    });
    expect(filters.dateRange).toBeNull();
  });
});

const EMPTY_FILTERS: LiveFilters = makeEmptyLiveFilters();

describe('useSavedViews — groupBy persistence', () => {
  it('saveView stores groupBy when provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Grouped View', EMPTY_FILTERS, { groupBy: 'department' });
    });
    expect(result.current.views[0].groupBy!).toBe('department');
  });

  it('saveView defaults groupBy to null when not provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Plain View', EMPTY_FILTERS);
    });
    expect(result.current.views[0].groupBy!).toBeNull();
  });

  it('groupBy survives localStorage round-trip', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persisted Group', EMPTY_FILTERS, { groupBy: 'role' });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].groupBy!).toBe('role');
  });

  it('normalizeSavedView strips non-string groupBy values', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Bad Group', EMPTY_FILTERS, { groupBy: 42 });
    });
    expect(result.current.views[0].groupBy!).toBeNull();
  });

  it('resaveView updates groupBy when passed', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Resave Test', EMPTY_FILTERS, { groupBy: 'role' });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, 'agenda', 'department');
    });
    expect(result.current.views[0].groupBy!).toBe('department');
  });

  it('resaveView preserves existing groupBy when not passed', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Preserve Test', EMPTY_FILTERS, { groupBy: 'role' });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, 'month');
    });
    expect(result.current.views[0].groupBy!).toBe('role');
  });

  it('saveView accepts groupBy as string array (multi-level)', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Multi', EMPTY_FILTERS, { groupBy: ['location', 'shift'] });
    });
    expect(result.current.views[0].groupBy!).toEqual(['location', 'shift']);
  });

  it('saveView accepts groupBy as GroupConfig array and strips functions', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Configs', EMPTY_FILTERS, {
        groupBy: [
          { field: 'location', label: 'Site', showEmpty: false, getKey: () => 'x' },
          { field: 'shift' },
        ],
      });
    });
    expect(result.current.views[0].groupBy!).toEqual([
      { field: 'location', label: 'Site', showEmpty: false },
      { field: 'shift' },
    ]);
  });

  it('GroupConfig arrays survive localStorage round-trip', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persist', EMPTY_FILTERS, {
        groupBy: [{ field: 'location', label: 'Site' }, 'shift'],
      });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    // Mixed string/object arrays get simplified to string[] when every entry is a string.
    // The mixed case above preserves object form with strings stripped out — we expect
    // only the valid objects to survive.
    expect(result2.current.views[0].groupBy!).toEqual([
      { field: 'location', label: 'Site' },
    ]);
  });
});

// ── Sort persistence ──────────────────────────────────────────────────────────

describe('useSavedViews — sort persistence', () => {
  it('saveView stores sort array when provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    const sort = [{ field: 'start', direction: 'asc' }, { field: 'priority', direction: 'desc' }];
    act(() => {
      result.current.saveView('Sorted', EMPTY_FILTERS, { sort });
    });
    expect(result.current.views[0].sort!).toEqual(sort);
  });

  it('saveView defaults sort to null when not provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Unsorted', EMPTY_FILTERS);
    });
    expect(result.current.views[0].sort!).toBeNull();
  });

  it('saveView strips invalid sort entries', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Mixed', EMPTY_FILTERS, {
        sort: [
          { field: 'start', direction: 'asc' },
          { field: 'bad', direction: 'sideways' },
          { direction: 'asc' },
          { field: 'priority', direction: 'desc' },
        ],
      });
    });
    expect(result.current.views[0].sort!).toEqual([
      { field: 'start', direction: 'asc' },
      { field: 'priority', direction: 'desc' },
    ]);
  });

  it('saveView strips non-serialisable getValue from sort entries', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Fn', EMPTY_FILTERS, {
        sort: [{ field: 'start', direction: 'asc', getValue: () => 0 }],
      });
    });
    expect(result.current.views[0].sort!).toEqual([
      { field: 'start', direction: 'asc' },
    ]);
  });

  it('sort survives localStorage round-trip', () => {
    const sort = [{ field: 'start', direction: 'asc' }];
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persist sort', EMPTY_FILTERS, { sort });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].sort!).toEqual(sort);
  });
});

// ── collapsedGroups / showAllGroups ───────────────────────────────────────────

describe('useSavedViews — collapsedGroups + showAllGroups', () => {
  it('saveView accepts Set<string> and persists as string[]', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Collapsed', EMPTY_FILTERS, {
        collapsedGroups: new Set(['ICU', 'ER/Night']),
      });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].collapsedGroups!).toEqual(expect.arrayContaining(['ICU', 'ER/Night']));
    expect(Array.isArray(result2.current.views[0].collapsedGroups!)).toBe(true);
  });

  it('saveView treats empty collapsedGroups as null', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Empty', EMPTY_FILTERS, { collapsedGroups: new Set() });
    });
    expect(result.current.views[0].collapsedGroups!).toBeNull();
  });

  it('saveView stores showAllGroups as a boolean', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Cross', EMPTY_FILTERS, { showAllGroups: true });
    });
    expect(result.current.views[0].showAllGroups!).toBe(true);
  });

  it('saveView defaults showAllGroups to null when not provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Default', EMPTY_FILTERS);
    });
    expect(result.current.views[0].showAllGroups!).toBeNull();
  });

  it('saveView strips non-boolean showAllGroups', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Bad', EMPTY_FILTERS, { showAllGroups: 'yes' });
    });
    expect(result.current.views[0].showAllGroups!).toBeNull();
  });
});

// ── v2 → v4 migration ─────────────────────────────────────────────────────────

describe('useSavedViews — storage v2 → v4 migration', () => {
  it('loads v2 payloads without dropping entries', () => {
    const v2 = {
      version: 2,
      views: [
        {
          id: 'v-legacy',
          name: 'From v2',
          createdAt: new Date().toISOString(),
          groupBy: 'role',
          filters: makeEmptyStoredFilters(),
        },
      ],
    };
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify(v2));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name!).toBe('From v2');
    expect(result.current.views[0].groupBy!).toBe('role');
  });

  it('fills new v3 fields with null when missing from v2 entries', () => {
    const v2 = {
      version: 2,
      views: [
        {
          id: 'v-legacy',
          name: 'From v2',
          createdAt: new Date().toISOString(),
          filters: makeEmptyStoredFilters(),
        },
      ],
    };
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify(v2));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views[0].sort!).toBeNull();
    expect(result.current.views[0].collapsedGroups!).toBeNull();
    expect(result.current.views[0].showAllGroups!).toBeNull();
  });

  it('re-persists loaded v2 data as v3 on the next save', () => {
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify({
      version: 2,
      views: [{
        id: 'v-legacy',
        name: 'From v2',
        createdAt: new Date().toISOString(),
        filters: makeEmptyStoredFilters(),
      }],
    }));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('New One', EMPTY_FILTERS);
    });
    const storedJson = localStorage.getItem(`wc-saved-views-${CAL_ID}`);
    expect(storedJson).not.toBeNull();
    if (!storedJson) throw new Error('Expected saved views payload in localStorage');
    const stored = JSON.parse(storedJson);
    expect(stored.version).toBe(4);
    expect(stored.views).toHaveLength(2);
  });

  it('rejects a future version it does not know how to read', () => {
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify({
      version: 999,
      views: [{ id: 'x', name: 'Future', createdAt: '', filters: { categories: [] } }],
    }));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toEqual([]);
  });
});

describe('useSavedViews — sortBy persistence', () => {
  it('saveView stores a valid sortBy array', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    const sortBy = [
      { field: 'start',    direction: 'asc'  },
      { field: 'priority', direction: 'desc' },
    ];
    act(() => {
      result.current.saveView('Sorted', EMPTY_FILTERS, { sortBy });
    });
    expect(result.current.views[0].sortBy!).toEqual(sortBy);
  });

  it('saveView defaults sortBy to null when not provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Plain', EMPTY_FILTERS);
    });
    expect(result.current.views[0].sortBy!).toBeNull();
  });

  it('sortBy survives localStorage round-trip', () => {
    const sortBy = [{ field: 'start', direction: 'desc' }];
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persisted Sort', EMPTY_FILTERS, { sortBy });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].sortBy!).toEqual(sortBy);
  });

  it('normalizeSavedView drops malformed sortBy entries', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Mixed', EMPTY_FILTERS, {
        sortBy: [
          { field: 'start', direction: 'asc' },
          { field: 42, direction: 'asc' },            // bad field type
          { field: 'bad', direction: 'sideways' },    // bad direction
          null,
        ],
      });
    });
    expect(result.current.views[0].sortBy!).toEqual([
      { field: 'start', direction: 'asc' },
    ]);
  });

  it('normalizeSavedView returns null when all entries are invalid', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('All Bad', EMPTY_FILTERS, {
        sortBy: ['not-an-object', { only: 'field' }],
      });
    });
    expect(result.current.views[0].sortBy!).toBeNull();
  });

  it('resaveView updates sortBy when opts.sortBy is passed', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Resave Sort', EMPTY_FILTERS, {
        sortBy: [{ field: 'start', direction: 'asc' }],
      });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, undefined, undefined, {
        sortBy: [{ field: 'end', direction: 'desc' }],
      });
    });
    expect(result.current.views[0].sortBy!).toEqual([
      { field: 'end', direction: 'desc' },
    ]);
  });

  it('resaveView preserves sortBy when opts.sortBy is not passed', () => {
    const originalSort = [{ field: 'start', direction: 'asc' }];
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Preserve Sort', EMPTY_FILTERS, { sortBy: originalSort });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, 'agenda', 'department');
    });
    expect(result.current.views[0].sortBy!).toEqual(originalSort);
  });
});

describe('useSavedViews — zoomLevel persistence', () => {
  it('saveView accepts valid Assets zoom levels', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    for (const level of ['day', 'week', 'month', 'quarter']) {
      localStorage.clear();
      act(() => {
        result.current.saveView(`View ${level}`, EMPTY_FILTERS, { zoomLevel: level });
      });
      const lastView = result.current.views.at(-1);
      expect(lastView).toBeDefined();
      expect(lastView?.zoomLevel).toBe(level);
    }
  });

  it('saveView defaults zoomLevel to null when not provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Plain', EMPTY_FILTERS);
    });
    expect(result.current.views[0].zoomLevel!).toBeNull();
  });

  it('zoomLevel survives localStorage round-trip', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Zoomed', EMPTY_FILTERS, { zoomLevel: 'quarter' });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].zoomLevel!).toBe('quarter');
  });

  it('normalizeSavedView rejects unknown zoom levels', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Bad Zoom', EMPTY_FILTERS, { zoomLevel: 'century' });
    });
    expect(result.current.views[0].zoomLevel!).toBeNull();
  });

  it('resaveView updates zoomLevel via opts', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Resave Zoom', EMPTY_FILTERS, { zoomLevel: 'day' });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, undefined, undefined, { zoomLevel: 'month' });
    });
    expect(result.current.views[0].zoomLevel!).toBe('month');
  });
});

describe('useSavedViews — resaveView collapsedGroups persistence', () => {
  it('resaveView updates collapsedGroups via opts', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Cg', EMPTY_FILTERS, { collapsedGroups: new Set(['A']) });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, undefined, undefined, {
        collapsedGroups: new Set(['B', 'C']),
      });
    });
    expect(result.current.views[0].collapsedGroups!).toEqual(
      expect.arrayContaining(['B', 'C']),
    );
    expect(result.current.views[0].collapsedGroups!).not.toContain('A');
  });

  it('resaveView preserves collapsedGroups when opts.collapsedGroups is omitted', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Cg preserve', EMPTY_FILTERS, {
        collapsedGroups: new Set(['keep']),
      });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, 'agenda', 'department');
    });
    expect(result.current.views[0].collapsedGroups!).toEqual(['keep']);
  });

  it('resaveView clears collapsedGroups when given an empty Set', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Cg clear', EMPTY_FILTERS, {
        collapsedGroups: new Set(['X']),
      });
    });
    const id = result.current.views[0].id!;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, undefined, undefined, {
        collapsedGroups: new Set(),
      });
    });
    expect(result.current.views[0].collapsedGroups!).toBeNull();
  });
});

// ── hiddenFromStrip + toggleStripVisibility ───────────────────────────────────

describe('useSavedViews — hiddenFromStrip strip visibility', () => {
  it('saveView defaults hiddenFromStrip to false so new views appear in the strip', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Visible', EMPTY_FILTERS);
    });
    expect(result.current.views[0].hiddenFromStrip!).toBe(false);
  });

  it('toggleStripVisibility flips hiddenFromStrip on and off', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Toggle', EMPTY_FILTERS);
    });
    const id = result.current.views[0].id!;

    act(() => { result.current.toggleStripVisibility(id); });
    expect(result.current.views[0].hiddenFromStrip!).toBe(true);

    act(() => { result.current.toggleStripVisibility(id); });
    expect(result.current.views[0].hiddenFromStrip!).toBe(false);
  });

  it('updateView can set hiddenFromStrip directly via patch', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Direct', EMPTY_FILTERS);
    });
    const id = result.current.views[0].id!;
    act(() => { result.current.updateView(id, { hiddenFromStrip: true }); });
    expect(result.current.views[0].hiddenFromStrip!).toBe(true);
  });

  it('hiddenFromStrip survives localStorage round-trip', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persist hidden', EMPTY_FILTERS);
    });
    const id = result.current.views[0].id!;
    act(() => { result.current.toggleStripVisibility(id); });

    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].hiddenFromStrip!).toBe(true);
  });

  it('v2/v3 payloads migrate with hiddenFromStrip = false (existing views remain visible)', () => {
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify({
      version: 3,
      views: [{
        id: 'v-old',
        name: 'Old',
        createdAt: new Date().toISOString(),
        filters: { categories: [], resources: [], sources: [], search: '', dateRange: null },
      }],
    }));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views[0].hiddenFromStrip!).toBe(false);
  });
});

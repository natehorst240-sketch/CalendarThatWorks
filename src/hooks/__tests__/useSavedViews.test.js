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
} from '../useSavedViews.js';

const CAL_ID = 'test-cal';

beforeEach(() => {
  localStorage.clear();
});

// ── serializeFilters / deserializeFilters ──────────────────────────────────────

describe('serializeFilters', () => {
  it('converts Sets to arrays', () => {
    const filters = {
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
    const saved = {
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
    const saved = {
      categories: [],
      resources:  [],
      sources:    [],
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
    const filters = {
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
    expect(view.name).toBe('My View');
    expect(typeof view.id).toBe('string');
    expect(view.id.length).toBeGreaterThan(0);
    expect(view.createdAt).toBeDefined();
    // Filters should be serialized (arrays, not Sets)
    expect(Array.isArray(view.filters.categories)).toBe(true);
    expect(view.filters.categories).toContain('Work');
  });

  it('saveView returns the created view object', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    let created;
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
    expect(created.name).toBe('Return Test');
  });

  it('deleteView removes a view by id', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('View A', { categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null });
      result.current.saveView('View B', { categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null });
    });
    expect(result.current.views).toHaveLength(2);
    const idToDelete = result.current.views[0].id;
    act(() => {
      result.current.deleteView(idToDelete);
    });
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name).toBe('View B');
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
    const stored = JSON.parse(localStorage.getItem(`wc-saved-views-${CAL_ID}`));
    expect(stored.version).toBe(2);
    expect(stored.views).toHaveLength(1);
    expect(stored.views[0].name).toBe('Persisted');
  });

  it('loads existing views from localStorage on init', () => {
    const existingViews = [
      {
        id:        'v1',
        name:      'Stored View',
        createdAt: new Date().toISOString(),
        filters:   { categories: ['PTO'], resources: [], sources: [], search: '', dateRange: null },
      },
    ];
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify({
      version: 2,
      views: existingViews,
    }));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name).toBe('Stored View');
  });

  it('migrates old array-only saved views payload', () => {
    const existingViews = [
      {
        id: 'v-old',
        name: 'Old Shape',
        createdAt: new Date().toISOString(),
        filters: { categories: [], resources: [], sources: [], search: '', dateRange: null },
      },
    ];
    localStorage.setItem(`wc-saved-views-${CAL_ID}`, JSON.stringify(existingViews));
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name).toBe('Old Shape');
  });

  it('calendarId switching reloads from correct localStorage key', () => {
    const viewsA = [{ id: 'va', name: 'View A', createdAt: '', filters: { categories: [], resources: [], sources: [], search: '', dateRange: null } }];
    const viewsB = [{ id: 'vb', name: 'View B', createdAt: '', filters: { categories: [], resources: [], sources: [], search: '', dateRange: null } }];
    localStorage.setItem('wc-saved-views-cal-a', JSON.stringify(viewsA));
    localStorage.setItem('wc-saved-views-cal-b', JSON.stringify(viewsB));

    const { result, rerender } = renderHook(({ id }) => useSavedViews(id), {
      initialProps: { id: 'cal-a' },
    });
    expect(result.current.views[0].name).toBe('View A');

    rerender({ id: 'cal-b' });
    expect(result.current.views[0].name).toBe('View B');
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
    expect(result.current.views[0].color).toBe('#ef4444');
    expect(result.current.views[0].view).toBe('week');
  });

  it('updateView renames a view', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Original', {
        categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      });
    });
    const id = result.current.views[0].id;
    act(() => {
      result.current.updateView(id, { name: 'Renamed' });
    });
    expect(result.current.views[0].name).toBe('Renamed');
  });

  it('updateView changes a view color', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('My View', {
        categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      }, { color: '#3b82f6' });
    });
    const id = result.current.views[0].id;
    act(() => {
      result.current.updateView(id, { color: '#10b981' });
    });
    expect(result.current.views[0].color).toBe('#10b981');
  });

  it('resaveView replaces the filters of an existing view', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Work View', {
        categories: new Set(['Work']), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      });
    });
    const id = result.current.views[0].id;
    act(() => {
      result.current.resaveView(id, {
        categories: new Set(['PTO']), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      }, 'month');
    });
    expect(result.current.views[0].filters.categories).toContain('PTO');
    expect(result.current.views[0].filters.categories).not.toContain('Work');
    expect(result.current.views[0].view).toBe('month');
  });

  it('migrates legacy wc-profiles-* data on first load', () => {
    const legacyProfiles = [{
      id: 'p1', name: 'Old Profile', color: '#3b82f6', view: 'week',
      filters: { categories: ['Work'], resources: [], search: '' },
    }];
    localStorage.setItem('wc-profiles-test-cal', JSON.stringify(legacyProfiles));
    const { result } = renderHook(() => useSavedViews('test-cal'));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views[0].name).toBe('Old Profile');
    expect(result.current.views[0].color).toBe('#3b82f6');
    expect(result.current.views[0].view).toBe('week');
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
    expect(result.current.views[0].conditions).toEqual(conditions);
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
    expect(result2.current.views[0].conditions).toEqual(conditions);
  });

  it('updateView persists conditions', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Update Cond', {
        categories: new Set(), resources: new Set(), sources: new Set(), search: '', dateRange: null,
      });
    });
    const id = result.current.views[0].id;
    const newConditions = [
      { field: 'title', operator: 'contains', value: 'meeting', logic: 'AND' },
    ];
    act(() => {
      result.current.updateView(id, { conditions: newConditions });
    });
    expect(result.current.views[0].conditions).toEqual(newConditions);
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

const EMPTY_FILTERS = {
  categories: new Set(),
  resources:  new Set(),
  sources:    new Set(),
  search:     '',
  dateRange:  null,
};

describe('useSavedViews — groupBy persistence', () => {
  it('saveView stores groupBy when provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Grouped View', EMPTY_FILTERS, { groupBy: 'department' });
    });
    expect(result.current.views[0].groupBy).toBe('department');
  });

  it('saveView defaults groupBy to null when not provided', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Plain View', EMPTY_FILTERS);
    });
    expect(result.current.views[0].groupBy).toBeNull();
  });

  it('groupBy survives localStorage round-trip', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Persisted Group', EMPTY_FILTERS, { groupBy: 'role' });
    });
    const { result: result2 } = renderHook(() => useSavedViews(CAL_ID));
    expect(result2.current.views[0].groupBy).toBe('role');
  });

  it('normalizeSavedView strips non-string groupBy values', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Bad Group', EMPTY_FILTERS, { groupBy: 42 });
    });
    expect(result.current.views[0].groupBy).toBeNull();
  });

  it('resaveView updates groupBy when passed', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Resave Test', EMPTY_FILTERS, { groupBy: 'role' });
    });
    const id = result.current.views[0].id;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, 'agenda', 'department');
    });
    expect(result.current.views[0].groupBy).toBe('department');
  });

  it('resaveView preserves existing groupBy when not passed', () => {
    const { result } = renderHook(() => useSavedViews(CAL_ID));
    act(() => {
      result.current.saveView('Preserve Test', EMPTY_FILTERS, { groupBy: 'role' });
    });
    const id = result.current.views[0].id;
    act(() => {
      result.current.resaveView(id, EMPTY_FILTERS, 'month');
    });
    expect(result.current.views[0].groupBy).toBe('role');
  });
});

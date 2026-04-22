/**
 * useSourceStore unit tests.
 *
 * Tests the pure storage helpers (loadSources, persistSources) and
 * the React hook via @testing-library/react renderHook.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { loadSources, persistSources, useSourceStore } from '../useSourceStore';

const CAL_ID = 'test-calendar';

function sourceKey(id: string): string { return `wc-sources-${id}`; }
function legacyKey(id: string): string { return `wc-feeds-${id}`; }

beforeEach(() => {
  localStorage.clear();
});

// ── loadSources / persistSources ──────────────────────────────────────────────

describe('loadSources', () => {
  it('returns [] when nothing stored', () => {
    expect(loadSources(CAL_ID)).toEqual([]);
  });

  it('returns stored sources', () => {
    const stored = [{ id: 's1', type: 'ics', label: 'Work', url: 'https://example.com/a.ics', enabled: true }];
    persistSources(CAL_ID, stored);
    expect(loadSources(CAL_ID)).toEqual(stored);
  });

  it('migrates legacy wc-feeds- entries as type:ics', () => {
    const legacy = [
      { id: 'f1', url: 'https://example.com/b.ics', label: 'Legacy', enabled: true, refreshInterval: 300000 },
    ];
    localStorage.setItem(legacyKey(CAL_ID), JSON.stringify(legacy));

    const sources = loadSources(CAL_ID);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('ics');
    expect(sources[0].id).toBe('f1');
    // Migration persists under new key
    expect(localStorage.getItem(sourceKey(CAL_ID))).not.toBeNull();
  });

  it('prefers new key over legacy when both exist', () => {
    const newSrc = [{ id: 'new', type: 'csv', label: 'CSV', enabled: true }];
    persistSources(CAL_ID, newSrc);
    localStorage.setItem(legacyKey(CAL_ID), JSON.stringify([{ id: 'old' }]));

    expect(loadSources(CAL_ID)[0].id).toBe('new');
  });

  it('returns [] on JSON parse error', () => {
    localStorage.setItem(sourceKey(CAL_ID), 'INVALID JSON}}}');
    expect(loadSources(CAL_ID)).toEqual([]);
  });
});

describe('persistSources', () => {
  it('saves sources to localStorage', () => {
    const sources = [{ id: 's1', type: 'ics' }];
    persistSources(CAL_ID, sources);
    expect(JSON.parse(localStorage.getItem(sourceKey(CAL_ID)))).toEqual(sources);
  });
});

// ── useSourceStore hook ───────────────────────────────────────────────────────

function renderStore(calendarId: string = CAL_ID) {
  return renderHook(() => useSourceStore(calendarId));
}

describe('useSourceStore — addSource', () => {
  it('adds an ICS source with generated id', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', label: 'A' }); });
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.sources[0].id).toMatch(/^src-/);
    expect(result.current.sources[0].type).toBe('ics');
  });

  it('adds a CSV source with events', () => {
    const { result } = renderStore();
    const events = [{ id: 'e1', title: 'Meeting', start: new Date() }];
    act(() => { result.current.addSource({ type: 'csv', label: 'My CSV', events }); });
    expect(result.current.sources[0].type).toBe('csv');
    expect(result.current.sources[0].events).toHaveLength(1);
  });

  it('defaults to enabled:true', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'ics', url: 'https://x.com/x.ics' }); });
    expect(result.current.sources[0].enabled).toBe(true);
  });

  it('returns the created source object', () => {
    const { result } = renderStore();
    let created: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    act(() => { created = result.current.addSource({ type: 'ics', label: 'X' }); });
    if (!created) throw new Error('Expected addSource to return created source');
    expect(created.id).toBeDefined();
  });

  it('accumulates multiple sources', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics' }); });
    act(() => { result.current.addSource({ type: 'csv', events: [] }); });
    expect(result.current.sources).toHaveLength(2);
  });
});

describe('useSourceStore — removeSource', () => {
  it('removes a source by id', () => {
    const { result } = renderStore();
    let src: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    act(() => { src = result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics' }); });
    if (!src) throw new Error('Expected source to exist');
    act(() => { result.current.removeSource(src.id); });
    expect(result.current.sources).toHaveLength(0);
  });

  it('leaves other sources intact', () => {
    const { result } = renderStore();
    let s1: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    let s2: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    act(() => {
      s1 = result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', label: 'A' });
      s2 = result.current.addSource({ type: 'ics', url: 'https://b.com/b.ics', label: 'B' });
    });
    if (!s1 || !s2) throw new Error('Expected both sources to be created');
    act(() => { result.current.removeSource(s1.id); });
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.sources[0].id).toBe(s2.id);
  });
});

describe('useSourceStore — updateSource', () => {
  it('patches a source by id', () => {
    const { result } = renderStore();
    let src: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    act(() => { src = result.current.addSource({ type: 'ics', label: 'Old', url: 'https://a.com/a.ics' }); });
    if (!src) throw new Error('Expected source to exist');
    act(() => { result.current.updateSource(src.id, { label: 'New' }); });
    expect(result.current.sources[0].label).toBe('New');
  });

  it('does not affect unrelated fields', () => {
    const { result } = renderStore();
    let src: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    act(() => { src = result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', color: '#ff0000' }); });
    if (!src) throw new Error('Expected source to exist');
    act(() => { result.current.updateSource(src.id, { label: 'Updated' }); });
    expect(result.current.sources[0].color).toBe('#ff0000');
  });
});

describe('useSourceStore — toggleSource', () => {
  it('flips enabled flag', () => {
    const { result } = renderStore();
    let src: ReturnType<ReturnType<typeof useSourceStore>['addSource']> | undefined;
    act(() => { src = result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', enabled: true }); });
    if (!src) throw new Error('Expected source to exist');
    act(() => { result.current.toggleSource(src.id); });
    expect(result.current.sources[0].enabled).toBe(false);
    act(() => { result.current.toggleSource(src.id); });
    expect(result.current.sources[0].enabled).toBe(true);
  });
});

// ── Derived views ─────────────────────────────────────────────────────────────

describe('useSourceStore — activeIcsSources', () => {
  it('includes enabled ICS sources with a URL', () => {
    const { result } = renderStore();
    act(() => {
      result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', label: 'A', enabled: true });
    });
    expect(result.current.activeIcsSources).toHaveLength(1);
    expect(result.current.activeIcsSources[0].url).toBe('https://a.com/a.ics');
  });

  it('excludes disabled ICS sources', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', enabled: false }); });
    expect(result.current.activeIcsSources).toHaveLength(0);
  });

  it('excludes ICS sources without URL', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'ics', url: '', enabled: true }); });
    expect(result.current.activeIcsSources).toHaveLength(0);
  });

  it('excludes CSV sources', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'csv', events: [{ id: '1', title: 'X', start: new Date() }] }); });
    expect(result.current.activeIcsSources).toHaveLength(0);
  });

  it('maps to ICalFeed shape (url, label, refreshInterval)', () => {
    const { result } = renderStore();
    act(() => {
      result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', label: 'A', refreshInterval: 900000 });
    });
    const feed = result.current.activeIcsSources[0];
    expect(Object.keys(feed)).toEqual(expect.arrayContaining(['url', 'label', 'refreshInterval']));
    expect(feed.refreshInterval).toBe(900000);
  });
});

describe('useSourceStore — activeCsvSources', () => {
  it('includes enabled CSV sources with events', () => {
    const { result } = renderStore();
    act(() => {
      result.current.addSource({ type: 'csv', events: [{ id: 'e1', title: 'T', start: new Date() }], enabled: true });
    });
    expect(result.current.activeCsvSources).toHaveLength(1);
  });

  it('excludes disabled CSV sources', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'csv', events: [{ id: 'e1', title: 'T', start: new Date() }], enabled: false }); });
    expect(result.current.activeCsvSources).toHaveLength(0);
  });

  it('excludes CSV sources with no events', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'csv', events: [], enabled: true }); });
    expect(result.current.activeCsvSources).toHaveLength(0);
  });
});

// ── Persistence ───────────────────────────────────────────────────────────────

describe('useSourceStore — persistence', () => {
  it('persists sources to localStorage', () => {
    const { result } = renderStore();
    act(() => { result.current.addSource({ type: 'ics', url: 'https://a.com/a.ics', label: 'A' }); });
    const stored = JSON.parse(localStorage.getItem(sourceKey(CAL_ID)));
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe('A');
  });

  it('loads persisted sources on mount', () => {
    persistSources(CAL_ID, [{ id: 'pre', type: 'csv', label: 'Pre', enabled: true, events: [] }]);
    const { result } = renderStore();
    expect(result.current.sources[0].id).toBe('pre');
  });
});

// ── calendarId switching ──────────────────────────────────────────────────────

describe('useSourceStore — calendarId switching', () => {
  it('reloads sources when calendarId changes', () => {
    persistSources('cal-a', [{ id: 'a1', type: 'ics', label: 'A', enabled: true }]);
    persistSources('cal-b', [{ id: 'b1', type: 'csv', label: 'B', enabled: true, events: [] }]);

    const { result, rerender } = renderHook(
      ({ calendarId }) => useSourceStore(calendarId),
      { initialProps: { calendarId: 'cal-a' } },
    );

    expect(result.current.sources[0].id).toBe('a1');
    rerender({ calendarId: 'cal-b' });
    expect(result.current.sources[0].id).toBe('b1');
  });
});

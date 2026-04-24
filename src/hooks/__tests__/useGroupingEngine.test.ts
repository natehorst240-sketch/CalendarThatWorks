import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroupingEngine } from '../useGrouping.ts'
import { normalizeGroupConfig } from '../useNormalizedConfig.ts'
import type { NormalizedEvent } from '../../types/events.ts'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'e',
    title: 'Event',
    start: new Date('2024-01-01T09:00:00'),
    end: new Date('2024-01-01T10:00:00'),
    allDay: false,
    category: null,
    color: '#3b82f6',
    resource: null,
    status: 'confirmed',
    rrule: null,
    exdates: [],
    meta: {},
    _raw: { title: 'Raw Event', start: new Date('2024-01-01T09:00:00') },
    ...overrides,
  }
}

const ICU = makeEvent({ id: 'icu1', category: 'ICU' })
const ICU2 = makeEvent({ id: 'icu2', category: 'ICU' })
const ER = makeEvent({ id: 'er1', category: 'ER' })
const NO_CAT = makeEvent({ id: 'nocat', category: null })
const META_LOC = makeEvent({ id: 'meta1', meta: { location: 'North' } })
const META_LOC2 = makeEvent({ id: 'meta2', meta: { location: 'South' } })

// ── normalizeGroupConfig ───────────────────────────────────────────────────────

describe('normalizeGroupConfig', () => {
  it('returns [] for null', () => {
    expect(normalizeGroupConfig(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(normalizeGroupConfig(undefined)).toEqual([])
  })

  it('normalises a string to [{ field }]', () => {
    expect(normalizeGroupConfig('category')).toEqual([{ field: 'category' }])
  })

  it('normalises a string array to GroupConfig[]', () => {
    expect(normalizeGroupConfig(['location', 'shift'])).toEqual([
      { field: 'location' },
      { field: 'shift' },
    ])
  })

  it('passes a single GroupConfig through as a single-element array', () => {
    const cfg = { field: 'location', label: 'Location', showEmpty: false }
    expect(normalizeGroupConfig(cfg)).toEqual([cfg])
  })

  it('passes a GroupConfig[] through unchanged', () => {
    const cfgs = [{ field: 'location' }, { field: 'shift' }]
    expect(normalizeGroupConfig(cfgs)).toEqual(cfgs)
  })

  it('mixes strings and GroupConfig objects in an array', () => {
    const result = normalizeGroupConfig(['location', { field: 'shift', label: 'Shift' }])
    expect(result).toEqual([
      { field: 'location' },
      { field: 'shift', label: 'Shift' },
    ])
  })

  it('truncates configs longer than 3 levels', () => {
    const result = normalizeGroupConfig(['a', 'b', 'c', 'd'])
    expect(result.length).toBe(3)
    expect(result.map(c => c.field)).toEqual(['a', 'b', 'c'])
  })
})

// ── useGroupingEngine — ungrouped passthrough ──────────────────────────────────

describe('useGroupingEngine — no groupBy', () => {
  it('groups is [] and ungrouped holds all events when groupBy is null', () => {
    const events = [ICU, ER]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: null }),
    )
    expect(result.current.groups).toEqual([])
    expect(result.current.ungrouped).toBe(events)
    expect(result.current.isGrouped).toBe(false)
  })

  it('groups is [] and ungrouped holds all events when groupBy is undefined', () => {
    const events = [ICU]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: undefined }),
    )
    expect(result.current.ungrouped).toBe(events)
  })
})

// ── useGroupingEngine — single-level grouping ──────────────────────────────────

describe('useGroupingEngine — single-level', () => {
  it('produces one GroupResult per distinct key', () => {
    const events = [ICU, ICU2, ER]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: 'category' }),
    )
    expect(result.current.isGrouped).toBe(true)
    expect(result.current.groups.length).toBe(2)
  })

  it('group keys match event field values', () => {
    const events = [ICU, ER]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: 'category' }),
    )
    const keys = result.current.groups.map(g => g.key)
    expect(keys).toContain('ICU')
    expect(keys).toContain('ER')
  })

  it('groups are sorted alphabetically', () => {
    const events = [ER, ICU]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: 'category' }),
    )
    const keys = result.current.groups.map(g => g.key)
    expect(keys).toEqual(['ER', 'ICU'])
  })

  it('events in each group match expected count', () => {
    const events = [ICU, ICU2, ER]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: 'category' }),
    )
    const icuGroup = result.current.groups.find(g => g.key === 'ICU')!
    expect(icuGroup.events.length).toBe(2)
    expect(icuGroup.events.map(e => e.id)).toContain('icu1')
    expect(icuGroup.events.map(e => e.id)).toContain('icu2')
  })

  it('null field value goes to (Ungrouped), sorted last', () => {
    const events = [ICU, NO_CAT, ER]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: 'category' }),
    )
    const keys = result.current.groups.map(g => g.key)
    expect(keys[keys.length - 1]).toBe('(Ungrouped)')
  })

  it('reads from meta when direct field is absent', () => {
    const events = [META_LOC, META_LOC2]
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: 'location' }),
    )
    const keys = result.current.groups.map(g => g.key)
    expect(keys).toContain('North')
    expect(keys).toContain('South')
  })

  it('leaf groups have depth 0 and no children', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU, ER], groupBy: 'category' }),
    )
    result.current.groups.forEach(g => {
      expect(g.depth).toBe(0)
      expect(g.children).toEqual([])
    })
  })

  it('ungrouped is [] when groupBy is set', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU], groupBy: 'category' }),
    )
    expect(result.current.ungrouped).toEqual([])
  })

  it('empty events array produces empty groups', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [], groupBy: 'category' }),
    )
    expect(result.current.groups).toEqual([])
  })
})

// ── useGroupingEngine — multi-level grouping ───────────────────────────────────

describe('useGroupingEngine — multi-level (2 levels)', () => {
  const events = [
    makeEvent({ id: 'a', category: 'ICU', meta: { shift: 'Day' } }),
    makeEvent({ id: 'b', category: 'ICU', meta: { shift: 'Night' } }),
    makeEvent({ id: 'c', category: 'ER', meta: { shift: 'Day' } }),
  ]

  it('produces nested children at depth 1', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: ['category', 'shift'] }),
    )
    const icuGroup = result.current.groups.find(g => g.key === 'ICU')!
    expect(icuGroup.events).toEqual([]) // branch node — no direct events
    expect(icuGroup.children.length).toBe(2)
  })

  it('children have correct depth', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: ['category', 'shift'] }),
    )
    const icuGroup = result.current.groups.find(g => g.key === 'ICU')!
    icuGroup.children.forEach(child => expect(child.depth).toBe(1))
  })

  it('leaf nodes hold the correct events', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events, groupBy: ['category', 'shift'] }),
    )
    const icuDay = result.current.groups
      .find(g => g.key === 'ICU')!
      .children.find(c => c.key === 'Day')!
    expect(icuDay.events.length).toBe(1)
    expect(icuDay.events[0].id!).toBe('a')
  })
})

// ── useGroupingEngine — collapse / expand ──────────────────────────────────────

describe('useGroupingEngine — collapse/expand controls', () => {
  it('collapsedGroups starts empty', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU, ER], groupBy: 'category' }),
    )
    expect(result.current.collapsedGroups.size).toBe(0)
  })

  it('toggleGroup adds a path to collapsedGroups', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU, ER], groupBy: 'category' }),
    )
    act(() => result.current.toggleGroup('ICU'))
    expect(result.current.collapsedGroups.has('ICU')).toBe(true)
  })

  it('toggleGroup removes the path when already collapsed', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU, ER], groupBy: 'category' }),
    )
    act(() => result.current.toggleGroup('ICU'))
    act(() => result.current.toggleGroup('ICU'))
    expect(result.current.collapsedGroups.has('ICU')).toBe(false)
  })

  it('expandAll clears collapsedGroups', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU, ER], groupBy: 'category' }),
    )
    act(() => result.current.toggleGroup('ICU'))
    act(() => result.current.toggleGroup('ER'))
    act(() => result.current.expandAll())
    expect(result.current.collapsedGroups.size).toBe(0)
  })

  it('collapseAll adds all top-level group paths', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({ events: [ICU, ER], groupBy: 'category' }),
    )
    act(() => result.current.collapseAll())
    expect(result.current.collapsedGroups.has('ICU')).toBe(true)
    expect(result.current.collapsedGroups.has('ER')).toBe(true)
  })
})

// ── useGroupingEngine — custom GroupConfig options ─────────────────────────────

describe('useGroupingEngine — custom GroupConfig', () => {
  it('uses custom getKey extractor', () => {
    const events = [
      makeEvent({ id: 'a', title: 'Alpha Shift' }),
      makeEvent({ id: 'b', title: 'Bravo Shift' }),
    ]
    const { result } = renderHook(() =>
      useGroupingEngine({
        events,
        groupBy: {
          field: 'title',
          getKey: e => e.title.split(' ')[0],
        },
      }),
    )
    const keys = result.current.groups.map(g => g.key)
    expect(keys).toContain('Alpha')
    expect(keys).toContain('Bravo')
  })

  it('uses custom getLabel for display', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({
        events: [ICU],
        groupBy: {
          field: 'category',
          getLabel: key => `Unit: ${key}`,
        },
      }),
    )
    expect(result.current.groups[0].label!).toBe('Unit: ICU')
  })

  it('getKey returning null puts event in (Ungrouped)', () => {
    const { result } = renderHook(() =>
      useGroupingEngine({
        events: [ICU],
        groupBy: {
          field: 'category',
          getKey: () => null,
        },
      }),
    )
    expect(result.current.groups[0].key!).toBe('(Ungrouped)')
  })
})

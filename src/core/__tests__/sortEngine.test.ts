import { describe, it, expect } from 'vitest'
import { sortEvents, sortGroupKeys } from '../sortEngine.ts'
import type { NormalizedEvent } from '../../types/events.ts'
import type { SortConfig } from '../../types/grouping.ts'

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'e1',
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
    _raw: {} as any,
    ...overrides,
  }
}

// ── sortEvents ─────────────────────────────────────────────────────────────────

describe('sortEvents', () => {
  it('returns original array reference when no sort configs', () => {
    const events = [makeEvent({ id: 'a' }), makeEvent({ id: 'b' })]
    expect(sortEvents(events, [])).toBe(events)
  })

  it('does not mutate the original array', () => {
    const a = makeEvent({ id: 'a', title: 'Zebra' })
    const b = makeEvent({ id: 'b', title: 'Alpha' })
    const original = [a, b]
    const sorted = sortEvents(original, [{ field: 'title', direction: 'asc' }])
    expect(original[0]!.id).toBe('a') // unchanged
    expect(sorted[0]!.id).toBe('b')
  })

  it('sorts by direct string field ascending', () => {
    const events = [
      makeEvent({ id: 'c', title: 'Zulu' }),
      makeEvent({ id: 'a', title: 'Alpha' }),
      makeEvent({ id: 'b', title: 'Mike' }),
    ]
    const sorted = sortEvents(events, [{ field: 'title', direction: 'asc' }])
    expect(sorted.map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by direct string field descending', () => {
    const events = [
      makeEvent({ id: 'a', title: 'Alpha' }),
      makeEvent({ id: 'b', title: 'Zulu' }),
    ]
    const sorted = sortEvents(events, [{ field: 'title', direction: 'desc' }])
    expect(sorted[0]!.id).toBe('b')
  })

  it('sorts by Date field (start) ascending', () => {
    const events = [
      makeEvent({ id: 'late', start: new Date('2024-03-01') }),
      makeEvent({ id: 'early', start: new Date('2024-01-01') }),
      makeEvent({ id: 'mid', start: new Date('2024-02-01') }),
    ]
    const sorted = sortEvents(events, [{ field: 'start', direction: 'asc' }])
    expect(sorted.map(e => e.id)).toEqual(['early', 'mid', 'late'])
  })

  it('sorts by Date field descending', () => {
    const events = [
      makeEvent({ id: 'early', start: new Date('2024-01-01') }),
      makeEvent({ id: 'late', start: new Date('2024-03-01') }),
    ]
    const sorted = sortEvents(events, [{ field: 'start', direction: 'desc' }])
    expect(sorted[0]!.id).toBe('late')
  })

  it('sorts by meta field', () => {
    const events = [
      makeEvent({ id: 'b', meta: { priority: 'high' } }),
      makeEvent({ id: 'a', meta: { priority: 'low' } }),
    ]
    const sorted = sortEvents(events, [{ field: 'priority', direction: 'asc' }])
    // 'high' < 'low' lexicographically
    expect(sorted[0]!.id).toBe('b')
  })

  it('places nulls last regardless of direction', () => {
    const events = [
      makeEvent({ id: 'null', category: null }),
      makeEvent({ id: 'val', category: 'Surgery' }),
    ]
    const ascSorted = sortEvents(events, [{ field: 'category', direction: 'asc' }])
    expect(ascSorted[ascSorted.length - 1]!.id).toBe('null')

    const descSorted = sortEvents(events, [{ field: 'category', direction: 'desc' }])
    expect(descSorted[descSorted.length - 1]!.id).toBe('null')
  })

  it('applies tiebreaker when primary field is equal', () => {
    const events = [
      makeEvent({ id: 'b', category: 'ICU', title: 'Zulu' }),
      makeEvent({ id: 'a', category: 'ICU', title: 'Alpha' }),
    ]
    const configs: SortConfig[] = [
      { field: 'category', direction: 'asc' },
      { field: 'title', direction: 'asc' },
    ]
    const sorted = sortEvents(events, configs)
    expect(sorted.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('supports custom getValue extractor', () => {
    const events = [
      makeEvent({ id: 'b', meta: { score: 10 } }),
      makeEvent({ id: 'a', meta: { score: 90 } }),
    ]
    const config: SortConfig = {
      field: 'score',
      direction: 'desc',
      getValue: e => (e.meta as any).score as number,
    }
    const sorted = sortEvents(events, [config])
    expect(sorted[0]!.id).toBe('a') // 90 desc first
  })

  it('uses numeric locale sort for strings containing numbers', () => {
    const events = [
      makeEvent({ id: '10', title: 'Room 10' }),
      makeEvent({ id: '2', title: 'Room 2' }),
      makeEvent({ id: '1', title: 'Room 1' }),
    ]
    const sorted = sortEvents(events, [{ field: 'title', direction: 'asc' }])
    expect(sorted.map(e => e.id)).toEqual(['1', '2', '10'])
  })

  it('handles boolean fields', () => {
    const events = [
      makeEvent({ id: 'yes', allDay: true }),
      makeEvent({ id: 'no', allDay: false }),
    ]
    const sorted = sortEvents(events, [{ field: 'allDay', direction: 'desc' }])
    expect(sorted[0]!.id).toBe('yes')
  })
})

// ── sortGroupKeys ──────────────────────────────────────────────────────────────

describe('sortGroupKeys', () => {
  it('sorts keys alphabetically', () => {
    expect(sortGroupKeys(['Zulu', 'Alpha', 'Mike'])).toEqual([
      'Alpha', 'Mike', 'Zulu',
    ])
  })

  it('always places (Ungrouped) last', () => {
    const keys = ['(Ungrouped)', 'Alpha', 'Zulu']
    const sorted = sortGroupKeys(keys)
    expect(sorted[sorted.length - 1]).toBe('(Ungrouped)')
    expect(sorted[0]).toBe('Alpha')
  })

  it('does not mutate original array', () => {
    const keys = ['B', 'A']
    sortGroupKeys(keys)
    expect(keys[0]).toBe('B')
  })

  it('handles numeric strings in natural order', () => {
    expect(sortGroupKeys(['Ward 10', 'Ward 2', 'Ward 1'])).toEqual([
      'Ward 1', 'Ward 2', 'Ward 10',
    ])
  })
})

/**
 * scheduling.ts — type guards and transition enforcement.
 */
import { describe, it, expect } from 'vitest'
import {
  isEventLifecycleStatus,
  isScheduledEvent,
  canTransition,
  LIFECYCLE_TRANSITIONS,
} from '../scheduling'

describe('isEventLifecycleStatus', () => {
  it('accepts every valid status', () => {
    for (const s of ['draft', 'pending', 'approved', 'scheduled', 'completed'] as const) {
      expect(isEventLifecycleStatus(s)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isEventLifecycleStatus('active')).toBe(false)
    expect(isEventLifecycleStatus('confirmed')).toBe(false)
    expect(isEventLifecycleStatus('')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isEventLifecycleStatus(null)).toBe(false)
    expect(isEventLifecycleStatus(1)).toBe(false)
    expect(isEventLifecycleStatus(undefined)).toBe(false)
  })
})

describe('isScheduledEvent', () => {
  const valid = {
    id: 'e1',
    status: 'draft' as const,
    start: new Date(),
    end: new Date(),
    resources: ['r1'],
  }

  it('accepts a valid ScheduledEvent', () => {
    expect(isScheduledEvent(valid)).toBe(true)
  })

  it('rejects non-string resource elements', () => {
    expect(isScheduledEvent({ ...valid, resources: [123] })).toBe(false)
  })

  it('rejects mixed-type resource arrays', () => {
    expect(isScheduledEvent({ ...valid, resources: ['r1', 2] })).toBe(false)
  })

  it('accepts an empty resources array', () => {
    expect(isScheduledEvent({ ...valid, resources: [] })).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(isScheduledEvent({ ...valid, status: 'active' })).toBe(false)
  })

  it('rejects non-Date start/end', () => {
    expect(isScheduledEvent({ ...valid, start: '2026-01-01' })).toBe(false)
  })

  it('rejects null / non-object', () => {
    expect(isScheduledEvent(null)).toBe(false)
    expect(isScheduledEvent('string')).toBe(false)
    expect(isScheduledEvent(42)).toBe(false)
  })
})

describe('canTransition', () => {
  it('permits every forward step in the happy path', () => {
    expect(canTransition('draft',     'pending')).toBe(true)
    expect(canTransition('pending',   'approved')).toBe(true)
    expect(canTransition('approved',  'scheduled')).toBe(true)
    expect(canTransition('scheduled', 'completed')).toBe(true)
  })

  it('permits walking back one step', () => {
    expect(canTransition('pending',   'draft')).toBe(true)
    expect(canTransition('approved',  'pending')).toBe(true)
    expect(canTransition('scheduled', 'approved')).toBe(true)
  })

  it('blocks skipping steps forward', () => {
    expect(canTransition('draft',     'approved')).toBe(false)
    expect(canTransition('draft',     'scheduled')).toBe(false)
    expect(canTransition('draft',     'completed')).toBe(false)
    expect(canTransition('pending',   'scheduled')).toBe(false)
    expect(canTransition('pending',   'completed')).toBe(false)
    expect(canTransition('approved',  'completed')).toBe(false)
  })

  it('blocks re-opening a completed event', () => {
    expect(canTransition('completed', 'draft')).toBe(false)
    expect(canTransition('completed', 'pending')).toBe(false)
    expect(canTransition('completed', 'approved')).toBe(false)
    expect(canTransition('completed', 'scheduled')).toBe(false)
  })

  it('is consistent with LIFECYCLE_TRANSITIONS', () => {
    for (const [from, allowed] of Object.entries(LIFECYCLE_TRANSITIONS) as [string, readonly string[]][]) {
      for (const to of ['draft', 'pending', 'approved', 'scheduled', 'completed'] as const) {
        expect(canTransition(from as Parameters<typeof canTransition>[0], to))
          .toBe(allowed.includes(to))
      }
    }
  })
})

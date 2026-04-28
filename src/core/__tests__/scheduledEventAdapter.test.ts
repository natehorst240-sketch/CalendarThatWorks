/**
 * scheduledEventAdapter — round-trip fidelity for the four fields
 * that have no direct WorksCalendarEvent equivalent (#465 pre-#424).
 */
import { describe, it, expect } from 'vitest'
import {
  scheduledEventToCalendarEvent,
  calendarEventToScheduledEvent,
  assignmentsFromCalendarEvent,
} from '../scheduledEventAdapter'
import type { ScheduledEvent } from '../../types/scheduling'
import type { Assignment } from '../engine/schema/assignmentSchema'

const BASE: ScheduledEvent = {
  id: 'evt-1',
  status: 'pending',
  start: new Date('2026-06-01T09:00:00Z'),
  end:   new Date('2026-06-01T17:00:00Z'),
  resources: ['truck-1', 'driver-1'],
  eventType: 'delivery',
  title: 'Delivery run',
  requirements: [
    { kind: 'role', roleId: 'driver', count: 1, satisfied: true },
    { kind: 'pool', poolId: 'fleet-east', count: 1, satisfied: false },
  ],
  meta: { customerRef: 'CUST-99' },
}

describe('scheduledEventToCalendarEvent', () => {
  it('maps eventType → category without data loss', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    expect(ce.category).toBe('delivery')
  })

  it('puts the primary resource in .resource', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    expect(ce.resource).toBe('truck-1')
  })

  it('preserves the full resource list in meta._resources', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    expect(ce.meta?.['_resources']).toEqual(['truck-1', 'driver-1'])
  })

  it('preserves lifecycle status in meta._lifecycleStatus', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    expect(ce.meta?.['_lifecycleStatus']).toBe('pending')
  })

  it('preserves requirements in meta._requirements', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    expect(ce.meta?.['_requirements']).toEqual(BASE.requirements)
  })

  it('synthesises default assignments (units=100) when none supplied', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    const asgns = ce.meta?.['_assignments'] as Assignment[]
    expect(asgns).toHaveLength(2)
    expect(asgns[0]).toMatchObject({ eventId: 'evt-1', resourceId: 'truck-1', units: 100 })
    expect(asgns[1]).toMatchObject({ eventId: 'evt-1', resourceId: 'driver-1', units: 100 })
  })

  it('uses explicit assignments when provided', () => {
    const explicit: Assignment[] = [
      { id: 'a1', eventId: 'evt-1', resourceId: 'truck-1', units: 100 },
      { id: 'a2', eventId: 'evt-1', resourceId: 'driver-1', units: 50, roleId: 'co-driver' },
    ]
    const ce = scheduledEventToCalendarEvent(BASE, explicit)
    expect(ce.meta?.['_assignments']).toEqual(explicit)
  })

  it('keeps host meta fields alongside internal keys', () => {
    const ce = scheduledEventToCalendarEvent(BASE)
    expect(ce.meta?.['customerRef']).toBe('CUST-99')
  })
})

describe('calendarEventToScheduledEvent', () => {
  it('round-trips status', () => {
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(BASE))
    expect(rt.status).toBe('pending')
  })

  it('round-trips eventType via category', () => {
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(BASE))
    expect(rt.eventType).toBe('delivery')
  })

  it('round-trips the full resources array', () => {
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(BASE))
    expect(rt.resources).toEqual(['truck-1', 'driver-1'])
  })

  it('round-trips requirements', () => {
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(BASE))
    expect(rt.requirements).toEqual(BASE.requirements)
  })

  it('strips internal meta keys from ScheduledEvent.meta', () => {
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(BASE))
    expect(rt.meta?.['_lifecycleStatus']).toBeUndefined()
    expect(rt.meta?.['_resources']).toBeUndefined()
    expect(rt.meta?.['_requirements']).toBeUndefined()
    expect(rt.meta?.['_assignments']).toBeUndefined()
  })

  it('preserves host meta through the round-trip', () => {
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(BASE))
    expect(rt.meta?.['customerRef']).toBe('CUST-99')
  })

  it('defaults status to draft for events without _lifecycleStatus', () => {
    const rt = calendarEventToScheduledEvent({
      id: 'x', title: 'plain event', start: new Date(), end: new Date(),
    })
    expect(rt.status).toBe('draft')
  })

  it('falls back to single resource field when _resources is absent', () => {
    const rt = calendarEventToScheduledEvent({
      id: 'x', title: 'plain event', start: new Date(), end: new Date(),
      resource: 'truck-42',
    })
    expect(rt.resources).toEqual(['truck-42'])
  })

  it('produces no requirements when none were set', () => {
    const { requirements: _drop, ...noReqs } = BASE
    const rt = calendarEventToScheduledEvent(scheduledEventToCalendarEvent(noReqs))
    expect(rt.requirements).toBeUndefined()
  })
})

describe('assignmentsFromCalendarEvent', () => {
  it('returns the Assignment[] stored by scheduledEventToCalendarEvent', () => {
    const explicit: Assignment[] = [
      { id: 'a1', eventId: 'evt-1', resourceId: 'truck-1', units: 100 },
      { id: 'a2', eventId: 'evt-1', resourceId: 'driver-1', units: 50, roleId: 'co-driver' },
    ]
    const ce = scheduledEventToCalendarEvent(BASE, explicit)
    expect(assignmentsFromCalendarEvent(ce)).toEqual(explicit)
  })

  it('returns [] for a plain WorksCalendarEvent', () => {
    expect(assignmentsFromCalendarEvent({ title: 'x', start: new Date() })).toEqual([])
  })

  it('preserves roleId on explicit assignments through the round-trip', () => {
    const explicit: Assignment[] = [
      { id: 'a1', eventId: 'evt-1', resourceId: 'driver-1', units: 50, roleId: 'co-driver' },
    ]
    const ce = scheduledEventToCalendarEvent(BASE, explicit)
    const [a] = assignmentsFromCalendarEvent(ce)
    expect(a?.roleId).toBe('co-driver')
    expect(a?.units).toBe(50)
  })
})

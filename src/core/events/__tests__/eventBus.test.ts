/**
 * eventBus — unit specs (issue #216).
 *
 * Pins the pub/sub contract the Workflow DSL interpreter (#219) and adapter
 * integrations depend on: type-filtered delivery, error isolation, snapshot
 * semantics on publish, and stable unsubscribe handles.
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import {
  createEventBus,
  LIFECYCLE_EVENT_TYPES,
  type LifecycleEvent,
} from '../eventBus'
import type { EngineEvent } from '../../engine/schema/eventSchema'

const stubEvent = { id: 'e1' } as unknown as EngineEvent

function ev(
  type: LifecycleEvent['type'],
  overrides: Partial<Record<string, unknown>> = {},
): LifecycleEvent {
  return {
    id: `emit-${Math.random().toString(36).slice(2, 8)}`,
    at: '2026-04-20T09:00:00.000Z',
    event: stubEvent,
    type,
    ...(type === 'booking.denied' ? { reason: 'test' } : {}),
    ...overrides,
  } as LifecycleEvent
}

describe('eventBus — LIFECYCLE_EVENT_TYPES registry', () => {
  it('enumerates all 7 canonical lifecycle types', () => {
    expect(LIFECYCLE_EVENT_TYPES).toEqual([
      'booking.requested',
      'booking.approved',
      'booking.denied',
      'booking.finalized',
      'booking.cancelled',
      'booking.completed',
      'booking.revoked',
    ])
  })
})

describe('eventBus — subscribe + publish', () => {
  const errorSink = vi.fn()

  afterEach(() => { errorSink.mockClear() })

  it('delivers a single-type subscription only for that type', () => {
    const bus = createEventBus({ onError: errorSink })
    const listener = vi.fn()
    bus.subscribe('booking.approved', listener)
    bus.publish(ev('booking.approved'))
    bus.publish(ev('booking.denied'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].type).toBe('booking.approved')
  })

  it('delivers an array-of-types subscription for each matching type', () => {
    const bus = createEventBus({ onError: errorSink })
    const listener = vi.fn()
    bus.subscribe(['booking.requested', 'booking.finalized'], listener)
    bus.publish(ev('booking.requested'))
    bus.publish(ev('booking.approved'))
    bus.publish(ev('booking.finalized'))
    expect(listener).toHaveBeenCalledTimes(2)
    const types = listener.mock.calls.map(c => (c[0] as LifecycleEvent).type)
    expect(types).toEqual(['booking.requested', 'booking.finalized'])
  })

  it('wildcard subscription ("*") receives every event', () => {
    const bus = createEventBus({ onError: errorSink })
    const listener = vi.fn()
    bus.subscribe('*', listener)
    for (const t of LIFECYCLE_EVENT_TYPES) bus.publish(ev(t))
    expect(listener).toHaveBeenCalledTimes(LIFECYCLE_EVENT_TYPES.length)
  })

  it('multiple subscribers all receive the event in registration order', () => {
    const bus = createEventBus({ onError: errorSink })
    const order: string[] = []
    bus.subscribe('booking.requested', () => order.push('a'))
    bus.subscribe('booking.requested', () => order.push('b'))
    bus.subscribe('booking.requested', () => order.push('c'))
    bus.publish(ev('booking.requested'))
    expect(order).toEqual(['a', 'b', 'c'])
  })
})

describe('eventBus — unsubscribe', () => {
  it('removes the listener from future emissions', () => {
    const bus = createEventBus({ onError: () => {} })
    const listener = vi.fn()
    const off = bus.subscribe('booking.approved', listener)
    bus.publish(ev('booking.approved'))
    off()
    bus.publish(ev('booking.approved'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — calling twice does not throw', () => {
    const bus = createEventBus({ onError: () => {} })
    const off = bus.subscribe('booking.approved', () => {})
    off()
    expect(() => off()).not.toThrow()
    expect(bus.size).toBe(0)
  })

  it('clear() drops every subscription', () => {
    const bus = createEventBus({ onError: () => {} })
    bus.subscribe('*', () => {})
    bus.subscribe('booking.denied', () => {})
    expect(bus.size).toBe(2)
    bus.clear()
    expect(bus.size).toBe(0)
  })
})

describe('eventBus — error isolation', () => {
  it('routes a throwing listener to onError and still invokes siblings', () => {
    const onError = vi.fn()
    const bus = createEventBus({ onError })
    const a = vi.fn(() => { throw new Error('boom') })
    const b = vi.fn()
    bus.subscribe('booking.approved', a)
    bus.subscribe('booking.approved', b)
    const event = ev('booking.approved')
    bus.publish(event)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect((onError.mock.calls[0][0] as Error).message).toBe('boom')
    expect(onError.mock.calls[0][1]).toBe(event)
  })

  it('does not propagate a listener throw back to the publisher', () => {
    const bus = createEventBus({ onError: () => {} })
    bus.subscribe('booking.finalized', () => { throw new Error('still boom') })
    expect(() => bus.publish(ev('booking.finalized'))).not.toThrow()
  })
})

describe('eventBus — snapshot semantics during publish', () => {
  it('subscribes added during dispatch are NOT invoked for the current event', () => {
    const bus = createEventBus({ onError: () => {} })
    const late = vi.fn()
    bus.subscribe('booking.requested', () => {
      bus.subscribe('booking.requested', late)
    })
    bus.publish(ev('booking.requested'))
    expect(late).not.toHaveBeenCalled()
  })

  it('a subscriber that unsubscribes a sibling still lets the sibling receive the current event', () => {
    const bus = createEventBus({ onError: () => {} })
    const b = vi.fn()
    const offB = bus.subscribe('booking.approved', b)
    bus.subscribe('booking.approved', () => { offB() })
    bus.publish(ev('booking.approved'))
    // snapshot semantics — `b` still fires this round; next round it won't.
    expect(b).toHaveBeenCalledTimes(1)
    bus.publish(ev('booking.approved'))
    expect(b).toHaveBeenCalledTimes(1)
  })
})

describe('eventBus — default onError', () => {
  it('falls back to console.error when no onError is provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bus = createEventBus()
    bus.subscribe('booking.approved', () => { throw new Error('x') })
    bus.publish(ev('booking.approved'))
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

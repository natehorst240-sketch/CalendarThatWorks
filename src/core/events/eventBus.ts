/**
 * Lifecycle event bus — issue #216.
 *
 * A tiny typed pub/sub the engine and approval reducer emit on. Host-side
 * adapters (Slack, webhook, billing) subscribe to the specific events they
 * care about instead of patching `onApprovalAction` + `onEventCreate` +
 * `onEventUpdate` individually.
 *
 * Why a dedicated module:
 *   - Keeps publishers (approval reducer, operation pipeline, workflow
 *     interpreter) decoupled from subscribers (notifications, webhooks).
 *   - Pre-requisite for the Workflow DSL (#219): workflow `notify` nodes
 *     publish through this bus instead of owning their own I/O.
 *   - Error-isolated: one throwing subscriber cannot break sibling
 *     subscribers or the publisher.
 */
import type { EngineEvent } from '../engine/schema/eventSchema'

// ─── Lifecycle event types ────────────────────────────────────────────────

/** Common envelope fields shared by every lifecycle event. */
interface BaseLifecycleEvent {
  /** Stable id per emission — useful for dedup in at-least-once delivery. */
  readonly id: string
  /** ISO timestamp at which the event was published. */
  readonly at: string
  /** Optional human/system actor that caused the emission. */
  readonly actor?: string
}

export type LifecycleEvent =
  | (BaseLifecycleEvent & { readonly type: 'booking.requested';  readonly event: EngineEvent })
  | (BaseLifecycleEvent & { readonly type: 'booking.approved';   readonly event: EngineEvent; readonly tier?: number })
  | (BaseLifecycleEvent & { readonly type: 'booking.denied';     readonly event: EngineEvent; readonly reason: string })
  | (BaseLifecycleEvent & { readonly type: 'booking.finalized';  readonly event: EngineEvent })
  | (BaseLifecycleEvent & { readonly type: 'booking.cancelled';  readonly event: EngineEvent })
  | (BaseLifecycleEvent & { readonly type: 'booking.completed';  readonly event: EngineEvent })
  | (BaseLifecycleEvent & { readonly type: 'booking.revoked';    readonly event: EngineEvent })

export type LifecycleEventType = LifecycleEvent['type']

export const LIFECYCLE_EVENT_TYPES: readonly LifecycleEventType[] = [
  'booking.requested',
  'booking.approved',
  'booking.denied',
  'booking.finalized',
  'booking.cancelled',
  'booking.completed',
  'booking.revoked',
] as const

/**
 * Narrows `LifecycleEvent` to a single variant based on the subscription
 * filter. `'*'` matches every variant.
 */
export type LifecycleEventOf<T extends LifecycleEventType | '*'> =
  T extends '*' ? LifecycleEvent : Extract<LifecycleEvent, { type: T }>

export type LifecycleListener<T extends LifecycleEventType | '*' = '*'> =
  (event: LifecycleEventOf<T>) => void

export type SubscriptionFilter = '*' | LifecycleEventType | readonly LifecycleEventType[]

/** Returned by `subscribe()` — call to remove the listener. */
export type Unsubscribe = () => void

// ─── Bus contract ─────────────────────────────────────────────────────────

export interface EventBus {
  /**
   * Register a listener for one or more event types. `'*'` matches every
   * lifecycle event. The returned function removes the subscription.
   */
  subscribe<T extends LifecycleEventType>(
    types: T | readonly T[],
    listener: LifecycleListener<T>,
  ): Unsubscribe
  subscribe(
    types: '*',
    listener: LifecycleListener<'*'>,
  ): Unsubscribe

  /**
   * Publish a lifecycle event to every matching subscriber. Subscribers
   * are invoked synchronously in registration order; a throwing
   * subscriber is reported via `onError` (or logged) and does NOT abort
   * the remaining subscribers or the caller.
   */
  publish(event: LifecycleEvent): void

  /** Remove every subscription. Primarily for test teardown. */
  clear(): void

  /** Current total subscriber count — test helper. */
  readonly size: number
}

export interface EventBusOptions {
  /**
   * Invoked when a subscriber throws. Receives the thrown value, the
   * offending event, and the listener index. Defaults to
   * `console.error`. Pass `() => {}` to silence.
   */
  readonly onError?: (err: unknown, event: LifecycleEvent) => void
}

// ─── Implementation ───────────────────────────────────────────────────────

interface Subscription {
  readonly id: number
  readonly filter: ReadonlySet<LifecycleEventType> | '*'
  readonly listener: LifecycleListener<LifecycleEventType | '*'>
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const subs = new Map<number, Subscription>()
  let nextId = 1

  const onError = options.onError ?? ((err, event) => {
    // eslint-disable-next-line no-console
    console.error(`[EventBus] subscriber threw for ${event.type}:`, err)
  })

  function subscribe(
    types: SubscriptionFilter,
    listener: LifecycleListener<LifecycleEventType | '*'>,
  ): Unsubscribe {
    const id = nextId++
    const filter: ReadonlySet<LifecycleEventType> | '*' =
      types === '*'
        ? '*'
        : new Set<LifecycleEventType>(Array.isArray(types) ? types : [types as LifecycleEventType])
    subs.set(id, { id, filter, listener })
    return () => { subs.delete(id) }
  }

  function publish(event: LifecycleEvent): void {
    // Snapshot so a listener that unsubscribes (or adds a new sub) during
    // dispatch doesn't mutate the iterator mid-flight.
    const snapshot = Array.from(subs.values())
    for (const sub of snapshot) {
      if (sub.filter !== '*' && !sub.filter.has(event.type)) continue
      try {
        sub.listener(event)
      } catch (err) {
        onError(err, event)
      }
    }
  }

  function clear(): void {
    subs.clear()
  }

  return {
    subscribe: subscribe as EventBus['subscribe'],
    publish,
    clear,
    get size() { return subs.size },
  }
}

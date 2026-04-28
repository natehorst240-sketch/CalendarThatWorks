/**
 * Scheduling domain types for #424 (WorksCalendar product layer).
 *
 * These are distinct from `NormalizedEvent` (the calendar rendering
 * model) and `WorksCalendarEvent` (the host-facing input shape). A
 * `ScheduledEvent` represents a bookable unit as it moves through the
 * scheduling lifecycle — from draft through completion.
 *
 * Conflict semantics (decided pre-#424):
 *   hard conflict  → block save entirely (e.g. same resource + overlapping time)
 *   soft conflict  → warn and allow override (e.g. outside business hours)
 *
 * Naming contract (intentional coexistence):
 *   resource  — the v2 engine term (ConfigResource, EngineResource, CalendarConfig)
 *   asset     — the legacy owner-config term (config.assets[]; AssetsView)
 *   Both are present in the codebase. "resource" is the going-forward canonical term.
 *   "role" = a functional capability assigned to an event slot (ConfigRole)
 *   "capability" = a boolean/numeric attribute on a resource (ConfigResource.capabilities)
 *   "pool" = a named group of resources resolved at submit time (ResourcePool)
 *   "group" = a calendar display grouping (GroupConfig / groupRows)
 */

/** Five-state lifecycle for a schedulable event. */
export type EventLifecycleStatus =
  | 'draft'       // created but not submitted
  | 'pending'     // submitted, awaiting approval
  | 'approved'    // approved, not yet on the schedule
  | 'scheduled'   // on the live schedule
  | 'completed'   // occurred / closed

/**
 * A schedulable unit in the #424 product layer.
 *
 * `resources` is a list of resource ids (matches `ConfigResource.id` /
 * `EngineResource.id`). An event may reference more than one resource
 * when multiple assets are dispatched together (e.g. truck + driver).
 *
 * `requirements` is an optional list of requirement slots that must be
 * satisfied before the event can move from `pending` to `approved`.
 * Each slot references a role id or pool id from the active CalendarConfig.
 */
export interface ScheduledEvent {
  readonly id: string
  readonly status: EventLifecycleStatus
  readonly start: Date
  readonly end: Date
  /** Resolved resource ids assigned to this event. */
  readonly resources: readonly string[]
  /** Pending requirement slots from the CalendarConfig template. */
  readonly requirements?: readonly ScheduledEventRequirement[]
  /** Free-form display title. */
  readonly title?: string
  /** Maps to CalendarConfig.requirements[].eventType for template lookup. */
  readonly eventType?: string
  /** Arbitrary host metadata — not read by the scheduling engine. */
  readonly meta?: Readonly<Record<string, unknown>>
}

/**
 * A single requirement slot on a `ScheduledEvent`.
 * Mirrors `ConfigRequirementSlot` but with a resolved `satisfied` flag
 * so UI components can render readiness without re-running the evaluator.
 */
export type ScheduledEventRequirement =
  | { readonly kind: 'role'; readonly roleId: string; readonly count: number; readonly satisfied: boolean }
  | { readonly kind: 'pool'; readonly poolId: string; readonly count: number; readonly satisfied: boolean }

/**
 * Type guard — narrows an unknown value to `ScheduledEvent`.
 * Useful at system boundaries (API responses, localStorage deserialization).
 */
export function isScheduledEvent(v: unknown): v is ScheduledEvent {
  if (!v || typeof v !== 'object') return false
  const e = v as Record<string, unknown>
  return (
    typeof e['id'] === 'string' &&
    isEventLifecycleStatus(e['status']) &&
    e['start'] instanceof Date &&
    e['end'] instanceof Date &&
    Array.isArray(e['resources']) &&
    (e['resources'] as unknown[]).every(r => typeof r === 'string')
  )
}

const LIFECYCLE_STATUSES: readonly EventLifecycleStatus[] = [
  'draft', 'pending', 'approved', 'scheduled', 'completed',
]

export function isEventLifecycleStatus(v: unknown): v is EventLifecycleStatus {
  return typeof v === 'string' && (LIFECYCLE_STATUSES as readonly string[]).includes(v)
}

/** Ordered lifecycle transitions that are valid (no skipping). */
export const LIFECYCLE_TRANSITIONS: Readonly<Record<EventLifecycleStatus, readonly EventLifecycleStatus[]>> = {
  draft:     ['pending'],
  pending:   ['approved', 'draft'],
  approved:  ['scheduled', 'pending'],
  scheduled: ['completed', 'approved'],
  completed: [],
}

/**
 * Return true when moving `from → to` is a permitted transition.
 *
 * Use this anywhere a status change is written — event form saves,
 * approval actions, bulk-update flows — so `draft → completed` can
 * never happen by accident.
 *
 *   canTransition('draft', 'pending')    // true
 *   canTransition('draft', 'completed')  // false
 *   canTransition('completed', 'draft')  // false
 */
export function canTransition(
  from: EventLifecycleStatus,
  to: EventLifecycleStatus,
): boolean {
  return (LIFECYCLE_TRANSITIONS[from] as readonly string[]).includes(to)
}

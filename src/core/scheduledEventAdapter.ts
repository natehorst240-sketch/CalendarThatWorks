/**
 * scheduledEventAdapter — lossless bridge between `ScheduledEvent`
 * (the #424 scheduling domain model) and `WorksCalendarEvent`
 * (the calendar rendering model).
 *
 * Four fields have no direct `WorksCalendarEvent` equivalent and are
 * preserved in `meta` under underscore-prefixed keys:
 *
 *   _lifecycleStatus  — EventLifecycleStatus ('draft'…'completed')
 *                        Distinct from WorksCalendarEvent.status (iCal).
 *   _resources        — full string[] of assigned resource ids
 *                        WorksCalendarEvent.resource is a single string;
 *                        multi-resource events would lose all but the first.
 *   _requirements     — ScheduledEventRequirement[] snapshot
 *   _assignments      — Assignment[] snapshot (units, roleId per resource)
 *
 * `eventType` maps directly to `category` — no meta spillover needed.
 *
 * Round-trip guarantee:
 *   calendarEventToScheduledEvent(scheduledEventToCalendarEvent(e))
 *   produces a ScheduledEvent that is structurally equal to `e`
 *   (dates are re-parsed; meta key order may differ).
 */
import { parseISO, isValid } from 'date-fns'
import type { WorksCalendarEvent } from '../types/events'
import type { ScheduledEvent, ScheduledEventRequirement, EventLifecycleStatus } from '../types/scheduling'
import { isEventLifecycleStatus } from '../types/scheduling'
import type { Assignment } from './engine/schema/assignmentSchema'

// ─── Internal meta keys ────────────────────────────────────────────────────

const KEY_STATUS       = '_lifecycleStatus' as const
const KEY_RESOURCES    = '_resources'       as const
const KEY_REQUIREMENTS = '_requirements'    as const
const KEY_ASSIGNMENTS  = '_assignments'     as const

const INTERNAL_KEYS = new Set([KEY_STATUS, KEY_RESOURCES, KEY_REQUIREMENTS, KEY_ASSIGNMENTS])

// ─── Helpers ───────────────────────────────────────────────────────────────

function toDate(v: Date | string): Date {
  if (v instanceof Date) return v
  const d = parseISO(v)
  return isValid(d) ? d : new Date(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function isAssignmentArray(v: unknown): v is Assignment[] {
  if (!Array.isArray(v)) return false
  return v.every(x => {
    if (x === null || typeof x !== 'object') return false
    const a = x as Record<string, unknown>
    return (
      typeof a['id'] === 'string' &&
      typeof a['eventId'] === 'string' &&
      typeof a['resourceId'] === 'string' &&
      typeof a['units'] === 'number'
    )
  })
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Convert a `ScheduledEvent` to a `WorksCalendarEvent` for calendar
 * rendering. All scheduling-domain fields that have no direct
 * `WorksCalendarEvent` equivalent are spilled into `meta`.
 *
 * Pass `assignments` when the event has explicit multi-resource
 * assignment records (units, roleId). If omitted, `_assignments` is
 * not written to meta and round-trip will reconstruct resources from
 * `_resources` only.
 */
export function scheduledEventToCalendarEvent(
  e: ScheduledEvent,
  assignments?: readonly Assignment[],
): WorksCalendarEvent {
  const meta: Record<string, unknown> = {
    ...e.meta,
    [KEY_STATUS]:    e.status,
    [KEY_RESOURCES]: Array.from(e.resources),
  }

  if (e.requirements !== undefined) {
    meta[KEY_REQUIREMENTS] = e.requirements
  }

  const eventAssignments = assignments
    ?? (e.resources.length > 0
      ? e.resources.map((resourceId, i) => ({
          id: `${e.id}-asgn-${i}`,
          eventId: e.id,
          resourceId,
          units: 100,
        } satisfies Assignment))
      : undefined)

  if (eventAssignments !== undefined) {
    meta[KEY_ASSIGNMENTS] = eventAssignments
  }

  return {
    id:       e.id,
    title:    e.title ?? '',
    start:    e.start,
    end:      e.end,
    // eventType is the scheduling concept; category is the rendering concept.
    // They share the same value — no information is lost.
    category: e.eventType,
    // Primary resource drives single-resource calendar views.
    // The full list is preserved in _resources above.
    resource: e.resources[0],
    meta,
  }
}

/**
 * Reconstruct a `ScheduledEvent` from a `WorksCalendarEvent` produced
 * by `scheduledEventToCalendarEvent`. Also accepts arbitrary
 * `WorksCalendarEvent`s — fields not present in meta are defaulted
 * (`status → 'draft'`, `resources → [resource].filter(Boolean)`).
 */
export function calendarEventToScheduledEvent(e: WorksCalendarEvent): ScheduledEvent {
  const rawMeta = e.meta ?? {}

  // lifecycle status
  const rawStatus = rawMeta[KEY_STATUS]
  const status: EventLifecycleStatus = isEventLifecycleStatus(rawStatus) ? rawStatus : 'draft'

  // resources — prefer the preserved array, fall back to single field
  const rawResources = rawMeta[KEY_RESOURCES]
  const resources: readonly string[] = isStringArray(rawResources)
    ? rawResources
    : typeof e.resource === 'string'
      ? [e.resource]
      : []

  // requirements
  const rawReqs = rawMeta[KEY_REQUIREMENTS]
  const requirements = Array.isArray(rawReqs)
    ? (rawReqs as ScheduledEventRequirement[])
    : undefined

  // host meta — strip internal keys so they don't leak into ScheduledEvent.meta
  const cleanMeta: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawMeta)) {
    if (!INTERNAL_KEYS.has(k as typeof KEY_STATUS)) cleanMeta[k] = v
  }

  const start = toDate(e.start)
  const end   = e.end ? toDate(e.end) : new Date(start.getTime() + 60 * 60 * 1000)

  // exactOptionalPropertyTypes: only spread optional fields when they
  // have a real value, never explicitly assign `undefined` to them.
  return {
    id: e.id ?? '',
    status,
    start,
    end,
    resources,
    ...(e.category !== undefined   ? { eventType: e.category }       : {}),
    ...(e.title                    ? { title: e.title }               : {}),
    ...(requirements !== undefined ? { requirements }                 : {}),
    ...(Object.keys(cleanMeta).length > 0 ? { meta: cleanMeta }      : {}),
  }
}

/**
 * Extract the `Assignment[]` embedded by `scheduledEventToCalendarEvent`.
 * Returns `[]` when the event was not produced by that function or was
 * produced without an explicit assignments list.
 */
export function assignmentsFromCalendarEvent(e: WorksCalendarEvent): Assignment[] {
  const raw = e.meta?.[KEY_ASSIGNMENTS]
  return isAssignmentArray(raw) ? raw : []
}

/**
 * CalendarEngine — versioned public schema layer, v1.
 *
 * This is the stable integration contract for host applications.
 * Internal engine types are re-exported here so consumers import
 * from a single, versioned path.
 *
 * Breaking changes bump the version and introduce a new `src/api/v2/`
 * tree; v1 remains importable for existing consumers.
 */

// ─── Version sentinel ─────────────────────────────────────────────────────────

/** Monotonic string version of this schema layer.  Compare with strict equality. */
export const SCHEMA_VERSION = '1' as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

// ─── Sync metadata ────────────────────────────────────────────────────────────

/**
 * Opaque sync fields for external-calendar integrations.
 * Attach to EngineEvent.meta or CalendarEventV1.sync for round-trip fidelity
 * through REST, GraphQL, or WebSocket adapters.
 */
export interface SyncMetadata {
  /** Identifier in the external system (e.g. Google Event ID, Outlook UID). */
  readonly externalId: string;
  /** Human-readable label for the source calendar/connector. */
  readonly syncSource: string;
  /**
   * Opaque token used by the connector to resume incremental sync.
   * Typically the ETag or iCal SEQUENCE value from the external system.
   */
  readonly syncToken?: string;
  /** UTC timestamp of the most recent successful sync of this event. */
  readonly lastSyncedAt?: Date;
  /**
   * Monotonic version counter.  Incremented by the engine on every local
   * write so optimistic-update clients can detect stale reads.
   */
  readonly version?: number;
  /** UTC timestamp of the most recent local write. */
  readonly updatedAt?: Date;
}

// ─── Upgraded input event ─────────────────────────────────────────────────────

// Re-import EventConstraint so CalendarEventV1 can reference it inline.
import type { EventConstraint } from 'works-calendar-engine';
import type { EventStatus } from 'works-calendar-engine';

/**
 * CalendarEventV1 — the next-generation input shape.
 *
 * Compatible superset of WorksCalendarEvent.  New fields (timezone,
 * resourceId, constraints, sync) are all optional, so existing host apps
 * that pass plain WorksCalendarEvent objects continue to work unchanged.
 */
export interface CalendarEventV1 {
  id?: string | undefined;
  title: string;
  start: Date | string | number;
  end?: Date | string | number | undefined;
  allDay?: boolean | undefined;
  category?: string | undefined;
  /** Hex color override.  If omitted, derived from category. */
  color?: string | undefined;
  /** Tail number, person, room, etc. (legacy single-resource display field). */
  resource?: string | undefined;
  /**
   * IANA timezone for this event, e.g. "America/Denver".
   * Overrides the calendar's display timezone for this event's wall-clock time.
   */
  timezone?: string | undefined;
  /**
   * Primary resource ID (links to a Resource record).
   * Prefer explicit Assignment records for multi-resource events.
   */
  resourceId?: string | undefined;
  /**
   * Virtual `ResourcePool` id (issue #212). Mutually exclusive with
   * `resourceId` at submit time — the engine resolves the pool to a
   * concrete member and fills in `resourceId` on the stored event.
   */
  resourcePoolId?: string | undefined;
  /** 'confirmed' (default) | 'tentative' (striped) | 'cancelled' (strikethrough) */
  status?: EventStatus | undefined;
  /** iCal RRULE string, e.g. "FREQ=MONTHLY;INTERVAL=3;COUNT=8" */
  rrule?: string | undefined;
  /** Dates excluded from the recurrence rule (ISO strings or Date objects). */
  exdates?: Array<Date | string> | undefined;
  /** Scheduling constraints (pin start/end to a date, ASAP/ALAP, etc.). */
  constraints?: EventConstraint[] | undefined;
  /** Sync metadata for external calendar integrations. */
  sync?: SyncMetadata | undefined;
  /** Any extra fields — shown in hover card and available to renderEvent. */
  meta?: Record<string, unknown> | undefined;
}

/**
 * CalendarOccurrenceV1 — the render-time occurrence shape exposed to host apps.
 *
 * Returned by `occurrenceToV1()`.  All `CalendarEventV1` fields are present,
 * plus occurrence-specific fields that let the host app route mutations back
 * to the correct engine record.
 *
 * Key distinction: `id` here is the OCCURRENCE id (unique per rendered
 * instance), while `eventId` is the SOURCE event id to use for mutations.
 */
export interface CalendarOccurrenceV1 extends Omit<CalendarEventV1, 'id'> {
  /** Unique occurrence key, e.g. "evt-1-r3".  Pass to UI, NOT to mutations. */
  readonly id: string;
  /**
   * Source EngineEvent id.  Pass this to move/resize/delete engine operations,
   * NOT the occurrence id.
   */
  readonly eventId: string;
  /** Null for non-recurring events. */
  readonly seriesId: string | null;
  /** False for standalone events and recurring series masters. */
  readonly isRecurring: boolean;
  /**
   * 0-based index within the rendered range.
   * 0 = first (or only) occurrence; 1+ = subsequent recurrences.
   */
  readonly occurrenceIndex: number;
}

// ─── Sync metadata key (private convention) ───────────────────────────────────

/**
 * The meta key used to round-trip SyncMetadata through EngineEvent.meta.
 * Adapters write/read this key; consuming code should use the adapter functions
 * rather than accessing the meta key directly.
 * @internal
 */
export const SYNC_META_KEY = '_v1sync' as const;

// ─── Engine schema re-exports ─────────────────────────────────────────────────

// ── Event ────────────────────────────────────────────────────────────────────

export type { EngineEvent, EventStatus } from 'works-calendar-engine';
export {
  makeEvent,
  isRecurringSeries,
  isDetachedOccurrence,
  isPartOfSeries,
} from 'works-calendar-engine';

// ── Occurrence ───────────────────────────────────────────────────────────────

export type { EngineOccurrence } from 'works-calendar-engine';

// ── Resource ─────────────────────────────────────────────────────────────────

export type {
  EngineResource,
  ResourceBusinessHours,
} from 'works-calendar-engine';

// ── Resource pool (issue #212) ───────────────────────────────────────────────

export type { PoolStrategy, ResourcePool } from 'works-calendar-engine';

// ── Assignment ───────────────────────────────────────────────────────────────

export type { Assignment } from 'works-calendar-engine';
export {
  makeAssignment,
  assignmentsForEvent,
  resourceIdsForEvent,
  workloadForResource,
} from 'works-calendar-engine';

// ── Dependency ───────────────────────────────────────────────────────────────

export type { Dependency, DependencyType } from 'works-calendar-engine';
export {
  makeDependency,
  constrainedAnchor,
  isDependencyViolated,
  successorsOf,
  predecessorsOf,
  hasCycle,
  wouldCreateCycle,
} from 'works-calendar-engine';

// ── Constraint ───────────────────────────────────────────────────────────────

export type {
  EventConstraint,
  ConstraintType,
} from 'works-calendar-engine';
export {
  satisfiesConstraint,
  constraintSeverity,
  describeConstraint,
} from 'works-calendar-engine';

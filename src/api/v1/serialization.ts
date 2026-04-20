/**
 * CalendarEngine v1 — serialization helpers.
 *
 * Provides canonical round-trip serialization between live engine records
 * (which use Date objects internally) and their JSON-safe equivalents
 * (all dates as ISO 8601 strings).
 *
 * Used by:
 *   - REST / GraphQL adapters passing events to/from the server
 *   - localStorage / IndexedDB persistence of engine state
 *   - postMessage / worker handoff across serialization boundaries
 */

import type { EngineEvent } from '../../core/engine/schema/eventSchema';
import type { EventConstraint, ConstraintType } from '../../core/engine/schema/constraintSchema';
import type { SyncMetadata } from './types';

// ─── JSON-safe (serialized) types ─────────────────────────────────────────────

/** JSON-safe version of EventConstraint (date as ISO 8601 string). */
export interface SerializedConstraint {
  readonly type: ConstraintType;
  readonly date?: string;
}

/** JSON-safe version of SyncMetadata (all Date fields as ISO 8601 strings). */
export interface SerializedSyncMetadata {
  readonly externalId: string;
  readonly syncSource: string;
  readonly syncToken?: string;
  readonly lastSyncedAt?: string;
  readonly version?: number;
  readonly updatedAt?: string;
}

/**
 * JSON-safe version of EngineEvent.
 * All Date fields are ISO 8601 strings; exdates is string[].
 * Safe to pass through JSON.stringify / JSON.parse without data loss.
 */
export interface SerializedEvent {
  readonly id: string;
  readonly seriesId: string | null;
  readonly occurrenceId: string | null;
  readonly detachedFrom: string | null;
  readonly start: string;
  readonly end: string;
  readonly timezone: string | null;
  readonly allDay: boolean;
  readonly title: string;
  readonly category: string | null;
  readonly resourceId: string | null;
  /** Virtual pool ref (#212). Null on stored/resolved events. */
  readonly resourcePoolId: string | null;
  readonly status: EngineEvent['status'];
  readonly color: string | null;
  readonly rrule: string | null;
  readonly exdates: readonly string[];
  readonly constraints: readonly SerializedConstraint[];
  readonly meta: Readonly<Record<string, unknown>>;
  /**
   * Tenant scope — mirrors `EngineEvent.tenantId` (#218). Omitted entirely
   * when the source event is unscoped, so persisted shapes stay compatible
   * with older payloads.
   */
  readonly tenantId?: string;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Serialize a non-null Date to ISO 8601. */
export function serializeDate(date: Date): string;
/** Serialize a nullable Date to ISO 8601, returning null when given null. */
export function serializeDate(date: Date | null): string | null;
export function serializeDate(date: Date | null): string | null {
  return date !== null ? date.toISOString() : null;
}

/**
 * Deserialize an ISO 8601 string to a Date.
 * Returns null for null, undefined, or empty string.
 * Throws `RangeError` when given an unparseable string.
 */
export function deserializeDate(value: string): Date;
export function deserializeDate(value: string | null | undefined): Date | null;
export function deserializeDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new RangeError(`deserializeDate: unparseable date string "${value}"`);
  }
  return d;
}

// ─── Constraint serialization ─────────────────────────────────────────────────

/** Convert a live EventConstraint to its JSON-safe form. */
export function serializeConstraint(c: EventConstraint): SerializedConstraint {
  return {
    type: c.type,
    ...(c.date !== undefined && { date: c.date.toISOString() }),
  };
}

/** Reconstruct a live EventConstraint from its JSON-safe form. */
export function deserializeConstraint(raw: SerializedConstraint): EventConstraint {
  return {
    type: raw.type,
    ...(raw.date !== undefined && { date: new Date(raw.date) }),
  };
}

// ─── SyncMetadata serialization ───────────────────────────────────────────────

/** Convert live SyncMetadata to its JSON-safe form. */
export function serializeSyncMetadata(sync: SyncMetadata): SerializedSyncMetadata {
  return {
    externalId: sync.externalId,
    syncSource: sync.syncSource,
    ...(sync.syncToken    !== undefined && { syncToken:    sync.syncToken }),
    ...(sync.lastSyncedAt !== undefined && { lastSyncedAt: sync.lastSyncedAt.toISOString() }),
    ...(sync.version      !== undefined && { version:      sync.version }),
    ...(sync.updatedAt    !== undefined && { updatedAt:    sync.updatedAt.toISOString() }),
  };
}

/** Reconstruct live SyncMetadata from its JSON-safe form. */
export function deserializeSyncMetadata(raw: SerializedSyncMetadata): SyncMetadata {
  return {
    externalId: raw.externalId,
    syncSource: raw.syncSource,
    ...(raw.syncToken    !== undefined && { syncToken:    raw.syncToken }),
    ...(raw.lastSyncedAt !== undefined && { lastSyncedAt: new Date(raw.lastSyncedAt) }),
    ...(raw.version      !== undefined && { version:      raw.version }),
    ...(raw.updatedAt    !== undefined && { updatedAt:    new Date(raw.updatedAt) }),
  };
}

// ─── Event serialization ──────────────────────────────────────────────────────

/** Convert a live EngineEvent to its JSON-safe form. */
export function serializeEvent(ev: EngineEvent): SerializedEvent {
  return {
    id:           ev.id,
    seriesId:     ev.seriesId,
    occurrenceId: ev.occurrenceId,
    detachedFrom: ev.detachedFrom,
    start:        ev.start.toISOString(),
    end:          ev.end.toISOString(),
    timezone:     ev.timezone,
    allDay:       ev.allDay,
    title:        ev.title,
    category:     ev.category,
    resourceId:   ev.resourceId,
    resourcePoolId: ev.resourcePoolId,
    status:       ev.status,
    color:        ev.color,
    rrule:        ev.rrule,
    exdates:      ev.exdates.map(d => d.toISOString()),
    constraints:  ev.constraints.map(serializeConstraint),
    meta:         ev.meta,
    ...(ev.tenantId !== undefined ? { tenantId: ev.tenantId } : {}),
  };
}

/** Reconstruct a live EngineEvent from its JSON-safe form. */
export function deserializeEvent(raw: SerializedEvent): EngineEvent {
  return {
    id:           raw.id,
    seriesId:     raw.seriesId,
    occurrenceId: raw.occurrenceId,
    detachedFrom: raw.detachedFrom,
    start:        deserializeDate(raw.start),
    end:          deserializeDate(raw.end),
    timezone:     raw.timezone,
    allDay:       raw.allDay,
    title:        raw.title,
    category:     raw.category,
    resourceId:   raw.resourceId,
    resourcePoolId: raw.resourcePoolId ?? null,
    status:       raw.status,
    color:        raw.color,
    rrule:        raw.rrule,
    exdates:      raw.exdates.map(s => deserializeDate(s)),
    constraints:  raw.constraints.map(deserializeConstraint),
    meta:         raw.meta,
    ...(raw.tenantId !== undefined ? { tenantId: raw.tenantId } : {}),
  };
}

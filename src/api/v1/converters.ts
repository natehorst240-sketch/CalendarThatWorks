/**
 * CalendarEngine v1 — adapter functions.
 *
 * These are the authoritative conversion functions between the external
 * CalendarEventV1 shape and the internal EngineEvent / EngineOccurrence
 * types.  Always use these adapters at system boundaries rather than
 * constructing or mapping shapes by hand.
 *
 * Conversion directions:
 *
 *   External input ──► eventV1ToEngine ──► EngineEvent  (write / inbound)
 *   EngineEvent    ──► engineToV1      ──► CalendarEventV1  (read / outbound)
 *   EngineOccurrence ► occurrenceToV1  ──► CalendarOccurrenceV1 (view renders)
 *
 *   WorksCalendarEvent ► legacyToV1    ──► CalendarEventV1 (upgrade path)
 *   CalendarEventV1    ► v1ToLegacy    ──► WorksCalendarEvent (downgrade path)
 *
 * SyncMetadata round-trip convention:
 *   When converting v1 → engine, `sync` is stored inside `meta[SYNC_META_KEY]`.
 *   When converting engine → v1, it is extracted back as the `sync` field and
 *   removed from the public `meta` map so consumers see a clean object.
 */

import { parseISO, isValid, addHours } from 'date-fns';
import { makeEvent }                   from '../../core/engine/schema/eventSchema';
import { nextEngineId }                from '../../core/engine/adapters/normalizeInputEvent';
import type { EngineEvent, EventStatus } from '../../core/engine/schema/eventSchema';
import type { EngineOccurrence }         from '../../core/engine/schema/occurrenceSchema';
import type { EventConstraint }          from '../../core/engine/schema/constraintSchema';
import type {
  CalendarEventV1,
  CalendarOccurrenceV1,
  SyncMetadata,
} from './types';
import { SYNC_META_KEY } from './types';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Parse any date-like value to a Date, returning null on failure. */
function coerceDate(v: Date | string | number | undefined | null): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isValid(v) ? v : null;
  if (typeof v === 'number') { const d = new Date(v); return isValid(d) ? d : null; }
  if (typeof v === 'string') { const d = parseISO(v); return isValid(d) ? d : null; }
  return null;
}

function coerceExdates(v: Array<Date | string> | undefined): readonly Date[] {
  if (!v) return [];
  return v
    .map(item => item instanceof Date ? item : new Date(String(item)))
    .filter(d => isValid(d));
}

const VALID_STATUSES: EventStatus[] = ['confirmed', 'tentative', 'cancelled'];

function coerceStatus(v: unknown): EventStatus {
  if (typeof v === 'string' && VALID_STATUSES.includes(v as EventStatus)) {
    return v as EventStatus;
  }
  return 'confirmed';
}

/** Extract SyncMetadata from an EngineEvent's meta map (or return undefined). */
function extractSync(meta: Readonly<Record<string, unknown>>): SyncMetadata | undefined {
  const raw = meta[SYNC_META_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.externalId !== 'string' || typeof s.syncSource !== 'string') return undefined;
  const sync: SyncMetadata = {
    externalId: s.externalId,
    syncSource: s.syncSource,
    ...(typeof s.syncToken === 'string'       && { syncToken:    s.syncToken }),
    ...(s.lastSyncedAt instanceof Date        && { lastSyncedAt: s.lastSyncedAt }),
    ...(typeof s.version === 'number'         && { version:      s.version }),
    ...(s.updatedAt instanceof Date           && { updatedAt:    s.updatedAt }),
  };
  return sync;
}

/** Return meta without the internal _v1sync key. */
function cleanMeta(meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...meta };
  delete out[SYNC_META_KEY];
  return out;
}

// ─── Primary adapters ─────────────────────────────────────────────────────────

/**
 * Convert a CalendarEventV1 (external input shape) to an EngineEvent.
 *
 * - Assigns a new engine id when none is provided.
 * - Stores `sync` in `meta[SYNC_META_KEY]` so it survives serialization.
 * - Sets `seriesId = id` when an rrule is present (series master pattern).
 * - Initialises `constraints` from the typed field if provided.
 */
export function eventV1ToEngine(ev: CalendarEventV1): EngineEvent {
  const id = ev.id != null ? String(ev.id) : nextEngineId();

  const start = coerceDate(ev.start) ?? new Date();
  const end   = coerceDate(ev.end)   ?? addHours(start, 1);

  const hasRrule = typeof ev.rrule === 'string' && ev.rrule.length > 0;
  const seriesId = hasRrule ? id : null;

  // Merge sync into meta under the private key
  const baseMeta: Record<string, unknown> = { ...(ev.meta ?? {}) };
  if (ev.sync) baseMeta[SYNC_META_KEY] = ev.sync;

  return makeEvent(id, {
    title:       ev.title,
    start,
    end,
    timezone:    typeof ev.timezone === 'string' && ev.timezone ? ev.timezone : null,
    allDay:      ev.allDay === true,
    category:    typeof ev.category === 'string' ? ev.category : null,
    resourceId:  ev.resourceId != null ? String(ev.resourceId)
                 : ev.resource != null ? String(ev.resource)  // legacy display field fallback
                 : null,
    resourcePoolId: ev.resourcePoolId != null ? String(ev.resourcePoolId) : null,
    status:      coerceStatus(ev.status),
    color:       typeof ev.color === 'string' ? ev.color : null,
    rrule:       hasRrule ? ev.rrule! : null,
    exdates:     coerceExdates(ev.exdates),
    constraints: (ev.constraints ?? []) as readonly EventConstraint[],
    seriesId,
    meta:        baseMeta,
  });
}

/**
 * Convert an EngineEvent to a CalendarEventV1 for host-app callbacks
 * (onEventSave, onEventMove, etc.).
 *
 * - Extracts `sync` from `meta[SYNC_META_KEY]` if present.
 * - Exposes a clean `meta` without the internal `_v1sync` key.
 */
export function engineToV1(ev: EngineEvent): CalendarEventV1 {
  const sync = extractSync(ev.meta);
  const meta = cleanMeta(ev.meta);

  return {
    id:          ev.id,
    title:       ev.title,
    start:       ev.start,
    end:         ev.end,
    allDay:      ev.allDay,
    category:    ev.category ?? undefined,
    color:       ev.color    ?? undefined,
    resourceId:  ev.resourceId ?? undefined,
    resourcePoolId: ev.resourcePoolId ?? undefined,
    timezone:    ev.timezone   ?? undefined,
    status:      ev.status,
    rrule:       ev.rrule      ?? undefined,
    exdates:     ev.exdates.length > 0 ? Array.from(ev.exdates) : undefined,
    constraints: ev.constraints.length > 0 ? Array.from(ev.constraints) : undefined,
    ...(sync && { sync }),
    meta:        Object.keys(meta).length > 0 ? meta : undefined,
  };
}

/**
 * Convert an EngineOccurrence (ephemeral, render-time) to a CalendarOccurrenceV1.
 *
 * The returned value carries both the occurrence `id` (unique per rendered
 * instance) and `eventId` (source EngineEvent id for mutations).  Always
 * use `eventId` — not `id` — when calling engine operations.
 */
export function occurrenceToV1(occ: EngineOccurrence): CalendarOccurrenceV1 {
  const sync = extractSync(occ.meta);
  const meta = cleanMeta(occ.meta);

  return {
    id:              occ.occurrenceId,
    eventId:         occ.eventId,
    seriesId:        occ.seriesId,
    isRecurring:     occ.isRecurring,
    occurrenceIndex: occ.occurrenceIndex,
    title:           occ.title,
    start:           occ.start,
    end:             occ.end,
    allDay:          occ.allDay,
    category:        occ.category    ?? undefined,
    color:           occ.color       ?? undefined,
    resourceId:      occ.resourceId  ?? undefined,
    timezone:        occ.timezone    ?? undefined,
    status:          occ.status,
    constraints:     occ.constraints.length > 0 ? Array.from(occ.constraints) : undefined,
    ...(sync && { sync }),
    meta:            Object.keys(meta).length > 0 ? meta : undefined,
  };
}

// ─── Compatibility shims ──────────────────────────────────────────────────────

/**
 * Upgrade a WorksCalendarEvent (old public input shape) to CalendarEventV1.
 *
 * WorksCalendarEvent is a strict subset of CalendarEventV1 — all fields carry
 * through unchanged.  No data is lost in this direction.
 *
 * The `resource` display-name field is preserved as-is; if you have a
 * structured Resource entity, set `resourceId` on the returned value.
 */
export function legacyToV1(ev: {
  id?: string;
  title: string;
  start: Date | string | number;
  end?: Date | string | number;
  allDay?: boolean;
  category?: string;
  color?: string;
  resource?: string;
  status?: string;
  rrule?: string;
  exdates?: Array<Date | string>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}): CalendarEventV1 {
  return {
    id:       ev.id,
    title:    ev.title,
    start:    ev.start,
    end:      ev.end,
    allDay:   ev.allDay,
    category: ev.category,
    color:    ev.color,
    resource: ev.resource,
    status:   coerceStatus(ev.status),
    rrule:    ev.rrule,
    exdates:  ev.exdates,
    meta:     ev.meta,
  };
}

/**
 * Downgrade a CalendarEventV1 to the old WorksCalendarEvent shape.
 *
 * Used when passing v1 events back to legacy components or hooks that
 * expect the original input shape.  New fields (timezone, resourceId,
 * constraints, sync) are dropped; `resourceId` is demoted to `resource`
 * when `resource` is not already set.
 */
export function v1ToLegacy(ev: CalendarEventV1): {
  id?: string;
  title: string;
  start: Date | string | number;
  end?: Date | string | number;
  allDay?: boolean;
  category?: string;
  color?: string;
  resource?: string;
  status?: EventStatus;
  rrule?: string;
  exdates?: Array<Date | string>;
  meta?: Record<string, unknown>;
} {
  return {
    id:       ev.id,
    title:    ev.title,
    start:    ev.start,
    end:      ev.end,
    allDay:   ev.allDay,
    category: ev.category,
    color:    ev.color,
    // Prefer the display name field; fall back to resourceId so legacy
    // views that group by `resource` can still show something meaningful.
    resource: ev.resource ?? ev.resourceId,
    status:   coerceStatus(ev.status),
    rrule:    ev.rrule,
    exdates:  ev.exdates,
    meta:     ev.meta,
  };
}

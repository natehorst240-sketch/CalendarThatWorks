/**
 * Shared types for the engine-op / mutation seam — the boundary where the
 * calendar's mutation hooks (`useEventMutations`, `useScheduleMutations`,
 * `useScheduleTemplates`) build op-shaped literals, hand them to the engine,
 * and receive `OperationResult`s back.
 *
 * Re-exported here so those hooks depend on one stable module instead of
 * reaching across the full `core/engine/...` path, and so the loose
 * hook-side op shape (`EngineOpInput`) lives next to the strict engine-side
 * one (`EngineOperation`). Introduced for issue #596.
 */
import type {
  EngineOperation,
  RecurringEditScope,
  OperationSource,
} from 'works-calendar-engine';
import type {
  OperationResult,
  EventChange,
  OperationStatus,
} from 'works-calendar-engine';
import type { EngineEvent } from 'works-calendar-engine';
import type { NormalizedEvent, WorksCalendarEvent } from './events';

export type {
  EngineOperation,
  RecurringEditScope,
  OperationSource,
  OperationResult,
  EventChange,
  OperationStatus,
  EngineEvent,
};

/**
 * The loose op shape the mutation hooks construct. Intentionally wider than
 * {@link EngineOperation}: `event` / `patch` are `unknown` because the hooks
 * forward partially-built, mixed-shape event literals (public `start: string`,
 * `resource` vs `resourceId`, …) and `source` is a plain string
 * (some call sites use sources like `'inline-edit'` / `'template'` that aren't
 * in {@link OperationSource}). The engine normalises and validates; a single
 * `as unknown as EngineOperation` cast bridges the two at the
 * `engine.applyMutation` call (see `useCalendarEngine`).
 *
 * Tightening this toward {@link EngineOperation} (reconciling `resource` vs
 * `resourceId`, the extra op sources, `Date | string` starts) is Sprint 3 of #596.
 */
export type EngineOpInput =
  | {
      type: 'create';
      event: unknown;
      scope?: string | undefined;
      occurrenceDate?: Date | undefined;
      source?: string | undefined;
    }
  | {
      type: 'update';
      id: string;
      patch: unknown;
      scope?: string | undefined;
      occurrenceDate?: Date | undefined;
      source?: string | undefined;
    }
  | {
      type: 'delete';
      id: string;
      scope?: string | undefined;
      occurrenceDate?: Date | undefined;
      source?: string | undefined;
    }
  | {
      type: 'move';
      id: string;
      newStart: Date;
      newEnd: Date;
      scope?: string | undefined;
      occurrenceDate?: Date | undefined;
      source?: string | undefined;
    }
  | {
      type: 'resize';
      id: string;
      newStart: Date;
      newEnd: Date;
      scope?: string | undefined;
      occurrenceDate?: Date | undefined;
      source?: string | undefined;
    }
  | {
      type: 'group-change';
      id: string;
      patch: unknown;
      scope?: string | undefined;
      occurrenceDate?: Date | undefined;
      source?: string | undefined;
    };

/** Submit a mutation op through the engine; the callback receives the
 *  post-validate/mutate result. Mirrors `useCalendarEngine`'s `applyEngineOp`. */
export type EngineOpRunner = (
  op: EngineOpInput,
  onAccepted?: (result: OperationResult) => void,
) => void;

/** Wrap a mutation op with the recurring-scope dialog for recurring events.
 *  `opFactory` builds the op for the scope the user picks. */
export type RecurringOpRunner = (
  ev: unknown,
  opFactory: (scope: string) => EngineOpInput,
  onAccepted: (result: OperationResult) => void,
  actionLabel: string,
) => void;

/** Look up the post-mutation engine state for an event id, falling back to a
 *  caller-supplied event (optionally merged with a patch) when the engine
 *  doesn't have it. Mirrors `useCalendarEngine`'s `getSavedEventPayload`. */
export type GetSavedEventPayload = (
  eventId: unknown,
  fallbackEvent?: unknown,
  fallbackPatch?: unknown,
) => WorksCalendarEvent | null;

/** Resolve an event id to its saved payload and forward it to the host's
 *  `onEventSave`. Defined by `useEventMutations`, reused by `useScheduleMutations`. */
export type EmitEventSave = (
  eventId: unknown,
  fallbackEvent?: unknown,
  fallbackPatch?: unknown,
) => void;

/**
 * The grab-bag "event-ish" value the mutation hooks accept: a public
 * {@link WorksCalendarEvent}, an internal {@link NormalizedEvent}, a partial
 * form draft, or an engine occurrence — carrying a mix of public fields,
 * normalisation markers (`_raw`, `_eventId`, `_seriesId`, `_recurring`), and a
 * few form-only fields (`resourcePoolId`, `kind`, `employeeId`). Every field is
 * optional and the index signature accepts the rest; call sites narrow / coerce
 * before use. `NormalizedEvent` is assignable to this.
 */
export interface MutationEventInput {
  id?: string | number | undefined;
  title?: string | undefined;
  start?: Date | string | number | undefined;
  end?: Date | string | number | undefined;
  allDay?: boolean | undefined;
  category?: string | null | undefined;
  color?: string | null | undefined;
  resource?: string | null | undefined;
  resourceId?: string | null | undefined;
  resourcePoolId?: string | null | undefined;
  status?: string | undefined;
  rrule?: string | null | undefined;
  exdates?: ReadonlyArray<Date | string> | undefined;
  meta?: Record<string, unknown> | undefined;
  kind?: string | undefined;
  employeeId?: string | number | undefined;
  /** Original event the host supplied, attached by the normaliser. */
  _raw?: WorksCalendarEvent | undefined;
  /** Series-master id for occurrences — use this for mutations. */
  _eventId?: string | undefined;
  _seriesId?: string | undefined;
  _recurring?: boolean | undefined;
  [key: string]: unknown;
}

/** `Array.prototype.find` doesn't narrow a discriminated union, so the hooks
 *  use these guards when pulling a specific change out of `OperationResult.changes`. */
export function isCreatedChange(
  change: EventChange,
): change is Extract<EventChange, { type: 'created' }> {
  return change.type === 'created';
}

export function isUpdatedChange(
  change: EventChange,
): change is Extract<EventChange, { type: 'updated' }> {
  return change.type === 'updated';
}

export function isDeletedChange(
  change: EventChange,
): change is Extract<EventChange, { type: 'deleted' }> {
  return change.type === 'deleted';
}

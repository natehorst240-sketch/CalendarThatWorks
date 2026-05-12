import { useCallback } from 'react';
import { evaluateConflicts } from '../core/conflictEngine';
import type { ConflictEvent, ConflictRule } from '../core/conflictEngine';
import { occurrenceToLegacy, toLegacyEvent } from '../core/engine/adapters/toLegacyEvents';
import type { EngineEvent } from '../core/engine/schema/eventSchema';
import type { CalendarEngine } from '../core/engine/CalendarEngine';
import { createId } from '../core/createId';
import type { WorksCalendarEvent, NormalizedEvent } from '../types/events';
import type { OwnerConfig } from '../WorksCalendar.types';
import type { FormEventDraft, InlineEditTarget } from './useModalState';
import { isCreatedChange } from '../types/engineOps';
import type {
  EngineOpInput,
  EngineOpRunner,
  RecurringOpRunner,
  GetSavedEventPayload,
  MutationEventInput,
} from '../types/engineOps';

/** A NormalizedEvent isn't assignable to WorksCalendarEvent (it uses `null`
 *  where the public type uses `undefined`); the engine-adapter output is what
 *  host `onEventSave` handlers actually consume. */
function asSavedEvent(ev: EngineEvent): WorksCalendarEvent {
  return toLegacyEvent(ev) as unknown as WorksCalendarEvent;
}

/** Patch applied by the inline event editor. */
export interface InlineEventPatch {
  title?: string | undefined;
  color?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

type UseEventMutationsParams = {
  applyEngineOp: EngineOpRunner;
  applyWithRecurringCheck: RecurringOpRunner;
  getSavedEventPayload: GetSavedEventPayload;
  engine: CalendarEngine;
  engineVer: number;
  expandedEvents: NormalizedEvent[];
  onEventSave?: ((event: WorksCalendarEvent) => void) | undefined;
  onEventMove?: ((event: WorksCalendarEvent, newStart: Date, newEnd: Date) => void) | undefined;
  onEventResize?: ((event: WorksCalendarEvent, newStart: Date, newEnd: Date) => void) | undefined;
  onEventDelete?: ((eventId: string) => void) | undefined;
  onEventGroupChange?: ((event: WorksCalendarEvent, patch: Record<string, unknown>) => void) | undefined;
  ownerConfig: OwnerConfig;
  inlineEditTarget: InlineEditTarget | null;
  setFormEvent: (ev: FormEventDraft | null) => void;
  setInlineEditTarget: (target: InlineEditTarget | null) => void;
};

export function useEventMutations({
  applyEngineOp,
  applyWithRecurringCheck,
  getSavedEventPayload,
  engine,
  engineVer,
  expandedEvents,
  onEventSave,
  onEventMove,
  onEventResize,
  onEventDelete,
  onEventGroupChange,
  ownerConfig,
  inlineEditTarget,
  setFormEvent,
  setInlineEditTarget,
}: UseEventMutationsParams) {
  const emitEventSave = useCallback((eventId: unknown, fallbackEvent: unknown = null, fallbackPatch: unknown = null) => {
    const savedPayload = getSavedEventPayload(eventId, fallbackEvent, fallbackPatch);
    if (savedPayload) onEventSave?.(savedPayload);
  }, [getSavedEventPayload, onEventSave]);

  // Pre-save conflict check for EventForm. Builds an `evaluateConflicts`
  // input from the live event set and the owner-configured rule set.
  // Returns null when conflicts are disabled or no rules are configured.
  //
  // Windowing: do NOT use `expandedEvents` here — that array is scoped
  // to the currently-rendered range, so a user who edits an event's date
  // into another month would miss every conflict outside the visible window.
  // Instead, re-expand over a window that hugs the proposed event's interval,
  // padded by the largest min-rest rule.
  const checkEventConflicts = useCallback((proposed: MutationEventInput) => {
    const conflictsCfg = ownerConfig.conflicts;
    // Host-supplied rule blobs from OwnerConfig; shape-validated by evaluateConflicts.
    const rules = (conflictsCfg?.rules ?? []) as unknown as ConflictRule[];
    const enabled = conflictsCfg?.enabled !== false;
    if (!enabled || rules.length === 0) return null;

    const proposedStart = proposed.start instanceof Date ? proposed.start : new Date(proposed.start ?? '');
    const proposedEnd   = proposed.end   instanceof Date ? proposed.end   : new Date(proposed.end ?? '');
    if (Number.isNaN(proposedStart.getTime()) || Number.isNaN(proposedEnd.getTime())) {
      return null;
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    const restBufferMs = rules.reduce((max, r) => {
      if (r.type === 'min-rest' && typeof r.minutes === 'number') {
        return Math.max(max, r.minutes * 60_000);
      }
      return max;
    }, DAY_MS);

    const windowStart = new Date(proposedStart.getTime() - restBufferMs);
    const windowEnd   = new Date(proposedEnd.getTime()   + restBufferMs);
    const events = engine.getOccurrencesInRange(windowStart, windowEnd).map(occurrenceToLegacy);

    return evaluateConflicts({
      // Pre-save check: the form draft / live occurrences are treated as ConflictEvents.
      proposed: proposed as unknown as ConflictEvent,
      events:   events as unknown as ConflictEvent[],
      rules,
      enabled,
    });
  }, [ownerConfig, engine, engineVer]);

  const handleEventSave = useCallback((rawEv: MutationEventInput) => {
    const newStart = rawEv.start instanceof Date ? rawEv.start : new Date(rawEv.start ?? '');
    const newEnd   = rawEv.end   instanceof Date ? rawEv.end   : new Date(rawEv.end ?? '');
    // Bail on an unparseable start/end before it reaches the engine — an
    // Invalid Date there propagates into `date-fns` formatting of validation
    // messages, which throws `RangeError` and crashes the next render.
    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
      if (typeof console !== 'undefined') {
        console.error('[WorksCalendar] handleEventSave: ignoring an event with an invalid start/end date.', { start: rawEv.start, end: rawEv.end });
      }
      return;
    }
    const recurringMasterId = rawEv._eventId ?? rawEv._seriesId ?? null;
    const eventId  = recurringMasterId ?? (rawEv.id ? String(rawEv.id) : null);

    // Defensive RRULE preservation: if a recurring edit payload arrives with a
    // missing RRULE, keep the series master cadence instead of stripping recurrence.
    const existingMaster = recurringMasterId ? engine.state.events.get(String(recurringMasterId)) : null;
    const resolvedRrule = rawEv.rrule ?? existingMaster?.rrule ?? null;

    if (!eventId) {
      const createdId = String(rawEv.id ?? createId('event'));
      const op: EngineOpInput = {
        type:  'create',
        event: {
          id:             createdId,
          title:          rawEv.title      ?? '(untitled)',
          start:          newStart,
          end:            newEnd,
          allDay:         rawEv.allDay     ?? false,
          resourceId:     rawEv.resource   ?? null,
          resourcePoolId: rawEv.resourcePoolId ?? null,
          category:       rawEv.category   ?? null,
          color:          rawEv.color      ?? null,
          status:         rawEv.status     ?? 'confirmed',
          rrule:          resolvedRrule,
          exdates:        rawEv.exdates    ?? [],
          meta:           rawEv.meta       ?? {},
        },
        source: 'form',
      };
      applyEngineOp(op, (result) => {
        const createdChange = result.changes.find(isCreatedChange);
        const engineId = createdChange?.event.id ?? createdId;
        const savedPayload = getSavedEventPayload(engineId, rawEv, { id: engineId });
        if (savedPayload) onEventSave?.(savedPayload);
        setFormEvent(null);
      });
      return;
    }

    applyWithRecurringCheck(
      rawEv,
      (_scope) => ({
        type:  'update',
        id:    eventId,
        patch: {
          title:      rawEv.title      ?? '(untitled)',
          start:      newStart,
          end:        newEnd,
          allDay:     rawEv.allDay     ?? false,
          resourceId: rawEv.resource   ?? null,
          category:   rawEv.category   ?? null,
          color:      rawEv.color      ?? null,
          status:     rawEv.status     ?? 'confirmed',
          rrule:      resolvedRrule,
        },
        source: 'form',
      }),
      (result) => {
        if (result.changes.length > 1) {
          result.changes.forEach((change) => {
            if (change.type === 'created') {
              onEventSave?.(asSavedEvent(change.event));
            } else if (change.type === 'updated') {
              onEventSave?.(asSavedEvent(change.after));
            }
          });
        } else {
          const savedPayload = getSavedEventPayload(eventId, rawEv);
          if (savedPayload) onEventSave?.(savedPayload);
        }
        setFormEvent(null);
      },
      'Edit',
    );
  }, [applyEngineOp, applyWithRecurringCheck, getSavedEventPayload, onEventSave, engine, setFormEvent]);

  const handleEventMove = useCallback((ev: NormalizedEvent, newStart: Date, newEnd: Date) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (_scope) => ({ type: 'move', id, newStart, newEnd, source: 'drag' }),
      (result) => {
        if (onEventMove) {
          onEventMove(ev as unknown as WorksCalendarEvent, newStart, newEnd);
        } else if (result.changes.length > 1) {
          result.changes.forEach((change) => {
            if (change.type === 'created') onEventSave?.(asSavedEvent(change.event));
            else if (change.type === 'updated') onEventSave?.(asSavedEvent(change.after));
          });
        } else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Move',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventMove, onEventSave]);

  const handleEventResize = useCallback((ev: NormalizedEvent, newStart: Date, newEnd: Date) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (_scope) => ({ type: 'resize', id, newStart, newEnd, source: 'resize' }),
      (result) => {
        if (onEventResize) {
          onEventResize(ev as unknown as WorksCalendarEvent, newStart, newEnd);
        } else if (result.changes.length > 1) {
          result.changes.forEach((change) => {
            if (change.type === 'created') onEventSave?.(asSavedEvent(change.event));
            else if (change.type === 'updated') onEventSave?.(asSavedEvent(change.after));
          });
        } else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Resize',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventResize, onEventSave]);

  const handleEventGroupChange = useCallback((ev: NormalizedEvent, patch: Record<string, unknown>) => {
    if (!patch || typeof patch !== 'object') return;
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyEngineOp(
      { type: 'group-change', id, patch, source: 'drag' },
      () => {
        if (onEventGroupChange) onEventGroupChange(ev as unknown as WorksCalendarEvent, patch);
        else emitEventSave(id, raw, patch);
      },
    );
  }, [applyEngineOp, emitEventSave, onEventGroupChange]);

  const handleEventDelete = useCallback((id: string) => {
    const found   = expandedEvents.find(e => String(e.id) === String(id));
    const eventId = found?._eventId ?? String(id);
    // Guard: reject ghost deletes — an id that exists in neither the visible
    // occurrence list nor the engine's master map is a stale reference.
    // Passing the minimal fallback shape to applyWithRecurringCheck could crash
    // on recurring-scope detection when _recurring/start are missing.
    if (!found && !engine.state.events.has(eventId)) {
      if (typeof console !== 'undefined') {
        console.warn('[WorksCalendar] handleEventDelete: event not found — skipping.', { id });
      }
      return;
    }
    applyWithRecurringCheck(
      found ?? { id: eventId },
      (_scope) => ({ type: 'delete', id: eventId, source: 'form' }),
      () => { onEventDelete?.(id); setFormEvent(null); },
      'Delete',
    );
  }, [applyWithRecurringCheck, engine, expandedEvents, onEventDelete, setFormEvent]);

  const handleInlineSave = useCallback((patch: InlineEventPatch) => {
    const ev = inlineEditTarget?.event;
    if (!ev) return;
    const eventId = ev._eventId ?? String(ev.id);
    applyEngineOp({
      type:   'update',
      id:     eventId,
      patch:  { title: patch.title, color: patch.color, meta: patch.meta },
      source: 'inline-edit',
    }, () => {
      const savedPayload = getSavedEventPayload(eventId, ev, patch);
      if (savedPayload) onEventSave?.(savedPayload);
      setInlineEditTarget(null);
    });
  }, [inlineEditTarget, applyEngineOp, getSavedEventPayload, onEventSave, setInlineEditTarget]);

  const handleInlineDelete = useCallback(() => {
    const ev = inlineEditTarget?.event;
    if (!ev) return;
    const eventId = ev._eventId ?? String(ev.id);
    applyEngineOp({ type: 'delete', id: eventId, source: 'api' }, () => {
      onEventDelete?.(eventId);
      setInlineEditTarget(null);
    });
  }, [inlineEditTarget, applyEngineOp, onEventDelete, setInlineEditTarget]);

  return {
    emitEventSave,
    checkEventConflicts,
    handleEventSave,
    handleEventMove,
    handleEventResize,
    handleEventGroupChange,
    handleEventDelete,
    handleInlineSave,
    handleInlineDelete,
  };
}

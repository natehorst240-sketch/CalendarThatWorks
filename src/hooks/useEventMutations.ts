import { useCallback } from 'react';
import { evaluateConflicts } from '../core/conflictEngine';
import type { ConflictEvent, ConflictRule } from '../core/conflictEngine';
import { occurrenceToLegacy, toLegacyEvent } from '../core/engine/adapters/toLegacyEvents';
import type { OperationContext } from '../core/engine/validation/validationTypes';
import { createId } from '../core/createId';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseValue = any;

type UseEventMutationsParams = {
  applyEngineOp: (op: LooseValue, callback?: (result: LooseValue) => void) => void;
  applyWithRecurringCheck: (
    ev: LooseValue,
    opFactory: (scope: LooseValue) => LooseValue,
    callback: (result: LooseValue) => void,
    actionLabel: string,
  ) => void;
  getSavedEventPayload: (id: LooseValue, fallback?: LooseValue, patch?: LooseValue) => LooseValue;
  engine: LooseValue;
  engineVer: number;
  expandedEvents: LooseValue[];
  onEventSave?: ((event: LooseValue) => void) | undefined;
  onEventMove?: ((event: LooseValue, newStart: Date, newEnd: Date) => void) | undefined;
  onEventResize?: ((event: LooseValue, newStart: Date, newEnd: Date) => void) | undefined;
  onEventDelete?: ((eventId: string) => void) | undefined;
  onEventGroupChange?: ((event: LooseValue, patch: LooseValue) => void) | undefined;
  ownerConfig: LooseValue;
  inlineEditTarget: { event: LooseValue; x: number; y: number } | null;
  setFormEvent: (ev: LooseValue) => void;
  setInlineEditTarget: (target: LooseValue) => void;
};

export function useEventMutations({
  applyEngineOp,
  applyWithRecurringCheck,
  getSavedEventPayload,
  engine,
  engineVer, // eslint-disable-line @typescript-eslint/no-unused-vars
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
  const emitEventSave = useCallback((eventId: LooseValue, fallbackEvent: LooseValue = null, fallbackPatch: LooseValue = null) => {
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
  const checkEventConflicts = useCallback((proposed: LooseValue) => {
    const conflictsCfg = ownerConfig?.['conflicts'] ?? {};
    const rules = (conflictsCfg.rules ?? []) as ConflictRule[];
    const enabled = conflictsCfg.enabled !== false;
    if (!enabled || rules.length === 0) return null;

    const proposedStart = proposed.start instanceof Date ? proposed.start : new Date(proposed.start);
    const proposedEnd   = proposed.end   instanceof Date ? proposed.end   : new Date(proposed.end);
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
      proposed: proposed as ConflictEvent,
      events:   events as unknown as ConflictEvent[],
      rules,
      enabled,
    });
  }, [ownerConfig, engine, engineVer]); // eslint-disable-line react-hooks/exhaustive-deps -- engineVer cues mutation count

  const handleEventSave = useCallback((rawEv: LooseValue) => {
    const newStart = rawEv.start instanceof Date ? rawEv.start : new Date(rawEv.start);
    const newEnd   = rawEv.end   instanceof Date ? rawEv.end   : new Date(rawEv.end);
    const recurringMasterId = rawEv._eventId ?? rawEv._seriesId ?? null;
    const eventId  = recurringMasterId ?? (rawEv.id ? String(rawEv.id) : null);

    // Defensive RRULE preservation: if a recurring edit payload arrives with a
    // missing RRULE, keep the series master cadence instead of stripping recurrence.
    const existingMaster = recurringMasterId ? engine.state.events.get(String(recurringMasterId)) : null;
    const resolvedRrule = rawEv.rrule ?? existingMaster?.rrule ?? null;

    if (!eventId) {
      const createdId = String(rawEv.id ?? createId('event'));
      const op = {
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
      applyEngineOp(op, (result: LooseValue) => {
        const createdChange = result?.changes?.find((c: LooseValue) => c.type === 'created');
        const engineId = createdChange?.event?.id ?? createdId;
        const savedPayload = getSavedEventPayload(engineId, rawEv, { id: engineId });
        if (savedPayload) onEventSave?.(savedPayload);
        setFormEvent(null);
      });
      return;
    }

    applyWithRecurringCheck(
      rawEv,
      (_scope: LooseValue) => ({
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
      (result: LooseValue) => {
        if (result?.changes?.length > 1) {
          result.changes.forEach((change: LooseValue) => {
            if (change.type === 'created') {
              onEventSave?.(toLegacyEvent(change.event) as LooseValue);
            } else if (change.type === 'updated') {
              onEventSave?.(toLegacyEvent(change.after) as LooseValue);
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

  const handleEventMove = useCallback((ev: LooseValue, newStart: LooseValue, newEnd: LooseValue) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (_scope: LooseValue) => ({ type: 'move', id, newStart, newEnd, source: 'drag' }),
      (result: LooseValue) => {
        if (onEventMove) {
          onEventMove(ev, newStart, newEnd);
        } else if (result?.changes?.length > 1) {
          result.changes.forEach((change: LooseValue) => {
            if (change.type === 'created') onEventSave?.(toLegacyEvent(change.event) as LooseValue);
            else if (change.type === 'updated') onEventSave?.(toLegacyEvent(change.after) as LooseValue);
          });
        } else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Move',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventMove, onEventSave]);

  const handleEventResize = useCallback((ev: LooseValue, newStart: LooseValue, newEnd: LooseValue) => {
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyWithRecurringCheck(
      ev,
      (_scope: LooseValue) => ({ type: 'resize', id, newStart, newEnd, source: 'resize' }),
      (result: LooseValue) => {
        if (onEventResize) {
          onEventResize(ev, newStart, newEnd);
        } else if (result?.changes?.length > 1) {
          result.changes.forEach((change: LooseValue) => {
            if (change.type === 'created') onEventSave?.(toLegacyEvent(change.event) as LooseValue);
            else if (change.type === 'updated') onEventSave?.(toLegacyEvent(change.after) as LooseValue);
          });
        } else {
          const savedPayload = getSavedEventPayload(id, raw, { start: newStart, end: newEnd });
          if (savedPayload) onEventSave?.(savedPayload);
        }
      },
      'Resize',
    );
  }, [applyWithRecurringCheck, getSavedEventPayload, onEventResize, onEventSave]);

  const handleEventGroupChange = useCallback((ev: LooseValue, patch: LooseValue) => {
    if (!patch || typeof patch !== 'object') return;
    const raw = ev._raw ?? ev;
    const id  = ev._eventId ?? String(ev.id);
    applyEngineOp(
      { type: 'group-change', id, patch, source: 'drag' },
      () => {
        if (onEventGroupChange) onEventGroupChange(ev, patch);
        else emitEventSave(id, raw, patch);
      },
    );
  }, [applyEngineOp, emitEventSave, onEventGroupChange]);

  const handleEventDelete = useCallback((id: LooseValue) => {
    const ev      = expandedEvents.find((e: LooseValue) => String(e.id) === String(id)) ?? { id };
    const eventId = ev._eventId ?? String(id);
    applyWithRecurringCheck(
      ev,
      (_scope: LooseValue) => ({ type: 'delete', id: eventId, source: 'form' }),
      () => { onEventDelete?.(id); setFormEvent(null); },
      'Delete',
    );
  }, [applyWithRecurringCheck, expandedEvents, onEventDelete, setFormEvent]);

  const handleInlineSave = useCallback((patch: LooseValue) => {
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

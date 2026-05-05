/**
 * useCalendarEngine — owns the CalendarEngine singleton, UndoRedoManager,
 * mutation pipeline (applyEngineOp / applyWithRecurringCheck), and the
 * derived event lists that views consume (expandedEvents, approvalRequestEvents).
 *
 * Extracted from WorksCalendar.tsx (issue #6) so the engine layer is
 * independently testable and WorksCalendar becomes a thinner UI shell.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CalendarEngine }       from '../core/engine/CalendarEngine.ts';
import { UndoRedoManager }      from '../core/engine/UndoRedoManager.ts';
import { fromLegacyEvents }     from '../core/engine/adapters/fromLegacyEvents.ts';
import { occurrenceToLegacy, toLegacyEvent } from '../core/engine/adapters/toLegacyEvents.ts';
import type { ResourcePool }    from '../core/pools/resourcePoolSchema.ts';
import type { OperationContext } from '../core/engine/validation/validationTypes';
import type { AnnouncerRef }    from '../ui/ScreenReaderAnnouncer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyValue = any;

function opAnnouncement(op: AnyValue): string {
  switch (op.type) {
    case 'create':       return `Event "${op.event?.title ?? 'Untitled'}" created.`;
    case 'update':       return 'Event updated.';
    case 'delete':       return 'Event deleted.';
    case 'move':         return 'Event moved.';
    case 'resize':       return 'Event resized.';
    case 'group-change': return 'Event reassigned.';
    default:             return 'Change applied.';
  }
}

export type PendingAlert = {
  violations: AnyValue[];
  isHard: boolean;
  onConfirm: (() => void) | null;
};

export type RecurringPrompt = {
  actionLabel: string;
  onConfirm: (scope: string) => void;
  onCancel: () => void;
};

export type UseCalendarEngineOptions = {
  /** Merged, normalised event list from all sources (static + fetch + ICS + realtime). */
  allNormalized: AnyValue[];
  /** Initial / controlled resource pools. */
  rawPools?: ResourcePool[] | null;
  /** businessHours and blockedWindows forwarded to the engine's OperationContext. */
  businessHours?: AnyValue;
  blockedWindows?: AnyValue[];
  /** Ref to the ScreenReaderAnnouncer instance mounted in WorksCalendar. */
  announcerRef: React.RefObject<AnnouncerRef | null>;
  /** Current visible date range — drives occurrence expansion. */
  range: { start: Date; end: Date };
  /** Initial calendar view. Defaults to 'month'. */
  initialView?: string;
  /** Called whenever the engine commits a new pools snapshot (round-robin advance). */
  onPoolsChange?: (pools: ResourcePool[], meta: { sequence: number }) => void;
};

export type UseCalendarEngineResult = {
  engine: CalendarEngine;
  undoManager: UndoRedoManager;
  /** Monotonic counter: increments on every engine state change. */
  engineVer: number;
  /** Occurrences expanded from the engine for the current visible range. */
  expandedEvents: AnyValue[];
  /** All master events that carry an approvalStage — unwindowed. */
  approvalRequestEvents: AnyValue[];
  /** Submit a mutation op through the engine, handling soft/hard violations. */
  applyEngineOp: (op: AnyValue, onAccepted: AnyValue) => void;
  /** Wrap a mutation op with a recurring-scope dialog for recurring events. */
  applyWithRecurringCheck: (
    ev: AnyValue,
    makeOp: (scope: string) => AnyValue,
    onAccepted: AnyValue,
    actionLabel: string,
  ) => void;
  /** Look up the post-mutation engine state for a given event id. */
  getSavedEventPayload: (
    eventId: AnyValue,
    fallbackEvent?: AnyValue,
    fallbackPatch?: AnyValue,
  ) => AnyValue | null;
  pendingAlert: PendingAlert | null;
  setPendingAlert: (alert: PendingAlert | null) => void;
  recurringPrompt: RecurringPrompt | null;
};

export function useCalendarEngine({
  allNormalized,
  rawPools,
  businessHours,
  blockedWindows,
  announcerRef,
  range,
  initialView,
  onPoolsChange,
}: UseCalendarEngineOptions): UseCalendarEngineResult {
  // ── Engine singleton init (synchronous, before first render) ─────────────
  const engineRef      = useRef<CalendarEngine | null>(null);
  const undoManagerRef = useRef<UndoRedoManager | null>(null);
  const lastPoolsRef   = useRef<ReadonlyMap<string, ResourcePool> | null>(null);
  const poolsSequenceRef = useRef(0);

  if (engineRef.current === null) {
    const initState = rawPools && rawPools.length > 0 ? { pools: rawPools } : {};
    engineRef.current = new CalendarEngine(
      initialView ? { ...initState, view: initialView as AnyValue } : (rawPools && rawPools.length > 0 ? initState : undefined),
    );
    undoManagerRef.current = new UndoRedoManager(engineRef.current, { maxSize: 50 });
    lastPoolsRef.current = engineRef.current.state.pools;
  }

  const engine      = engineRef.current;
  const undoManager = undoManagerRef.current;
  if (engine === null || undoManager === null) {
    throw new Error('CalendarEngine/UndoRedoManager failed to initialize');
  }

  // Counts how many onEventSave-triggered prop updates to suppress clear() for.
  const engineMutationPendingRef = useRef(0);

  // ── engineVer: monotonic counter, increments on each engine state change ──
  const [engineVer, tickEngine] = useReducer((n: number) => n + 1, 0);
  useEffect(() => engine.subscribe(() => tickEngine()), [engine]);

  // ── Pool sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rawPools) return;
    engine.setPools(rawPools);
    lastPoolsRef.current = engine.state.pools;
  }, [engine, rawPools]);

  useEffect(() => {
    if (!onPoolsChange) return;
    const current = engine.state.pools;
    if (current === lastPoolsRef.current) return;
    lastPoolsRef.current = current;
    poolsSequenceRef.current += 1;
    onPoolsChange(Array.from(current.values()), { sequence: poolsSequenceRef.current });
  }, [engine, engineVer, onPoolsChange]);

  // ── allNormalized → engine events sync ───────────────────────────────────
  useEffect(() => {
    engine.setEvents(fromLegacyEvents(allNormalized as AnyValue));
    if (engineMutationPendingRef.current > 0) {
      engineMutationPendingRef.current -= 1;
    } else {
      undoManager.clear();
    }
  }, [engine, undoManager, allNormalized]);

  // ── OperationContext (stable ref, updated every render) ──────────────────
  const opCtxRef = useRef<OperationContext | null>(null);
  opCtxRef.current = {
    businessHours:  businessHours ?? null,
    blockedWindows: blockedWindows ?? [],
  } as unknown as OperationContext;

  // ── Expanded events for current visible range ─────────────────────────────
  const expandedEvents: AnyValue[] = useMemo(
    () => engine.getOccurrencesInRange(range.start, range.end).map(occurrenceToLegacy),
    [engine, engineVer, range], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Approval queue — unwindowed master-record scan ───────────────────────
  const approvalRequestEvents: AnyValue[] = useMemo(() => {
    const out: AnyValue[] = [];
    for (const ev of engine.state.events.values()) {
      const stage = (ev.meta as { approvalStage?: { stage?: string } } | undefined)?.approvalStage?.stage;
      if (typeof stage === 'string') out.push(toLegacyEvent(ev));
    }
    return out;
  }, [engine, engineVer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending validation alert (soft/hard violation dialog) ────────────────
  const [pendingAlert, setPendingAlert] = useState<PendingAlert | null>(null);

  // ── Recurring scope prompt ────────────────────────────────────────────────
  const [recurringPrompt, setRecurringPrompt] = useState<RecurringPrompt | null>(null);

  // ── getSavedEventPayload ──────────────────────────────────────────────────
  const getSavedEventPayload = useCallback(
    (eventId: AnyValue, fallbackEvent: AnyValue = null, fallbackPatch: AnyValue = null) => {
      const normalizedId = eventId == null ? '' : String(eventId);
      if (normalizedId) {
        const saved = engine.state.events.get(normalizedId);
        if (saved) return toLegacyEvent(saved);
      }
      if (!fallbackEvent) return null;
      return fallbackPatch ? { ...fallbackEvent, ...fallbackPatch } : fallbackEvent;
    },
    [engine],
  );

  // ── applyEngineOp ─────────────────────────────────────────────────────────
  const applyEngineOp = useCallback(
    (op: AnyValue, onAccepted: AnyValue) => {
      const ctx = opCtxRef.current;
      if (ctx === null) return;

      const preSnap = undoManager.captureSnapshot();
      const result  = engine.applyMutation(op, ctx);

      if (result.status === 'accepted' || result.status === 'accepted-with-warnings') {
        undoManager.record(preSnap, op.type);
        announcerRef.current?.announce(opAnnouncement(op));
        engineMutationPendingRef.current = Math.max(1, result.changes.length);
        onAccepted(result);

      } else if (result.status === 'pending-confirmation') {
        setPendingAlert({
          violations: result.validation.violations,
          isHard: false,
          onConfirm: () => {
            const confirmed = engine.applyMutation(op, ctx, { overrideSoftViolations: true });
            if (confirmed.status === 'accepted' || confirmed.status === 'accepted-with-warnings') {
              undoManager.record(preSnap, op.type);
              announcerRef.current?.announce(opAnnouncement(op));
              engineMutationPendingRef.current = Math.max(1, confirmed.changes.length);
              onAccepted(confirmed);
            }
          },
        });

      } else {
        setPendingAlert({ violations: result.validation.violations, isHard: true, onConfirm: null });
      }
    },
    [engine, undoManager, announcerRef],
  );

  // ── applyWithRecurringCheck ───────────────────────────────────────────────
  const applyWithRecurringCheck = useCallback(
    (
      ev: AnyValue,
      makeOp: (scope: string) => AnyValue,
      onAccepted: AnyValue,
      actionLabel: string,
    ) => {
      if (!ev._recurring) {
        applyEngineOp(makeOp('series'), onAccepted);
        return;
      }
      setRecurringPrompt({
        actionLabel,
        onConfirm: (scope: string) => {
          setRecurringPrompt(null);
          applyEngineOp(
            {
              ...makeOp(scope),
              scope,
              occurrenceDate: ev.start instanceof Date ? ev.start : new Date(ev.start),
            },
            onAccepted,
          );
        },
        onCancel: () => setRecurringPrompt(null),
      });
    },
    [applyEngineOp],
  );

  return {
    engine,
    undoManager,
    engineVer,
    expandedEvents,
    approvalRequestEvents,
    applyEngineOp,
    applyWithRecurringCheck,
    getSavedEventPayload,
    pendingAlert,
    setPendingAlert,
    recurringPrompt,
  };
}

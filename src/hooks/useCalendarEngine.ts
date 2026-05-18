/**
 * useCalendarEngine — owns the CalendarEngine singleton, UndoRedoManager,
 * mutation pipeline (applyEngineOp / applyWithRecurringCheck), and the
 * derived event lists that views consume (expandedEvents, approvalRequestEvents).
 *
 * Extracted from WorksCalendar.tsx (issue #6) so the engine layer is
 * independently testable and WorksCalendar becomes a thinner UI shell.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CalendarEngine }       from 'works-calendar-engine';
import { UndoRedoManager }      from 'works-calendar-engine';
import { fromLegacyEvents }     from 'works-calendar-engine';
import { occurrenceToLegacy, toLegacyEvent } from 'works-calendar-engine';
import type { ResourcePool }    from 'works-calendar-engine';
import type { OperationContext } from 'works-calendar-engine';
import type { AnnouncerRef }    from '../ui/ScreenReaderAnnouncer';
import type { WorksCalendarEvent, NormalizedEvent } from '../types/events';
import type {
  EngineOpInput,
  EngineOperation,
  EngineOpRunner,
  GetSavedEventPayload,
  OperationResult,
  RecurringOpRunner,
} from '../types/engineOps';

// Engine "event-like" payloads flow through this hook as either input
// (raw legacy events from hosts) or output (legacy-shaped occurrences and
// approval-requests). Inputs accept anything assignable to WorksCalendarEvent;
// outputs always conform to NormalizedEvent.

function opAnnouncement(op: EngineOpInput): string {
  switch (op.type) {
    case 'create': {
      const title = (op.event as { title?: unknown } | null | undefined)?.title;
      return `Event "${String(title ?? 'Untitled')}" created.`;
    }
    case 'update':       return 'Event updated.';
    case 'delete':       return 'Event deleted.';
    case 'move':         return 'Event moved.';
    case 'resize':       return 'Event resized.';
    case 'group-change': return 'Event reassigned.';
    default:             return 'Change applied.';
  }
}

export type PendingAlert = {
  violations: readonly unknown[];
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
  allNormalized: ReadonlyArray<WorksCalendarEvent | NormalizedEvent>;
  /** Initial / controlled resource pools. */
  rawPools?: ResourcePool[] | null | undefined;
  /** businessHours and blockedWindows forwarded to the engine's OperationContext. */
  businessHours?: unknown;
  blockedWindows?: ReadonlyArray<unknown> | undefined;
  /** Ref to the ScreenReaderAnnouncer instance mounted in WorksCalendar. */
  announcerRef: React.RefObject<AnnouncerRef | null>;
  /** Current visible date range — drives occurrence expansion. */
  range: { start: Date; end: Date };
  /** Initial calendar view. Defaults to 'month'. */
  initialView?: string;
  /** Called whenever the engine commits a new pools snapshot (round-robin advance). */
  onPoolsChange?: ((pools: ResourcePool[], meta: { sequence: number }) => void) | undefined;
};

export type UseCalendarEngineResult = {
  engine: CalendarEngine;
  undoManager: UndoRedoManager;
  /** Monotonic counter: increments on every engine state change. */
  engineVer: number;
  /** Occurrences expanded from the engine for the current visible range. */
  expandedEvents: NormalizedEvent[];
  /** All master events that carry an approvalStage — unwindowed. */
  approvalRequestEvents: NormalizedEvent[];
  /** Submit a mutation op through the engine, handling soft/hard violations. */
  applyEngineOp: EngineOpRunner;
  /** Wrap a mutation op with a recurring-scope dialog for recurring events. */
  applyWithRecurringCheck: RecurringOpRunner;
  /** Look up the post-mutation engine state for a given event id. */
  getSavedEventPayload: GetSavedEventPayload;
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
    try {
      const initState: Record<string, unknown> = rawPools && rawPools.length > 0 ? { pools: rawPools } : {};
      if (initialView) initState['view'] = initialView;
      engineRef.current = new CalendarEngine(
        (initialView || (rawPools && rawPools.length > 0))
          ? (initState as unknown as ConstructorParameters<typeof CalendarEngine>[0])
          : undefined,
      );
      undoManagerRef.current = new UndoRedoManager(engineRef.current, { maxSize: 50 });
      lastPoolsRef.current = engineRef.current.state.pools;
    } catch (err) {
      // Surface the underlying cause with context instead of a blank crash —
      // a throw here usually means a malformed `events`/`pools` prop.
      if (err instanceof Error) {
        err.message = `WorksCalendar: the calendar engine failed to initialize (check the events/pools passed in) — ${err.message}`;
        throw err;
      }
      throw new Error(`WorksCalendar: the calendar engine failed to initialize (check the events/pools passed in) — ${String(err)}`);
    }
  }

  const engine      = engineRef.current;
  const undoManager = undoManagerRef.current;
  if (engine === null || undoManager === null) {
    throw new Error('CalendarEngine/UndoRedoManager failed to initialize');
  }

  // Counts how many onEventSave-triggered prop updates to suppress clear() for.
  const engineMutationPendingRef = useRef(0);
  // One-shot flag: consumed by the first allNormalized update that arrives after
  // the counter reaches zero. Handles the race where a fetchEvents poll arrives
  // between a mutation commit and its onEventSave-triggered prop re-render,
  // decrementing the counter to zero before the expected update lands.
  const gracePendingRef = useRef(false);

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
    engine.setEvents(fromLegacyEvents(allNormalized as unknown as Parameters<typeof fromLegacyEvents>[0]));
    if (engineMutationPendingRef.current > 0) {
      engineMutationPendingRef.current -= 1;
    } else if (gracePendingRef.current) {
      // One-shot: a poll consumed the counter before onEventSave re-rendered.
      // Absorb this single update without clearing undo, then disarm the flag
      // so subsequent external updates clear as normal.
      gracePendingRef.current = false;
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
  const expandedEvents: NormalizedEvent[] = useMemo(
    () => engine.getOccurrencesInRange(range.start, range.end).map(occurrenceToLegacy) as unknown as NormalizedEvent[],
    [engine, engineVer, range],
  );

  // ── Approval queue — unwindowed master-record scan ───────────────────────
  const approvalRequestEvents: NormalizedEvent[] = useMemo(() => {
    const out: NormalizedEvent[] = [];
    for (const ev of engine.state.events.values()) {
      const stage = (ev.meta as { approvalStage?: { stage?: string } } | undefined)?.approvalStage?.stage;
      if (typeof stage === 'string') out.push(toLegacyEvent(ev) as unknown as NormalizedEvent);
    }
    return out;
  }, [engine, engineVer]);

  // ── Pending validation alert (soft/hard violation dialog) ────────────────
  const [pendingAlert, setPendingAlert] = useState<PendingAlert | null>(null);

  // ── Recurring scope prompt ────────────────────────────────────────────────
  const [recurringPrompt, setRecurringPrompt] = useState<RecurringPrompt | null>(null);

  // ── getSavedEventPayload ──────────────────────────────────────────────────
  const getSavedEventPayload: GetSavedEventPayload = useCallback(
    (eventId: unknown, fallbackEvent: unknown = null, fallbackPatch: unknown = null): WorksCalendarEvent | null => {
      const normalizedId = eventId == null ? '' : String(eventId);
      if (normalizedId) {
        const saved = engine.state.events.get(normalizedId);
        // Engine-adapter boundary: the legacy event shape is what host onEventSave handlers consume.
        if (saved) return toLegacyEvent(saved) as unknown as WorksCalendarEvent;
      }
      if (!fallbackEvent) return null;
      const base = fallbackEvent as Record<string, unknown>;
      return (fallbackPatch ? { ...base, ...(fallbackPatch as Record<string, unknown>) } : base) as unknown as WorksCalendarEvent;
    },
    [engine],
  );

  // ── applyEngineOp ─────────────────────────────────────────────────────────
  const applyEngineOp: EngineOpRunner = useCallback(
    (op: EngineOpInput, onAccepted?: (result: OperationResult) => void) => {
      const ctx = opCtxRef.current;
      if (ctx === null) return;

      const preSnap = undoManager.captureSnapshot();
      // Engine-adapter boundary: the loose hook-built op is normalised + validated by the engine.
      const engineOp = op as unknown as EngineOperation;
      const result  = engine.applyMutation(engineOp, ctx);

      if (result.status === 'accepted' || result.status === 'accepted-with-warnings') {
        undoManager.record(preSnap, op.type);
        announcerRef.current?.announce(opAnnouncement(op));
        gracePendingRef.current = true;
        engineMutationPendingRef.current = Math.max(1, result.changes.length);
        onAccepted?.(result);

      } else if (result.status === 'pending-confirmation') {
        setPendingAlert({
          violations: result.validation.violations,
          isHard: false,
          onConfirm: () => {
            const confirmed = engine.applyMutation(engineOp, ctx, { overrideSoftViolations: true });
            if (confirmed.status === 'accepted' || confirmed.status === 'accepted-with-warnings') {
              undoManager.record(preSnap, op.type);
              announcerRef.current?.announce(opAnnouncement(op));
              gracePendingRef.current = true;
              engineMutationPendingRef.current = Math.max(1, confirmed.changes.length);
              onAccepted?.(confirmed);
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
  const applyWithRecurringCheck: RecurringOpRunner = useCallback(
    (
      ev: unknown,
      makeOp: (scope: string) => EngineOpInput,
      onAccepted: (result: OperationResult) => void,
      actionLabel: string,
    ) => {
      const evObj = ev as { _recurring?: unknown; start?: Date | string | number | undefined };
      if (!evObj._recurring) {
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
              occurrenceDate: evObj.start instanceof Date ? evObj.start : new Date(evObj.start ?? ''),
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

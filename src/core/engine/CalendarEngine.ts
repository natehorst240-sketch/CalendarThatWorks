/**
 * CalendarEngine — framework-agnostic state container.
 *
 * Primary API:
 *   const engine = new CalendarEngine({ events: [...], view: 'month' });
 *   const unsub  = engine.subscribe(state => render(state));
 *
 *   // Navigation / filter dispatches (pure state, no validation)
 *   engine.dispatch({ type: 'NAVIGATE_NEXT' });
 *
 *   // Mutation with validation (returns OperationResult)
 *   const result = engine.applyMutation(
 *     buildOperation.fromDragMove(event, newStart, newEnd),
 *     ctx,
 *   );
 *   if (result.status === 'pending-confirmation') showWarningDialog(result);
 *
 *   // Occurrence expansion (main read path for views)
 *   const occurrences = engine.getOccurrencesInRange(rangeStart, rangeEnd);
 *
 *   unsub();
 */

import { applyOperation as applyStateOp } from './operations';
import {
  applyOperation as applyMutationOp,
  type ApplyOptions,
} from './operations/applyOperation';
import type { Assignment }       from './schema/assignmentSchema';
import type { Dependency }       from './schema/dependencySchema';
import type { ResourceCalendar } from './schema/resourceCalendarSchema';
import {
  getOccurrencesInRange,
  type GetOccurrencesOptions,
} from './selectors/getOccurrencesInRange';
import {
  beginTransaction,
} from './transactions/beginTransaction';
import {
  commitTransaction,
} from './transactions/commitTransaction';
import {
  rollbackTransaction,
} from './transactions/rollbackTransaction';
import type { TransactionHandle } from './transactions/beginTransaction';
import type { OperationResult } from './operations/operationResult';
import type { EngineOperation } from './schema/operationSchema';
import type { EngineOccurrence } from './schema/occurrenceSchema';
import type { OperationContext } from './validation/validationTypes';
import type {
  CalendarState,
  CalendarEngineInit,
  FilterState,
  Operation,
  StateListener,
  Unsubscribe,
} from './types';
import type { EngineEvent } from './schema/eventSchema';

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialState(init: CalendarEngineInit = {}): CalendarState {
  const eventMap = new Map<string, EngineEvent>();
  for (const ev of init.events ?? []) eventMap.set(ev.id, ev);

  const assignMap = new Map<string, Assignment>();
  for (const a of init.assignments ?? []) assignMap.set(a.id, a);

  const depMap = new Map<string, Dependency>();
  for (const d of init.dependencies ?? []) depMap.set(d.id, d);

  const calMap = new Map<string, ResourceCalendar>();
  for (const c of init.resourceCalendars ?? []) calMap.set(c.id, c);

  const defaultFilter: FilterState = {
    search: '',
    categories: new Set(),
    resources: new Set(),
  };

  const filter: FilterState = init.filter
    ? {
        search:     init.filter.search     ?? '',
        categories: init.filter.categories ?? new Set(),
        resources:  init.filter.resources  ?? new Set(),
      }
    : defaultFilter;

  return {
    events:            eventMap,
    assignments:       assignMap,
    dependencies:      depMap,
    resourceCalendars: calMap,
    view:     init.view   ?? 'month',
    cursor:   init.cursor ?? new Date(),
    filter,
    config:   init.config ?? {},
    selection: new Set(),
  };
}

// ─── Engine class ─────────────────────────────────────────────────────────────

export class CalendarEngine {
  private _state: CalendarState;
  private _listeners: Set<StateListener> = new Set();

  constructor(init: CalendarEngineInit = {}) {
    this._state = createInitialState(init);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get state(): CalendarState {
    return this._state;
  }

  // ── Navigation / filter dispatch (no validation) ────────────────────────────

  /**
   * Dispatch a navigation or filter operation.
   * These are pure state transitions with no validation or side effects.
   * For event mutations (create/move/resize/update/delete), use applyMutation().
   */
  dispatch(op: Operation): CalendarState {
    const next = applyStateOp(this._state, op);
    if (next !== this._state) {
      this._state = next;
      this._notify();
    }
    return this._state;
  }

  // ── Mutation pipeline (with validation) ──────────────────────────────────────

  /**
   * Apply an EngineOperation (create/move/resize/update/delete) through the
   * full validate → apply pipeline.
   *
   * Returns an OperationResult:
   *   - 'accepted'               → changes applied, state notified
   *   - 'accepted-with-warnings' → applied despite soft violations
   *   - 'pending-confirmation'   → soft violation, state NOT changed; call again
   *                                with opts.overrideSoftViolations=true to confirm
   *   - 'rejected'               → hard violation, state NOT changed
   */
  applyMutation(
    op: EngineOperation,
    ctx: OperationContext = {},
    opts: ApplyOptions = {},
  ): OperationResult {
    // Merge engine-owned structural state into the validation context so rules
    // like dependency and overlap checking see the full picture.
    const enrichedCtx: OperationContext = {
      assignments:       ctx.assignments       ?? this._state.assignments,
      dependencies:      ctx.dependencies      ?? this._state.dependencies,
      resourceCalendars: ctx.resourceCalendars ?? this._state.resourceCalendars,
      ...ctx,
    };
    const result = applyMutationOp(op, this._state.events, enrichedCtx, opts);

    if (result.status === 'accepted' || result.status === 'accepted-with-warnings') {
      // Commit changes to state
      const tx = beginTransaction(this._state.events);
      const commit = commitTransaction(tx, this._state.events, result.changes);
      this._state = { ...this._state, events: commit.events };
      this._notify();
    }

    return result;
  }

  // ── Read path ─────────────────────────────────────────────────────────────────

  /**
   * Return all occurrences overlapping [rangeStart, rangeEnd), with
   * recurrence fully expanded.  This is the canonical read path for views.
   */
  getOccurrencesInRange(
    rangeStart: Date,
    rangeEnd: Date,
    opts: GetOccurrencesOptions = {},
  ): EngineOccurrence[] {
    const filterOpts: GetOccurrencesOptions = {
      filter:      opts.filter      ?? this._state.filter,
      assignments: opts.assignments ?? this._state.assignments,
      ...opts,
    };
    return getOccurrencesInRange(this._state.events, rangeStart, rangeEnd, filterOpts);
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────────

  /**
   * Subscribe to state changes.  The listener fires synchronously after
   * every dispatch or applyMutation that produces a state change.
   *
   * Returns an unsubscribe function.
   */
  subscribe(listener: StateListener): Unsubscribe {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  // ── Convenience helpers ───────────────────────────────────────────────────────

  /**
   * Replace all events atomically (e.g. on remote data refresh).
   * Notifies subscribers once.
   */
  setEvents(events: ReadonlyArray<EngineEvent>): void {
    const map = new Map<string, EngineEvent>(events.map(ev => [ev.id, ev]));
    this._state = { ...this._state, events: map };
    this._notify();
  }

  /** Reset to a fresh initial state, optionally preserving config. */
  reset(init: CalendarEngineInit = {}): void {
    this._state = createInitialState({
      config: this._state.config,
      ...init,
    });
    this._notify();
  }

  // ── Assignment CRUD ────────────────────────────────────────────────────────────

  /** Replace all assignments atomically. Notifies subscribers once. */
  setAssignments(assignments: ReadonlyArray<Assignment>): void {
    const map = new Map<string, Assignment>(assignments.map(a => [a.id, a]));
    this._state = { ...this._state, assignments: map };
    this._notify();
  }

  /** Add or replace a single assignment. */
  upsertAssignment(assignment: Assignment): void {
    const map = new Map(this._state.assignments);
    map.set(assignment.id, assignment);
    this._state = { ...this._state, assignments: map };
    this._notify();
  }

  /** Remove a single assignment by id. No-op when not found. */
  removeAssignment(id: string): void {
    if (!this._state.assignments.has(id)) return;
    const map = new Map(this._state.assignments);
    map.delete(id);
    this._state = { ...this._state, assignments: map };
    this._notify();
  }

  /** Return all assignments for a given event. */
  getAssignmentsForEvent(eventId: string): Assignment[] {
    const result: Assignment[] = [];
    for (const a of this._state.assignments.values()) {
      if (a.eventId === eventId) result.push(a);
    }
    return result;
  }

  /** Return all assignments for a given resource. */
  getAssignmentsForResource(resourceId: string): Assignment[] {
    const result: Assignment[] = [];
    for (const a of this._state.assignments.values()) {
      if (a.resourceId === resourceId) result.push(a);
    }
    return result;
  }

  // ── Dependency CRUD ────────────────────────────────────────────────────────────

  /** Replace all dependencies atomically. Notifies subscribers once. */
  setDependencies(dependencies: ReadonlyArray<Dependency>): void {
    const map = new Map<string, Dependency>(dependencies.map(d => [d.id, d]));
    this._state = { ...this._state, dependencies: map };
    this._notify();
  }

  /** Add or replace a single dependency. */
  upsertDependency(dep: Dependency): void {
    const map = new Map(this._state.dependencies);
    map.set(dep.id, dep);
    this._state = { ...this._state, dependencies: map };
    this._notify();
  }

  /** Remove a dependency by id. No-op when not found. */
  removeDependency(id: string): void {
    if (!this._state.dependencies.has(id)) return;
    const map = new Map(this._state.dependencies);
    map.delete(id);
    this._state = { ...this._state, dependencies: map };
    this._notify();
  }

  /** Return all dependencies where eventId is the predecessor. */
  getSuccessorsOf(eventId: string): Dependency[] {
    const result: Dependency[] = [];
    for (const d of this._state.dependencies.values()) {
      if (d.fromEventId === eventId) result.push(d);
    }
    return result;
  }

  /** Return all dependencies where eventId is the successor. */
  getPredecessorsOf(eventId: string): Dependency[] {
    const result: Dependency[] = [];
    for (const d of this._state.dependencies.values()) {
      if (d.toEventId === eventId) result.push(d);
    }
    return result;
  }

  // ── Resource calendar CRUD ────────────────────────────────────────────────────

  /** Replace all resource calendars atomically. Notifies subscribers once. */
  setResourceCalendars(calendars: ReadonlyArray<ResourceCalendar>): void {
    const map = new Map<string, ResourceCalendar>(calendars.map(c => [c.id, c]));
    this._state = { ...this._state, resourceCalendars: map };
    this._notify();
  }

  /** Add or replace a single resource calendar. */
  upsertResourceCalendar(calendar: ResourceCalendar): void {
    const map = new Map(this._state.resourceCalendars);
    map.set(calendar.id, calendar);
    this._state = { ...this._state, resourceCalendars: map };
    this._notify();
  }

  /** Remove a resource calendar by id. No-op when not found. */
  removeResourceCalendar(id: string): void {
    if (!this._state.resourceCalendars.has(id)) return;
    const map = new Map(this._state.resourceCalendars);
    map.delete(id);
    this._state = { ...this._state, resourceCalendars: map };
    this._notify();
  }

  /** Return the calendar for a given resource, or null if none is registered. */
  getCalendarForResource(resourceId: string): ResourceCalendar | null {
    for (const c of this._state.resourceCalendars.values()) {
      if (c.resourceId === resourceId) return c;
    }
    return null;
  }

  // ── Transaction helpers ───────────────────────────────────────────────────────

  /**
   * Snapshot the current events map for optimistic UI or undo/redo.
   * Use rollbackTo(handle) to restore this snapshot.
   */
  snapshot(label?: string): TransactionHandle {
    return beginTransaction(this._state.events, label);
  }

  /** Restore state to a previous snapshot. Notifies subscribers. */
  rollbackTo(handle: TransactionHandle): void {
    const restored = rollbackTransaction(handle);
    this._state = { ...this._state, events: restored };
    this._notify();
  }

  /**
   * Atomically restore all structural state maps (events, assignments,
   * dependencies, resourceCalendars) from a snapshot.
   *
   * This is the undo/redo restore path — it updates all four collections
   * in a single state object update and fires one notification.
   *
   * Only fields present on the snapshot object are overwritten; missing
   * fields preserve the current state.
   */
  restoreState(snapshot: {
    readonly events?:            ReadonlyMap<string, EngineEvent>;
    readonly assignments?:       ReadonlyMap<string, Assignment>;
    readonly dependencies?:      ReadonlyMap<string, Dependency>;
    readonly resourceCalendars?: ReadonlyMap<string, ResourceCalendar>;
  }): void {
    this._state = {
      ...this._state,
      ...(snapshot.events            != null && { events:            snapshot.events }),
      ...(snapshot.assignments       != null && { assignments:       snapshot.assignments }),
      ...(snapshot.dependencies      != null && { dependencies:      snapshot.dependencies }),
      ...(snapshot.resourceCalendars != null && { resourceCalendars: snapshot.resourceCalendars }),
    };
    this._notify();
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private _notify(): void {
    for (const listener of this._listeners) {
      try {
        listener(this._state);
      } catch (err) {
        console.error('[CalendarEngine] Listener threw:', err);
      }
    }
  }
}

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
import type { ResourcePool }     from '../pools/resourcePoolSchema';
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
import type { OperationResult, EventChange } from './operations/operationResult';
import type { EngineOperation } from './schema/operationSchema';
import type { EngineOccurrence } from './schema/occurrenceSchema';
import type { OperationContext } from './validation/validationTypes';
import { resolvePoolForOp } from './resolvePoolOnSubmit';
import type {
  CalendarState,
  CalendarEngineInit,
  FilterState,
  Operation,
  StateListener,
  Unsubscribe,
} from './types';
import type { EngineEvent } from './schema/eventSchema';
import {
  channelForApprovalTransition,
  type EventBus,
  type BookingChannel,
  type BookingLifecyclePayload,
} from './eventBus';
import type { ApprovalStage } from '../../types/assets';

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

  const poolMap = new Map<string, ResourcePool>();
  for (const p of init.pools ?? []) poolMap.set(p.id, p);

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
    pools:             poolMap,
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

  // ── Assignment indexes (issue #221) ───────────────────────────────────────
  //
  // Maintained alongside `_state.assignments` so resource/event lookups are
  // O(k) in the number of matching assignments rather than O(n) over all.
  // Rebuilt wholesale on bulk replacement (setAssignments / restoreState /
  // reset) and updated incrementally on single-assignment mutations.
  private _assignmentsByResource: Map<string, Set<string>> = new Map();
  private _assignmentsByEvent:    Map<string, Set<string>> = new Map();

  /** Optional lifecycle bus (issue #216). null when host did not wire one. */
  private _bus: EventBus | null;

  constructor(init: CalendarEngineInit = {}) {
    this._state = createInitialState(init);
    this._bus = init.bus ?? null;
    this._rebuildAssignmentIndex();
  }

  /** Lifecycle bus accessor (issue #216). Returns null when not configured. */
  get bus(): EventBus | null {
    return this._bus;
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
    // Pool resolve (#212): a create op with resourcePoolId is rewritten to
    // target a concrete member before validation. Unresolvable pools surface
    // as hard violations; the round-robin cursor advance comes back as a
    // pool-update that we persist atomically with the booking commit.
    const resolved = resolvePoolForOp(op, {
      events:      this._state.events,
      pools:       this._state.pools,
      assignments: ctx.assignments ?? this._state.assignments,
    });
    if (resolved.kind === 'rejected') return resolved.result;
    const effectiveOp = resolved.kind === 'rewritten' ? resolved.op : op;
    const poolUpdate  = resolved.kind === 'rewritten' ? resolved.poolUpdate : undefined;

    // Merge engine-owned structural state into the validation context so rules
    // like dependency and overlap checking see the full picture.
    const enrichedCtx: OperationContext = {
      assignments:       ctx.assignments       ?? this._state.assignments,
      dependencies:      ctx.dependencies      ?? this._state.dependencies,
      resourceCalendars: ctx.resourceCalendars ?? this._state.resourceCalendars,
      ...ctx,
    };
    const result = applyMutationOp(effectiveOp, this._state.events, enrichedCtx, opts);

    if (result.status === 'accepted' || result.status === 'accepted-with-warnings') {
      // Commit event changes and (if a pool was resolved with cursor advance)
      // the pool update in a single state swap — one _notify per mutation.
      const tx = beginTransaction(this._state.events);
      const commit = commitTransaction(tx, this._state.events, result.changes);
      let pools = this._state.pools;
      if (poolUpdate) {
        const map = new Map(pools);
        map.set(poolUpdate.id, poolUpdate);
        pools = map;
      }
      this._state = { ...this._state, events: commit.events, pools };
      this._notify();
      this._emitBookingLifecycle(result.changes, effectiveOp, ctx);
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
    this._rebuildAssignmentIndex();
    this._notify();
  }

  // ── Assignment CRUD ────────────────────────────────────────────────────────────

  /** Replace all assignments atomically. Notifies subscribers once. */
  setAssignments(assignments: ReadonlyArray<Assignment>): void {
    const map = new Map<string, Assignment>(assignments.map(a => [a.id, a]));
    this._state = { ...this._state, assignments: map };
    this._rebuildAssignmentIndex();
    this._notify();
  }

  /** Add or replace a single assignment. */
  upsertAssignment(assignment: Assignment): void {
    const existing = this._state.assignments.get(assignment.id);
    const map = new Map(this._state.assignments);
    map.set(assignment.id, assignment);
    this._state = { ...this._state, assignments: map };
    if (existing) this._removeFromAssignmentIndex(existing);
    this._addToAssignmentIndex(assignment);
    this._notify();
    // New-only: replacing units on an existing join isn't a new booking, so
    // skip the emit. Updating units is a resize-like event better modeled
    // by a future assignment.updated channel if ever needed.
    if (!existing && this._bus) {
      this._bus.emit('assignment.created', {
        assignment,
        at: new Date().toISOString(),
      });
    }
  }

  /** Remove a single assignment by id. No-op when not found. */
  removeAssignment(id: string): void {
    const existing = this._state.assignments.get(id);
    if (!existing) return;
    const map = new Map(this._state.assignments);
    map.delete(id);
    this._state = { ...this._state, assignments: map };
    this._removeFromAssignmentIndex(existing);
    this._notify();
    if (this._bus) {
      this._bus.emit('assignment.removed', {
        assignment: existing,
        at: new Date().toISOString(),
      });
    }
  }

  /**
   * Return all assignments for a given event. O(k) via the event index
   * (issue #221); k = number of resources assigned to the event.
   */
  getAssignmentsForEvent(eventId: string): Assignment[] {
    const ids = this._assignmentsByEvent.get(eventId);
    if (!ids) return [];
    const out: Assignment[] = [];
    for (const id of ids) {
      const a = this._state.assignments.get(id);
      if (a) out.push(a);
    }
    return out;
  }

  /**
   * Return all assignments for a given resource. O(k) via the resource
   * index (issue #221); k = number of events using the resource.
   */
  getAssignmentsForResource(resourceId: string): Assignment[] {
    const ids = this._assignmentsByResource.get(resourceId);
    if (!ids) return [];
    const out: Assignment[] = [];
    for (const id of ids) {
      const a = this._state.assignments.get(id);
      if (a) out.push(a);
    }
    return out;
  }

  /**
   * Indexed workload sum — total `units` across all assignments for the
   * resource. O(k) via the resource index. Equivalent to
   * `workloadForResource(state.assignments, id)` but avoids the full scan.
   */
  workloadForResource(resourceId: string): number {
    const ids = this._assignmentsByResource.get(resourceId);
    if (!ids) return 0;
    let total = 0;
    for (const id of ids) {
      const a = this._state.assignments.get(id);
      if (a) total += a.units;
    }
    return total;
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

  // ── Resource pool CRUD (issue #212) ──────────────────────────────────────────

  /** Replace all pools atomically. Notifies subscribers once. */
  setPools(pools: ReadonlyArray<ResourcePool>): void {
    const map = new Map<string, ResourcePool>(pools.map(p => [p.id, p]));
    this._state = { ...this._state, pools: map };
    this._notify();
  }

  /** Add or replace a single pool. */
  upsertPool(pool: ResourcePool): void {
    const map = new Map(this._state.pools);
    map.set(pool.id, pool);
    this._state = { ...this._state, pools: map };
    this._notify();
  }

  /** Remove a pool by id. No-op when not found. */
  removePool(id: string): void {
    if (!this._state.pools.has(id)) return;
    const map = new Map(this._state.pools);
    map.delete(id);
    this._state = { ...this._state, pools: map };
    this._notify();
  }

  /** Return the pool for the given id, or null if not registered. */
  getPool(id: string): ResourcePool | null {
    return this._state.pools.get(id) ?? null;
  }

  // ── Transaction helpers ───────────────────────────────────────────────────────

  /**
   * Snapshot the current events map for optimistic UI or undo/redo.
   * Use rollbackTo(handle) to restore this snapshot.
   */
  snapshot(label?: string): TransactionHandle {
    return beginTransaction(this._state.events, { pools: this._state.pools, label });
  }

  /** Restore state to a previous snapshot. Notifies subscribers. */
  rollbackTo(handle: TransactionHandle): void {
    const restored = rollbackTransaction(handle);
    this._state = {
      ...this._state,
      events: restored.events,
      ...(restored.pools ? { pools: restored.pools } : {}),
    };
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
    readonly pools?:             ReadonlyMap<string, ResourcePool>;
  }): void {
    this._state = {
      ...this._state,
      ...(snapshot.events            != null && { events:            snapshot.events }),
      ...(snapshot.assignments       != null && { assignments:       snapshot.assignments }),
      ...(snapshot.dependencies      != null && { dependencies:      snapshot.dependencies }),
      ...(snapshot.resourceCalendars != null && { resourceCalendars: snapshot.resourceCalendars }),
      ...(snapshot.pools             != null && { pools:             snapshot.pools }),
    };
    if (snapshot.assignments != null) this._rebuildAssignmentIndex();
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

  // ── Assignment index maintenance (issue #221) ─────────────────────────────

  private _rebuildAssignmentIndex(): void {
    this._assignmentsByResource = new Map();
    this._assignmentsByEvent    = new Map();
    for (const a of this._state.assignments.values()) {
      this._addToAssignmentIndex(a);
    }
  }

  private _addToAssignmentIndex(a: Assignment): void {
    let byR = this._assignmentsByResource.get(a.resourceId);
    if (!byR) { byR = new Set(); this._assignmentsByResource.set(a.resourceId, byR); }
    byR.add(a.id);

    let byE = this._assignmentsByEvent.get(a.eventId);
    if (!byE) { byE = new Set(); this._assignmentsByEvent.set(a.eventId, byE); }
    byE.add(a.id);
  }

  private _removeFromAssignmentIndex(a: Assignment): void {
    const byR = this._assignmentsByResource.get(a.resourceId);
    if (byR) {
      byR.delete(a.id);
      if (byR.size === 0) this._assignmentsByResource.delete(a.resourceId);
    }
    const byE = this._assignmentsByEvent.get(a.eventId);
    if (byE) {
      byE.delete(a.id);
      if (byE.size === 0) this._assignmentsByEvent.delete(a.eventId);
    }
  }

  // ── Booking lifecycle emit (issue #216) ───────────────────────────────────

  /**
   * Fan out booking.* lifecycle events from the EventChange[] produced by
   * applyMutation. Emits at most one channel per change:
   *   created → booking.requested
   *   deleted → booking.cancelled
   *   updated → channel derived from the approval stage transition
   *             (`null → requested`, `* → approved`, `* → finalized`,
   *             `* → denied`). Updates that don't flip the stage are
   *             silent — this is the behavior adapters want.
   */
  private _emitBookingLifecycle(
    changes: readonly EventChange[],
    op: EngineOperation,
    _ctx: OperationContext,
  ): void {
    if (!this._bus || changes.length === 0) return;
    const at = new Date().toISOString();
    const sourceActionId = `op:${op.type}`;

    for (const change of changes) {
      if (change.type === 'created') {
        const stage = readApprovalStage(change.event);
        const actor = stage ? latestActor(stage) : undefined;
        this._emitBooking('booking.requested', change.event, {
          at,
          sourceActionId,
          ...(actor !== undefined ? { actor } : {}),
        });
        continue;
      }
      if (change.type === 'deleted') {
        const stage = readApprovalStage(change.event);
        const actor = stage ? latestActor(stage) : undefined;
        this._emitBooking('booking.cancelled', change.event, {
          at,
          sourceActionId,
          ...(actor !== undefined ? { actor } : {}),
        });
        continue;
      }
      // change.type === 'updated'
      const beforeStage = readApprovalStage(change.before);
      const afterStage  = readApprovalStage(change.after);
      if (!afterStage) continue;
      const channel = channelForApprovalTransition(
        beforeStage?.stage ?? null,
        afterStage.stage,
      );
      if (!channel) continue;
      const reason = latestReason(afterStage);
      const actor  = latestActor(afterStage);
      this._emitBooking(channel, change.after, {
        at,
        sourceActionId,
        ...(actor  !== undefined ? { actor }  : {}),
        ...(reason !== undefined ? { reason } : {}),
      });
    }
  }

  private _emitBooking(
    channel: BookingChannel,
    event: EngineEvent,
    extras: Omit<BookingLifecyclePayload, 'eventId' | 'eventSnapshot'>,
  ): void {
    if (!this._bus) return;
    const payload: BookingLifecyclePayload = {
      eventId: event.id,
      eventSnapshot: event,
      ...extras,
    };
    this._bus.emit(channel, payload);
  }
}

// ─── Approval-stage helpers (module-local) ──────────────────────────────────

function readApprovalStage(ev: EngineEvent | undefined): ApprovalStage | null {
  if (!ev) return null;
  const stage = (ev.meta as Record<string, unknown> | undefined)?.approvalStage;
  if (!stage || typeof stage !== 'object') return null;
  const s = stage as ApprovalStage;
  return typeof s.stage === 'string' ? s : null;
}

function latestReason(stage: ApprovalStage): string | undefined {
  const last = stage.history?.[stage.history.length - 1];
  return last?.reason;
}

function latestActor(stage: ApprovalStage): string | undefined {
  const last = stage.history?.[stage.history.length - 1];
  return last?.actor;
}

/**
 * SyncManager — coordinates optimistic updates, adapter calls, and conflict
 * resolution for a set of calendar events.
 *
 * Usage pattern:
 *
 *   const manager = new SyncManager({
 *     adapter: new RestAdapter({ baseUrl: '/api/events' }),
 *     conflictResolution: 'server-wins',
 *     onError: (opId, err) => toast.error(err.message),
 *   });
 *
 *   const unsub = manager.subscribe(state => {
 *     setEvents([...state.events.values()]);
 *   });
 *
 *   await manager.loadRange(start, end);
 *   await manager.createEvent({ title: 'Standup', start, end });
 *
 * Optimistic update flow:
 *   1. Apply change locally (event map updated immediately)
 *   2. Enqueue the operation in SyncQueue (status → 'pending')
 *   3. Notify state listeners
 *   4. Call the adapter in the background
 *   5a. On success: mark 'synced', replace optimistic event with server response
 *   5b. On conflict: run conflict resolver, apply result, mark 'synced'
 *   5c. On error: mark 'error', notify onError, keep rollbackEvent for retry
 */

import type { CalendarAdapter } from '../adapters/CalendarAdapter';
import type { CalendarEventV1 }  from '../types';
import { SyncQueue }             from './SyncQueue';
import type { SyncStatus }       from './SyncQueue';
import {
  resolverFor,
  ConflictError,
} from './conflictStrategies';
import type { ConflictStrategy, ConflictResolver } from './conflictStrategies';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SyncManagerOptions {
  /** The adapter used to read/write events in the remote data source. */
  adapter: CalendarAdapter;

  /**
   * How to resolve adapter conflicts (server returns a newer version while an
   * operation is in-flight).
   *
   * Pass a named strategy string or a custom ConflictResolver function.
   * Default: 'server-wins'.
   */
  conflictResolution?: ConflictStrategy | ConflictResolver;

  /**
   * Called when a conflict is detected.  Required when `conflictResolution`
   * is 'manual'.
   *
   * Receives the local (optimistic) and server events; returns the resolved
   * event.  May be async (e.g. show a UI modal).
   */
  onConflict?: ConflictResolver;

  /**
   * Called after each failed adapter call.
   * @param opId   The operation id from SyncQueue.
   * @param err    The error thrown by the adapter.
   */
  onError?: (opId: string, err: Error) => void;

  /**
   * Maximum number of automatic retry attempts per operation before giving up.
   * Default: 3.  Set to 0 to disable automatic retries.
   */
  maxRetries?: number;

  /**
   * Delay in ms before each retry attempt, doubling after each failure
   * (exponential backoff).  Default: 1000 ms.
   */
  retryBaseDelay?: number;
}

/** Snapshot of sync state emitted to subscribers on every change. */
export interface SyncState {
  /** All currently known events, keyed by event id. */
  readonly events: ReadonlyMap<string, CalendarEventV1>;
  /** Per-event sync status. */
  readonly status: ReadonlyMap<string, SyncStatus>;
  /** Per-event error from the most recent failed operation. */
  readonly errors: ReadonlyMap<string, Error>;
  /** True if any operation is pending or in-flight. */
  readonly isSyncing: boolean;
  /** Count of unconfirmed operations. */
  readonly pendingCount: number;
}

/** Listener callback for SyncState changes. */
export type SyncStateListener = (state: SyncState) => void;

/** Call to unsubscribe from SyncState updates. */
export type SyncUnsubscribe = () => void;

// ─── SyncManager ─────────────────────────────────────────────────────────────

export class SyncManager {
  private readonly _adapter:       CalendarAdapter;
  private readonly _resolver:      ConflictResolver;
  private readonly _onConflict?:   ConflictResolver;
  private readonly _onError?:      (opId: string, err: Error) => void;
  private readonly _maxRetries:    number;
  private readonly _retryBaseDelay: number;

  private _events:      Map<string, CalendarEventV1> = new Map();
  private _queue:       SyncQueue = new SyncQueue();
  private _listeners:   Set<SyncStateListener> = new Set();
  private _adapterUnsub?: (() => void) | null = null;

  constructor(options: SyncManagerOptions) {
    this._adapter        = options.adapter;
    this._onConflict     = options.onConflict;
    this._onError        = options.onError;
    this._maxRetries     = options.maxRetries     ?? 3;
    this._retryBaseDelay = options.retryBaseDelay ?? 1_000;

    const raw = options.conflictResolution ?? 'server-wins';
    // If 'manual', wrap so the user-supplied onConflict callback is invoked.
    if (raw === 'manual') {
      this._resolver = this._manualResolver();
    } else {
      this._resolver = resolverFor(raw);
    }
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Load events for a date range from the adapter and replace the local map.
   * Non-destructive for events outside the requested range (they are left in place).
   *
   * @param signal Optional AbortSignal to cancel the request.
   */
  async loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<void> {
    const events = await this._adapter.loadRange(start, end, signal);
    for (const ev of events) {
      if (ev.id !== undefined) this._events.set(ev.id, ev);
    }
    this._queue.pruneCompleted();
    this._notify();
  }

  // ── Optimistic mutations ────────────────────────────────────────────────────

  /**
   * Optimistically create an event.
   *
   * Applies immediately to local state; sends to adapter in the background.
   * Returns the local (optimistic) version of the event.
   */
  async createEvent(event: CalendarEventV1): Promise<CalendarEventV1> {
    // Assign a temporary id if none provided.
    const tempId = event.id ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const local: CalendarEventV1 = { ...event, id: tempId };

    this._events.set(tempId, local);
    const opId = this._queue.enqueue('create', tempId, local, null);
    this._notify();

    this._dispatchCreate(opId, local, tempId);
    return local;
  }

  /**
   * Optimistically update an event.
   *
   * Merges `patch` into the local event immediately; sends to adapter in the
   * background.  Returns the merged (optimistic) event.
   */
  async updateEvent(id: string, patch: Partial<CalendarEventV1>): Promise<CalendarEventV1> {
    const rollback = this._events.get(id) ?? null;
    const local: CalendarEventV1 = rollback
      ? { ...rollback, ...patch, id }
      : { ...patch, id, title: patch.title ?? '', start: patch.start ?? new Date() };

    this._events.set(id, local);
    const opId = this._queue.enqueue('update', id, patch, rollback);
    this._notify();

    this._dispatchUpdate(opId, id, patch, local);
    return local;
  }

  /**
   * Optimistically delete an event.
   *
   * Removes the event from local state immediately; sends to adapter in the
   * background.  On adapter error the event is restored from the rollback snapshot.
   */
  async deleteEvent(id: string): Promise<void> {
    const rollback = this._events.get(id) ?? null;
    this._events.delete(id);
    const opId = this._queue.enqueue('delete', id, null, rollback);
    this._notify();

    this._dispatchDelete(opId, id, rollback);
  }

  // ── Subscribe ───────────────────────────────────────────────────────────────

  /**
   * Subscribe to SyncState changes.  Called synchronously on every local or
   * remote state update.
   */
  subscribe(listener: SyncStateListener): SyncUnsubscribe {
    this._listeners.add(listener);
    listener(this._snapshot());
    return () => this._listeners.delete(listener);
  }

  /**
   * Attach the adapter's live-update subscription (WebSocket, Realtime, polling).
   * Changes pushed by the adapter are merged into local state.
   *
   * Calling this again replaces the previous subscription.
   */
  connectLive(): void {
    this._adapterUnsub?.();
    this._adapterUnsub = this._adapter.subscribe?.((change) => {
      switch (change.type) {
        case 'reload':
          for (const ev of change.events) {
            if (ev.id !== undefined) this._events.set(ev.id, ev);
          }
          break;
        case 'insert':
        case 'update':
          if (change.event.id !== undefined) this._events.set(change.event.id, change.event);
          break;
        case 'delete':
          this._events.delete(change.id);
          break;
      }
      this._notify();
    }) ?? null;
  }

  /** Stop the adapter's live-update subscription. */
  disconnectLive(): void {
    this._adapterUnsub?.();
    this._adapterUnsub = null;
  }

  // ── Queue management ────────────────────────────────────────────────────────

  /** Per-event sync status derived from the queue. */
  statusFor(eventId: string): SyncStatus {
    return this._queue.statusFor(eventId);
  }

  /** Per-event error from the most recent failed operation. */
  errorFor(eventId: string): Error | undefined {
    return this._queue.errorFor(eventId);
  }

  /** Retry all failed operations. */
  retryFailed(): void {
    this._queue.retryAll();
    this._notify();

    for (const op of this._queue.pending) {
      switch (op.type) {
        case 'create':
          this._dispatchCreate(op.id, op.payload as CalendarEventV1, op.eventId);
          break;
        case 'update':
          this._dispatchUpdate(op.id, op.eventId, op.payload as Partial<CalendarEventV1>, this._events.get(op.eventId)!);
          break;
        case 'delete':
          this._dispatchDelete(op.id, op.eventId, op.rollbackEvent);
          break;
      }
    }
  }

  /** Drop all error-state operations without retrying. */
  clearErrors(): void {
    for (const op of this._queue.failed) {
      this._queue.remove(op.id);
    }
    this._notify();
  }

  /** All events currently tracked by this manager. */
  get events(): ReadonlyMap<string, CalendarEventV1> {
    return this._events;
  }

  /** The underlying SyncQueue (for advanced inspection). */
  get queue(): SyncQueue {
    return this._queue;
  }

  // ── Private: background dispatch ────────────────────────────────────────────

  private _dispatchCreate(opId: string, local: CalendarEventV1, tempId: string): void {
    if (!this._adapter.createEvent) {
      // Adapter is read-only — mark as synced immediately
      this._queue.markSynced(opId);
      this._notify();
      return;
    }
    this._queue.markSyncing(opId);
    this._notify();

    this._adapter.createEvent(local)
      .then(server => {
        // Replace temp id with server-assigned id
        this._events.delete(tempId);
        if (server.id !== undefined) this._events.set(server.id, server);
        else this._events.set(tempId, server);
        this._queue.markSynced(opId);
        this._queue.pruneCompleted();
        this._notify();
      })
      .catch(err => this._handleError(opId, err, 'create', local, tempId));
  }

  private _dispatchUpdate(
    opId: string,
    id: string,
    patch: Partial<CalendarEventV1>,
    _local: CalendarEventV1,
  ): void {
    if (!this._adapter.updateEvent) {
      this._queue.markSynced(opId);
      this._notify();
      return;
    }
    this._queue.markSyncing(opId);
    this._notify();

    this._adapter.updateEvent(id, patch)
      .then(async server => {
        const current = this._events.get(id);
        if (current && this._isConflict(current, server)) {
          const resolved = await Promise.resolve(this._resolver(current, server));
          this._events.set(id, resolved);
        } else {
          this._events.set(id, server);
        }
        this._queue.markSynced(opId);
        this._queue.pruneCompleted();
        this._notify();
      })
      .catch(err => this._handleError(opId, err, 'update', patch, id));
  }

  private _dispatchDelete(
    opId: string,
    id: string,
    rollback: CalendarEventV1 | null,
  ): void {
    if (!this._adapter.deleteEvent) {
      this._queue.markSynced(opId);
      this._notify();
      return;
    }
    this._queue.markSyncing(opId);
    this._notify();

    this._adapter.deleteEvent(id)
      .then(() => {
        this._queue.markSynced(opId);
        this._queue.pruneCompleted();
        this._notify();
      })
      .catch(err => this._handleError(opId, err, 'delete', null, id, rollback));
  }

  // ── Private: error handling + retry ────────────────────────────────────────

  private _handleError(
    opId: string,
    err: unknown,
    type: 'create' | 'update' | 'delete',
    _payload: unknown,
    id: string,
    rollback?: CalendarEventV1 | null,
  ): void {
    const error = err instanceof Error ? err : new Error(String(err));
    const op = this._queue.all.find(o => o.id === opId);
    if (!op) return;

    // Rollback optimistic change on delete failure
    if (type === 'delete' && rollback) {
      this._events.set(id, rollback);
    }

    const retryable = this._maxRetries > 0 && op.retryCount < this._maxRetries;

    if (retryable) {
      this._queue.markError(opId, error);
      this._notify();
      const delay = this._retryBaseDelay * Math.pow(2, op.retryCount);
      setTimeout(() => {
        this._queue.retry(opId);
        this._notify();
        const refreshed = this._queue.all.find(o => o.id === opId);
        if (!refreshed) return;
        switch (refreshed.type) {
          case 'create':
            this._dispatchCreate(opId, refreshed.payload as CalendarEventV1, id);
            break;
          case 'update':
            this._dispatchUpdate(opId, id, refreshed.payload as Partial<CalendarEventV1>, this._events.get(id)!);
            break;
          case 'delete':
            this._dispatchDelete(opId, id, refreshed.rollbackEvent);
            break;
        }
      }, delay);
    } else {
      this._queue.markError(opId, error);
      this._onError?.(opId, error);
      this._notify();
    }
  }

  // ── Private: conflict detection ─────────────────────────────────────────────

  /**
   * A conflict exists when the server event's version is strictly greater than
   * the local version, indicating the server has data we haven't seen yet.
   */
  private _isConflict(local: CalendarEventV1, server: CalendarEventV1): boolean {
    const localV  = local.sync?.version;
    const serverV = server.sync?.version;
    if (localV === undefined || serverV === undefined) return false;
    return serverV > localV;
  }

  // ── Private: manual resolver builder ───────────────────────────────────────

  private _manualResolver(): ConflictResolver {
    return async (local, server) => {
      if (this._onConflict) {
        return this._onConflict(local, server);
      }
      throw new ConflictError(
        'SyncManager: conflictResolution is "manual" but no onConflict callback was provided.',
        local,
        server,
      );
    };
  }

  // ── Private: notifications ──────────────────────────────────────────────────

  private _snapshot(): SyncState {
    const status = new Map<string, SyncStatus>();
    const errors = new Map<string, Error>();

    for (const [id] of this._events) {
      const s = this._queue.statusFor(id);
      if (s !== 'idle') status.set(id, s);
      const e = this._queue.errorFor(id);
      if (e) errors.set(id, e);
    }

    return {
      events:       this._events,
      status,
      errors,
      isSyncing:    this._queue.isSyncing,
      pendingCount: this._queue.pendingCount,
    };
  }

  private _notify(): void {
    const snap = this._snapshot();
    for (const cb of this._listeners) cb(snap);
  }
}

/** SyncManager patched for strict-null safety on retry paths */

import type { CalendarAdapter } from '../adapters/CalendarAdapter';
import type { CalendarEventV1 }  from '../types';
import { SyncQueue }             from './SyncQueue';
import type { SyncStatus }       from './SyncQueue';
import { resolverFor, ConflictError } from './conflictStrategies';
import type { ConflictStrategy, ConflictResolver } from './conflictStrategies';

export interface SyncManagerOptions {
  adapter: CalendarAdapter;
  conflictResolution?: ConflictStrategy | ConflictResolver;
  onConflict?: ConflictResolver;
  onError?: (opId: string, err: Error) => void;
  maxRetries?: number;
  retryBaseDelay?: number;
}

export interface SyncState {
  readonly events: ReadonlyMap<string, CalendarEventV1>;
  readonly status: ReadonlyMap<string, SyncStatus>;
  readonly errors: ReadonlyMap<string, Error>;
  readonly isSyncing: boolean;
  readonly pendingCount: number;
}

export type SyncStateListener = (state: SyncState) => void;
export type SyncUnsubscribe = () => void;

export class SyncManager {
  private readonly _adapter: CalendarAdapter;
  private readonly _resolver: ConflictResolver;
  private readonly _onConflict?: ConflictResolver;
  private readonly _onError?: (opId: string, err: Error) => void;
  private readonly _maxRetries: number;
  private readonly _retryBaseDelay: number;

  private _events = new Map<string, CalendarEventV1>();
  private _queue = new SyncQueue();
  private _listeners = new Set<SyncStateListener>();
  private _adapterUnsub?: (() => void) | null = null;

  constructor(options: SyncManagerOptions) {
    this._adapter = options.adapter;
    this._onConflict = options.onConflict;
    this._onError = options.onError;
    this._maxRetries = options.maxRetries ?? 3;
    this._retryBaseDelay = options.retryBaseDelay ?? 1000;

    const raw = options.conflictResolution ?? 'server-wins';
    this._resolver = raw === 'manual' ? this._manualResolver() : resolverFor(raw);
  }

  async loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<void> {
    const events = await this._adapter.loadRange(start, end, signal);
    for (const ev of events) {
      if (ev.id !== undefined) this._events.set(ev.id, ev);
    }
    this._queue.pruneCompleted();
    this._notify();
  }

  async createEvent(event: CalendarEventV1): Promise<CalendarEventV1> {
    const tempId = event.id ?? `tmp-${Date.now()}`;
    const local = { ...event, id: tempId };
    this._events.set(tempId, local);
    const opId = this._queue.enqueue('create', tempId, local, null);
    this._notify();
    this._dispatchCreate(opId, local, tempId);
    return local;
  }

  async updateEvent(id: string, patch: Partial<CalendarEventV1>): Promise<CalendarEventV1> {
    const rollback = this._events.get(id) ?? null;
    const local = rollback ? { ...rollback, ...patch, id } : { ...patch, id, title: patch.title ?? '', start: patch.start ?? new Date() };
    this._events.set(id, local);
    const opId = this._queue.enqueue('update', id, patch, rollback);
    this._notify();
    this._dispatchUpdate(opId, id, patch, local);
    return local;
  }

  async deleteEvent(id: string): Promise<void> {
    const rollback = this._events.get(id) ?? null;
    this._events.delete(id);
    const opId = this._queue.enqueue('delete', id, null, rollback);
    this._notify();
    this._dispatchDelete(opId, id, rollback);
  }

  subscribe(listener: SyncStateListener): SyncUnsubscribe {
    this._listeners.add(listener);
    listener(this._snapshot());
    return () => this._listeners.delete(listener);
  }

  retryFailed(): void {
    this._queue.retryAll();
    this._notify();
    for (const op of this._queue.pending) {
      if (op.type === 'update') {
        this._dispatchQueuedUpdate(op.id, op.eventId, op.payload as Partial<CalendarEventV1>);
      }
    }
  }

  get events(): ReadonlyMap<string, CalendarEventV1> {
    return this._events;
  }

  get queue(): SyncQueue {
    return this._queue;
  }

  private _dispatchCreate(opId: string, local: CalendarEventV1, tempId: string): void {
    if (!this._adapter.createEvent) {
      this._queue.markSynced(opId);
      this._notify();
      return;
    }
    this._adapter.createEvent(local)
      .then(server => {
        this._events.delete(tempId);
        this._events.set(server.id ?? tempId, server);
        this._queue.markSynced(opId);
        this._notify();
      })
      .catch(err => this._handleError(opId, err));
  }

  private _dispatchUpdate(opId: string, id: string, patch: Partial<CalendarEventV1>, _local: CalendarEventV1): void {
    if (!this._adapter.updateEvent) {
      this._queue.markSynced(opId);
      this._notify();
      return;
    }
    this._adapter.updateEvent(id, patch)
      .then(server => {
        this._events.set(id, server);
        this._queue.markSynced(opId);
        this._notify();
      })
      .catch(err => this._handleError(opId, err));
  }

  private _dispatchQueuedUpdate(opId: string, id: string, patch: Partial<CalendarEventV1>): void {
    const current = this._events.get(id);
    if (!current) {
      this._queue.markError(opId, new Error(`missing local event: ${id}`));
      this._notify();
      return;
    }
    this._dispatchUpdate(opId, id, patch, current);
  }

  private _dispatchDelete(opId: string, id: string, rollback: CalendarEventV1 | null): void {
    if (!this._adapter.deleteEvent) {
      this._queue.markSynced(opId);
      this._notify();
      return;
    }
    this._adapter.deleteEvent(id)
      .then(() => {
        this._queue.markSynced(opId);
        this._notify();
      })
      .catch(err => this._handleError(opId, err));
  }

  private _handleError(opId: string, err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this._queue.markError(opId, error);
    this._onError?.(opId, error);
    this._notify();
  }

  private _manualResolver(): ConflictResolver {
    return async (local, server) => {
      if (this._onConflict) return this._onConflict(local, server);
      throw new ConflictError('manual conflict without handler', local, server);
    };
  }

  private _snapshot(): SyncState {
    return {
      events: this._events,
      status: new Map(),
      errors: new Map(),
      isSyncing: this._queue.isSyncing,
      pendingCount: this._queue.pendingCount,
    };
  }

  private _notify(): void {
    const snap = this._snapshot();
    for (const cb of this._listeners) cb(snap);
  }
}

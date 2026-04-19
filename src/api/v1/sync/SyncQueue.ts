/**
 * SyncQueue — ordered queue of pending sync operations with status tracking.
 *
 * Each operation records the pre-change event snapshot so it can be rolled
 * back if the adapter rejects the request.
 */

import type { CalendarEventV1 } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncStatus =
  | 'idle'       // event has no pending operations
  | 'pending'    // operation queued, not yet sent
  | 'syncing'    // request in-flight
  | 'synced'     // last operation confirmed by the adapter
  | 'conflict'   // server returned a conflicting version
  | 'error';     // adapter rejected or threw

export interface QueuedOperation {
  /** Unique operation id (for deduplication and logging). */
  readonly id: string;
  readonly type: 'create' | 'update' | 'delete';
  readonly eventId: string;
  /** The data to send to the adapter.  null for delete operations. */
  readonly payload: CalendarEventV1 | Partial<CalendarEventV1> | null;
  /** The event state BEFORE the optimistic change, for rollback. */
  readonly rollbackEvent: CalendarEventV1 | null;
  status: SyncStatus;
  error?: Error;
  retryCount: number;
  readonly enqueuedAt: Date;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export class SyncQueue {
  private _ops: QueuedOperation[] = [];
  private _idCounter = 0;

  /** Enqueue a new operation.  Returns the generated operation id. */
  enqueue(
    type: QueuedOperation['type'],
    eventId: string,
    payload: QueuedOperation['payload'],
    rollbackEvent: CalendarEventV1 | null,
  ): string {
    const id = `sqop-${++this._idCounter}-${Date.now()}`;
    this._ops.push({
      id,
      type,
      eventId,
      payload,
      rollbackEvent,
      status: 'pending',
      retryCount: 0,
      enqueuedAt: new Date(),
    });
    return id;
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  /** All operations, in enqueue order. */
  get all(): readonly QueuedOperation[] { return this._ops; }

  /** Operations that are pending or have encountered an error (eligible for sending). */
  get pending(): QueuedOperation[] {
    return this._ops.filter(op => op.status === 'pending');
  }

  /** Operations currently in-flight. */
  get syncing(): QueuedOperation[] {
    return this._ops.filter(op => op.status === 'syncing');
  }

  /** Operations that have failed and may be retried. */
  get failed(): QueuedOperation[] {
    return this._ops.filter(op => op.status === 'error');
  }

  /** Count of operations not yet confirmed. */
  get pendingCount(): number {
    return this._ops.filter(op => op.status === 'pending' || op.status === 'syncing').length;
  }

  /** True if any operation is pending or in-flight. */
  get isSyncing(): boolean { return this.pendingCount > 0; }

  /** Return the most recent operation for a given eventId, or undefined. */
  forEvent(eventId: string): QueuedOperation | undefined {
    // Search in reverse so we get the most recent
    for (let i = this._ops.length - 1; i >= 0; i--) {
      if (this._ops[i].eventId === eventId) return this._ops[i];
    }
    return undefined;
  }

  /** Return the sync status for a given eventId. */
  statusFor(eventId: string): SyncStatus {
    const op = this.forEvent(eventId);
    return op?.status ?? 'idle';
  }

  /** Return the error for a given eventId (if any). */
  errorFor(eventId: string): Error | undefined {
    const op = this.forEvent(eventId);
    return op?.status === 'error' ? op.error : undefined;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  markSyncing(opId: string): void  { this._mutate(opId, op => { op.status = 'syncing'; }); }
  markSynced(opId: string): void   { this._mutate(opId, op => { op.status = 'synced';  }); }
  markConflict(opId: string): void { this._mutate(opId, op => { op.status = 'conflict'; }); }

  markError(opId: string, err: Error): void {
    this._mutate(opId, op => {
      op.status = 'error';
      op.error  = err;
      op.retryCount++;
    });
  }

  /** Re-queue a failed operation for retry. */
  retry(opId: string): void {
    this._mutate(opId, op => {
      if (op.status === 'error') op.status = 'pending';
    });
  }

  /** Re-queue ALL failed operations. */
  retryAll(): void {
    for (const op of this._ops) {
      if (op.status === 'error') op.status = 'pending';
    }
  }

  /** Remove a single operation by id. */
  remove(opId: string): void {
    this._ops = this._ops.filter(op => op.id !== opId);
  }

  /** Remove all completed (synced) operations. */
  pruneCompleted(): void {
    this._ops = this._ops.filter(op => op.status !== 'synced');
  }

  /** Drop all operations for a given eventId (e.g. after a full reload). */
  cancelForEvent(eventId: string): void {
    this._ops = this._ops.filter(op => op.eventId !== eventId);
  }

  /** Clear all operations. */
  clear(): void { this._ops = []; }

  // ── Private ────────────────────────────────────────────────────────────────

  private _mutate(opId: string, updater: (op: QueuedOperation) => void): void {
    const op = this._ops.find(o => o.id === opId);
    if (op) updater(op);
  }
}

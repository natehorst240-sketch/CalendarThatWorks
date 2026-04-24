// @vitest-environment node
/**
 * API v1 — Phase 3 sync infrastructure tests.
 *
 * Tests:
 *   SyncQueue          — enqueue, status mutations, retry, prune
 *   conflictStrategies — clientWins, serverWins, latestWins, manual, resolverFor
 *   SyncManager        — optimistic create/update/delete, adapter calls,
 *                        error handling + rollback, conflict resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncQueue }           from '../sync/SyncQueue';
import {
  clientWins,
  serverWins,
  latestWins,
  manualResolve,
  resolverFor,
  ConflictError,
} from '../sync/conflictStrategies';
import { SyncManager }         from '../sync/SyncManager';
import type { CalendarAdapter } from '../adapters/CalendarAdapter';
import type { CalendarEventV1 } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const S = new Date('2026-04-10T09:00:00Z');
const E = new Date('2026-04-10T10:00:00Z');

function ev(overrides: Partial<CalendarEventV1> = {}): CalendarEventV1 {
  return { id: 'ev-1', title: 'Meeting', start: S, end: E, ...overrides };
}

function makeAdapter(overrides: Partial<CalendarAdapter> = {}): CalendarAdapter {
  return {
    loadRange:   vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockImplementation(async (e: CalendarEventV1) => ({ ...e, id: 'server-1' })),
    updateEvent: vi.fn().mockImplementation(async (_id: string, patch: Partial<CalendarEventV1>) => ({ ...ev(), ...patch })),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    subscribe:   vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

/** Flush all pending microtasks. */
const flushPromises = () => new Promise<void>(resolve => setTimeout(resolve, 0));

// ─── SyncQueue ────────────────────────────────────────────────────────────────

describe('SyncQueue', () => {
  let q: SyncQueue;
  beforeEach(() => { q = new SyncQueue(); });

  it('enqueues operations with incrementing ids', () => {
    const id1 = q.enqueue('create', 'ev-1', ev(), null);
    const id2 = q.enqueue('update', 'ev-2', {}, ev());
    expect(id1).toMatch(/^sqop-1-/);
    expect(id2).toMatch(/^sqop-2-/);
    expect(q.all.length).toBe(2);
  });

  it('starts operations as pending', () => {
    const opId = q.enqueue('create', 'ev-1', ev(), null);
    expect(q.statusFor('ev-1')).toBe('pending');
    expect(q.pending.length).toBe(1);
    expect(q.isSyncing).toBe(true);
    expect(q.pendingCount).toBe(1);

    const op = q.all.find(o => o.id === opId)!;
    expect(op.retryCount).toBe(0);
    expect(op.enqueuedAt).toBeInstanceOf(Date);
  });

  it('markSyncing transitions to syncing', () => {
    const opId = q.enqueue('create', 'ev-1', ev(), null);
    q.markSyncing(opId);
    expect(q.statusFor('ev-1')).toBe('syncing');
    expect(q.syncing.length).toBe(1);
    expect(q.isSyncing).toBe(true); // syncing still counts
  });

  it('markSynced transitions to synced', () => {
    const opId = q.enqueue('create', 'ev-1', ev(), null);
    q.markSyncing(opId);
    q.markSynced(opId);
    expect(q.statusFor('ev-1')).toBe('synced');
    expect(q.pendingCount).toBe(0);
    expect(q.isSyncing).toBe(false);
  });

  it('markError increments retryCount', () => {
    const opId = q.enqueue('create', 'ev-1', ev(), null);
    const err = new Error('network error');
    q.markError(opId, err);
    expect(q.statusFor('ev-1')).toBe('error');
    expect(q.errorFor('ev-1')).toBe(err);
    expect(q.failed.length).toBe(1);
    const op = q.all.find(o => o.id === opId)!;
    expect(op.retryCount).toBe(1);
  });

  it('markConflict transitions to conflict', () => {
    const opId = q.enqueue('update', 'ev-1', {}, ev());
    q.markConflict(opId);
    expect(q.statusFor('ev-1')).toBe('conflict');
  });

  it('retry re-queues failed operation', () => {
    const opId = q.enqueue('create', 'ev-1', ev(), null);
    q.markError(opId, new Error('fail'));
    expect(q.statusFor('ev-1')).toBe('error');
    q.retry(opId);
    expect(q.statusFor('ev-1')).toBe('pending');
  });

  it('retryAll re-queues all failed operations', () => {
    const id1 = q.enqueue('create', 'ev-1', ev(), null);
    const id2 = q.enqueue('create', 'ev-2', ev({ id: 'ev-2' }), null);
    q.markError(id1, new Error('fail'));
    q.markError(id2, new Error('fail'));
    q.retryAll();
    expect(q.statusFor('ev-1')).toBe('pending');
    expect(q.statusFor('ev-2')).toBe('pending');
  });

  it('pruneCompleted removes synced operations', () => {
    const opId = q.enqueue('create', 'ev-1', ev(), null);
    q.markSynced(opId);
    expect(q.all.length).toBe(1);
    q.pruneCompleted();
    expect(q.all.length).toBe(0);
  });

  it('remove removes a specific operation by id', () => {
    const id1 = q.enqueue('create', 'ev-1', ev(), null);
    const id2 = q.enqueue('create', 'ev-2', ev({ id: 'ev-2' }), null);
    q.remove(id1);
    expect(q.all.length).toBe(1);
    expect(q.all[0].id!).toBe(id2);
  });

  it('cancelForEvent removes all operations for an event', () => {
    q.enqueue('create', 'ev-1', ev(), null);
    q.enqueue('update', 'ev-1', {}, ev());
    q.enqueue('create', 'ev-2', ev({ id: 'ev-2' }), null);
    q.cancelForEvent('ev-1');
    expect(q.all.every(op => op.eventId !== 'ev-1')).toBe(true);
    expect(q.all.length).toBe(1);
  });

  it('clear removes everything', () => {
    q.enqueue('create', 'ev-1', ev(), null);
    q.enqueue('create', 'ev-2', ev({ id: 'ev-2' }), null);
    q.clear();
    expect(q.all.length).toBe(0);
    expect(q.isSyncing).toBe(false);
  });

  it('forEvent returns the most recent operation', () => {
    q.enqueue('create', 'ev-1', ev(), null);
    const id2 = q.enqueue('update', 'ev-1', { title: 'Updated' }, ev());
    const op = q.forEvent('ev-1');
    expect(op?.id).toBe(id2);
  });

  it('statusFor returns idle when no operations exist', () => {
    expect(q.statusFor('nonexistent')).toBe('idle');
  });
});

// ─── conflictStrategies ───────────────────────────────────────────────────────

describe('conflictStrategies', () => {
  const local  = ev({ title: 'Local',  sync: { externalId: 'x', syncSource: 's', version: 2 } });
  const server = ev({ title: 'Server', sync: { externalId: 'x', syncSource: 's', version: 3 } });

  it('clientWins returns local event', () => {
    expect(clientWins(local, server)).toBe(local);
  });

  it('serverWins returns server event', () => {
    expect(serverWins(local, server)).toBe(server);
  });

  describe('latestWins', () => {
    it('returns server when server has a later updatedAt', () => {
      const l = ev({ sync: { externalId: 'x', syncSource: 's', updatedAt: new Date('2026-01-01') } });
      const s = ev({ sync: { externalId: 'x', syncSource: 's', updatedAt: new Date('2026-01-02') } });
      expect(latestWins(l, s)).toBe(s);
    });

    it('returns local when local has a later updatedAt', () => {
      const l = ev({ sync: { externalId: 'x', syncSource: 's', updatedAt: new Date('2026-01-03') } });
      const s = ev({ sync: { externalId: 'x', syncSource: 's', updatedAt: new Date('2026-01-02') } });
      expect(latestWins(l, s)).toBe(l);
    });

    it('falls back to lastSyncedAt when updatedAt is absent', () => {
      const l = ev({ sync: { externalId: 'x', syncSource: 's', lastSyncedAt: new Date('2026-01-01') } });
      const s = ev({ sync: { externalId: 'x', syncSource: 's', lastSyncedAt: new Date('2026-01-02') } });
      expect(latestWins(l, s)).toBe(s);
    });

    it('falls back to server when neither has a timestamp', () => {
      const l = ev({ sync: undefined });
      const s = ev({ sync: undefined });
      expect(latestWins(l, s)).toBe(s);
    });
  });

  it('manualResolve throws ConflictError', () => {
    expect(() => manualResolve(local, server)).toThrowError(ConflictError);
  });

  describe('resolverFor', () => {
    it('resolves named strategies', () => {
      expect(resolverFor('client-wins')).toBe(clientWins);
      expect(resolverFor('server-wins')).toBe(serverWins);
      expect(resolverFor('latest-wins')).toBe(latestWins);
      expect(resolverFor('manual')).toBe(manualResolve);
    });

    it('passes through custom resolver functions', () => {
      const custom = vi.fn().mockReturnValue(local);
      expect(resolverFor(custom)).toBe(custom);
    });
  });

  it('ConflictError exposes local and server properties', () => {
    const err = new ConflictError('msg', local, server);
    expect(err.name).toBe('ConflictError');
    expect(err.local).toBe(local);
    expect(err.server).toBe(server);
    expect(err instanceof Error).toBe(true);
  });
});

// ─── SyncManager ─────────────────────────────────────────────────────────────

describe('SyncManager', () => {
  let adapter: ReturnType<typeof makeAdapter>;
  let manager: SyncManager;

  beforeEach(() => {
    adapter = makeAdapter();
    manager = new SyncManager({ adapter, maxRetries: 0 });
  });

  // ── loadRange ───────────────────────────────────────────────────────────────

  it('loadRange populates the event map', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    await manager.loadRange(S, E);
    expect(manager.events.get('ev-1')).toMatchObject({ title: 'Meeting' });
    expect(adapter.loadRange).toHaveBeenCalledWith(S, E, undefined);
  });

  it('loadRange passes through AbortSignal', async () => {
    const ctrl = new AbortController();
    await manager.loadRange(S, E, ctrl.signal);
    expect(adapter.loadRange).toHaveBeenCalledWith(S, E, ctrl.signal);
  });

  // ── createEvent ─────────────────────────────────────────────────────────────

  it('createEvent applies optimistically before adapter call', async () => {
    let snapshotDuringCreate: string | undefined;
    manager.subscribe(state => {
      if (state.pendingCount > 0 && !snapshotDuringCreate) {
        snapshotDuringCreate = [...state.events.values()][0]?.title;
      }
    });

    const promise = manager.createEvent(ev({ id: undefined, title: 'New Event' }));
    // Immediately (before adapter resolves), optimistic event is in map
    const tempIds = [...manager.events.keys()];
    expect(tempIds.length).toBe(1);
    const firstTempId = tempIds[0];
    expect(firstTempId).toBeDefined();
    expect(manager.events.get(firstTempId!)?.title).toBe('New Event');

    await promise;
  });

  it('createEvent replaces temp id with server id', async () => {
    vi.mocked(adapter.createEvent!).mockResolvedValue({ ...ev(), id: 'server-1', title: 'Meeting' });
    await manager.createEvent(ev({ id: undefined }));
    await Promise.resolve(); // flush microtasks
    expect(manager.events.has('server-1')).toBe(true);
  });

  it('createEvent marks status synced after success', async () => {
    vi.mocked(adapter.createEvent!).mockResolvedValue({ ...ev(), id: 'server-1' });
    await manager.createEvent(ev({ id: undefined }));
    await Promise.resolve();
    expect(manager.queue.isSyncing).toBe(false);
  });

  it('createEvent with no adapter.createEvent marks synced immediately', async () => {
    const readOnlyAdapter = makeAdapter({});
    (readOnlyAdapter as unknown as { createEvent?: unknown }).createEvent = undefined;
    const m = new SyncManager({ adapter: readOnlyAdapter });
    await m.createEvent(ev());
    expect(m.queue.pendingCount).toBe(0);
  });

  // ── updateEvent ─────────────────────────────────────────────────────────────

  it('updateEvent applies patch immediately', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    await manager.loadRange(S, E);

    const promise = manager.updateEvent('ev-1', { title: 'Updated' });
    expect(manager.events.get('ev-1')?.title).toBe('Updated');
    await promise;
  });

  it('updateEvent sends patch to adapter', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    await manager.loadRange(S, E);

    await manager.updateEvent('ev-1', { title: 'Updated' });
    await Promise.resolve();
    expect(adapter.updateEvent).toHaveBeenCalledWith('ev-1', { title: 'Updated' });
  });

  it('updateEvent merges server response into local map', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    vi.mocked(adapter.updateEvent!).mockResolvedValue(ev({ title: 'Server Title' }));
    await manager.loadRange(S, E);
    await manager.updateEvent('ev-1', { title: 'Local Title' });
    await Promise.resolve();
    expect(manager.events.get('ev-1')?.title).toBe('Server Title');
  });

  // ── deleteEvent ─────────────────────────────────────────────────────────────

  it('deleteEvent removes event from local map immediately', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    await manager.loadRange(S, E);

    manager.deleteEvent('ev-1');
    expect(manager.events.has('ev-1')).toBe(false);
  });

  it('deleteEvent calls adapter.deleteEvent', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    await manager.loadRange(S, E);
    await manager.deleteEvent('ev-1');
    await Promise.resolve();
    expect(adapter.deleteEvent).toHaveBeenCalledWith('ev-1');
  });

  it('deleteEvent rollbacks on adapter error', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    vi.mocked(adapter.deleteEvent!).mockRejectedValue(new Error('server error'));
    await manager.loadRange(S, E);
    await manager.deleteEvent('ev-1');
    await Promise.resolve();
    // Event should be restored
    expect(manager.events.has('ev-1')).toBe(true);
  });

  // ── subscribe ───────────────────────────────────────────────────────────────

  it('subscribe fires immediately with current state', () => {
    const listener = vi.fn();
    const unsub = manager.subscribe(listener);
    expect(listener).toHaveBeenCalledOnce();
    unsub();
  });

  it('subscribe fires on state change', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    const states: number[] = [];
    const unsub = manager.subscribe(s => states.push(s.events.size));
    await manager.loadRange(S, E);
    unsub();
    expect(states).toContain(1);
  });

  it('unsubscribe stops notifications', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    const listener = vi.fn();
    const unsub = manager.subscribe(listener);
    unsub();
    await manager.loadRange(S, E);
    // Only the initial call, not the loadRange update
    expect(listener).toHaveBeenCalledOnce();
  });

  // ── error handling ──────────────────────────────────────────────────────────

  it('onError is called after max retries exceeded', async () => {
    const onError = vi.fn();
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    vi.mocked(adapter.updateEvent!).mockRejectedValue(new Error('network'));
    const m = new SyncManager({ adapter, maxRetries: 0, onError });

    await m.loadRange(S, E);
    await m.updateEvent('ev-1', { title: 'Oops' });
    await Promise.resolve();

    expect(onError).toHaveBeenCalledOnce();
    const [opId, err] = onError.mock.calls[0];
    expect(typeof opId).toBe('string');
    expect(err.message).toBe('network');
  });

  it('clearErrors removes error operations from queue', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    vi.mocked(adapter.updateEvent!).mockRejectedValue(new Error('fail'));
    const m = new SyncManager({ adapter, maxRetries: 0 });

    await m.loadRange(S, E);
    await m.updateEvent('ev-1', {});
    await Promise.resolve();

    expect(m.queue.failed.length).toBeGreaterThan(0);
    m.clearErrors();
    expect(m.queue.failed.length).toBe(0);
  });

  // ── conflict resolution ─────────────────────────────────────────────────────

  it('server-wins resolves conflicts by accepting server event', async () => {
    const localEv  = ev({ sync: { externalId: 'x', syncSource: 's', version: 1 } });
    const serverEv = ev({ title: 'Server', sync: { externalId: 'x', syncSource: 's', version: 2 } });

    vi.mocked(adapter.loadRange).mockResolvedValue([localEv]);
    vi.mocked(adapter.updateEvent!).mockResolvedValue(serverEv);

    const m = new SyncManager({ adapter, conflictResolution: 'server-wins' });
    await m.loadRange(S, E);
    await m.updateEvent('ev-1', { title: 'Local Change' });
    await Promise.resolve();

    expect(m.events.get('ev-1')?.title).toBe('Server');
  });

  it('client-wins resolves conflicts by keeping local event', async () => {
    const localEv  = ev({ sync: { externalId: 'x', syncSource: 's', version: 1 } });
    const serverEv = ev({ title: 'Server', sync: { externalId: 'x', syncSource: 's', version: 2 } });

    vi.mocked(adapter.loadRange).mockResolvedValue([localEv]);
    vi.mocked(adapter.updateEvent!).mockResolvedValue(serverEv);

    const m = new SyncManager({ adapter, conflictResolution: 'client-wins' });
    await m.loadRange(S, E);
    await m.updateEvent('ev-1', { title: 'My Change' });
    await Promise.resolve();

    // client-wins: keep our optimistic change, not the server title
    expect(m.events.get('ev-1')?.title).toBe('My Change');
  });

  it('manual conflict resolution invokes onConflict callback', async () => {
    const localEv  = ev({ sync: { externalId: 'x', syncSource: 's', version: 1 } });
    const serverEv = ev({ title: 'Server', sync: { externalId: 'x', syncSource: 's', version: 2 } });
    const merged   = ev({ title: 'Merged' });

    vi.mocked(adapter.loadRange).mockResolvedValue([localEv]);
    vi.mocked(adapter.updateEvent!).mockResolvedValue(serverEv);

    const onConflict = vi.fn().mockResolvedValue(merged);
    const m = new SyncManager({ adapter, conflictResolution: 'manual', onConflict });
    await m.loadRange(S, E);
    await m.updateEvent('ev-1', { title: 'Local Change' });
    await Promise.resolve();
    await Promise.resolve(); // extra tick for async resolver

    await flushPromises();

    expect(onConflict).toHaveBeenCalled();
    expect(m.events.get('ev-1')?.title).toBe('Merged');
  });

  // ── statusFor / errorFor ────────────────────────────────────────────────────

  it('statusFor returns idle for unknown events', () => {
    expect(manager.statusFor('nonexistent')).toBe('idle');
  });

  it('errorFor returns undefined for events without errors', () => {
    expect(manager.errorFor('ev-1')).toBeUndefined();
  });

  // ── connectLive ─────────────────────────────────────────────────────────────

  it('connectLive merges insert change into events', () => {
    let pushChange: ((c: import('../adapters/CalendarAdapter.js').AdapterChange) => void) | null = null;
    vi.mocked(adapter.subscribe!).mockImplementation((cb) => {
      pushChange = cb;
      return () => {};
    });

    manager.connectLive();
    pushChange!({ type: 'insert', event: ev() });
    expect(manager.events.get('ev-1')).toMatchObject({ title: 'Meeting' });
    manager.disconnectLive();
  });

  it('connectLive handles reload change', () => {
    let pushChange: ((c: import('../adapters/CalendarAdapter.js').AdapterChange) => void) | null = null;
    vi.mocked(adapter.subscribe!).mockImplementation((cb) => {
      pushChange = cb;
      return () => {};
    });

    manager.connectLive();
    pushChange!({ type: 'reload', events: [ev(), ev({ id: 'ev-2', title: 'Other' })] });
    expect(manager.events.size).toBe(2);
    manager.disconnectLive();
  });

  it('connectLive handles delete change', async () => {
    vi.mocked(adapter.loadRange).mockResolvedValue([ev()]);
    await manager.loadRange(S, E);

    let pushChange: ((c: import('../adapters/CalendarAdapter.js').AdapterChange) => void) | null = null;
    vi.mocked(adapter.subscribe!).mockImplementation((cb) => {
      pushChange = cb;
      return () => {};
    });

    manager.connectLive();
    pushChange!({ type: 'delete', id: 'ev-1' });
    expect(manager.events.has('ev-1')).toBe(false);
    manager.disconnectLive();
  });
});

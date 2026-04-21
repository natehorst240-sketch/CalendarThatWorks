/**
 * useSyncedCalendar — React hook that wires a CalendarAdapter to a SyncManager
 * and exposes live-synced event state with optimistic update helpers.
 *
 * @example — minimal
 *   const adapter = new RestAdapter({ baseUrl: '/api/events' });
 *
 *   function MyCalendar() {
 *     const { events, isSyncing, createEvent, updateEvent, deleteEvent } =
 *       useSyncedCalendar({ adapter, start, end });
 *
 *     return <Calendar events={[...events.values()]} />;
 *   }
 *
 * @example — with conflict handling
 *   const { events, conflicts } = useSyncedCalendar({
 *     adapter,
 *     start,
 *     end,
 *     conflictResolution: 'manual',
 *     onConflict: async (local, server) => {
 *       const choice = await showConflictDialog(local, server);
 *       return choice === 'local' ? local : server;
 *     },
 *   });
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SyncManager } from '../api/v1/sync/SyncManager';
import type { CalendarAdapter } from '../api/v1/adapters/CalendarAdapter';
import type { CalendarEventV1 } from '../api/v1/types';
import type { SyncState, SyncManagerOptions } from '../api/v1/sync/SyncManager';

/**
 * @typedef {import('../api/v1/sync/SyncManager.js').SyncManagerOptions} SyncManagerOptions
 * @typedef {import('../api/v1/sync/SyncManager.js').SyncState} SyncState
 * @typedef {import('../api/v1/adapters/CalendarAdapter.js').CalendarAdapter} CalendarAdapter
 * @typedef {import('../api/v1/types.js').CalendarEventV1} CalendarEventV1
 */

/**
 * @param {object} options
 * @param {CalendarAdapter} options.adapter — The integration adapter to use.
 * @param {Date} options.start — Start of the date range to load.
 * @param {Date} options.end — End of the date range to load.
 * @param {'client-wins'|'server-wins'|'latest-wins'|'manual'|Function} [options.conflictResolution]
 * @param {Function} [options.onConflict] — Required for conflictResolution: 'manual'.
 * @param {Function} [options.onError] — Called after each unrecoverable adapter error.
 * @param {number}  [options.maxRetries] — Max auto-retries. Default: 3.
 * @param {number}  [options.retryBaseDelay] — Base retry delay in ms. Default: 1000.
 * @param {boolean} [options.live] — If true, call connectLive() on mount. Default: false.
 */
type UseSyncedCalendarOptions = {
  adapter: CalendarAdapter;
  start: Date;
  end: Date;
  conflictResolution?: SyncManagerOptions['conflictResolution'];
  onConflict?: SyncManagerOptions['onConflict'];
  onError?: SyncManagerOptions['onError'];
  maxRetries?: number;
  retryBaseDelay?: number;
  live?: boolean;
};

export function useSyncedCalendar({
  adapter,
  start,
  end,
  conflictResolution = 'server-wins' as any,
  onConflict,
  onError,
  maxRetries,
  retryBaseDelay,
  live = false,
}: UseSyncedCalendarOptions) {
  // ── SyncManager (stable across renders) ────────────────────────────────────
  const managerRef = useRef<SyncManager | null>(null);

  if (managerRef.current === null) {
    managerRef.current = new SyncManager({
      adapter,
      conflictResolution,
      onConflict,
      onError,
      maxRetries,
      retryBaseDelay,
    });
  }

  // ── Sync state ─────────────────────────────────────────────────────────────
  const [syncState, setSyncState] = useState<SyncState | null>(null);

  // ── Subscribe to SyncManager ────────────────────────────────────────────────
  useEffect(() => {
    const manager = managerRef.current;
    const unsub = manager.subscribe((state: SyncState) => setSyncState(state));
    return unsub;
  }, []);

  // ── Load range whenever start/end changes ───────────────────────────────────
  useEffect(() => {
    const manager = managerRef.current;
    const controller = new AbortController();
    manager.loadRange(start, end, controller.signal).catch((err: unknown) => {
      if (!controller.signal.aborted) console.error('[useSyncedCalendar] loadRange error:', err);
    });
    return () => controller.abort();
  }, [start, end]);

  // ── Live subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    const manager = managerRef.current;
    if (!live) return;
    manager.connectLive();
    return () => manager.disconnectLive();
  }, [live]);

  // ── Stable mutation callbacks ───────────────────────────────────────────────
  const createEvent = useCallback(
    /** @param {CalendarEventV1} event */
    (event: CalendarEventV1) => managerRef.current!.createEvent(event),
    [],
  );

  const updateEvent = useCallback(
    /** @param {string} id @param {Partial<CalendarEventV1>} patch */
    (id: string, patch: Partial<CalendarEventV1>) => managerRef.current!.updateEvent(id, patch),
    [],
  );

  const deleteEvent = useCallback(
    /** @param {string} id */
    (id: string) => managerRef.current!.deleteEvent(id),
    [],
  );

  const retryFailed = useCallback(() => managerRef.current!.retryFailed(), []);
  const clearErrors = useCallback(() => managerRef.current!.clearErrors(), []);

  const statusFor = useCallback(
    /** @param {string} eventId */
    (eventId: string) => managerRef.current!.statusFor(eventId),
    [],
  );

  const errorFor = useCallback(
    /** @param {string} eventId */
    (eventId: string) => managerRef.current!.errorFor(eventId),
    [],
  );

  // ── Derived convenience values ──────────────────────────────────────────────
  const events       = syncState?.events       ?? new Map();
  const statusMap    = syncState?.status        ?? new Map();
  const errorsMap    = syncState?.errors        ?? new Map();
  const isSyncing    = syncState?.isSyncing     ?? false;
  const pendingCount = syncState?.pendingCount   ?? 0;

  return {
    /** All events currently known to the manager (Map<id, CalendarEventV1>). */
    events,
    /** Per-event sync status map. */
    statusMap,
    /** Per-event error map. */
    errorsMap,
    /** True if any operation is in-flight. */
    isSyncing,
    /** Count of unconfirmed operations. */
    pendingCount,

    /** Optimistically create an event and sync in the background. */
    createEvent,
    /** Optimistically update an event and sync in the background. */
    updateEvent,
    /** Optimistically delete an event and sync in the background. */
    deleteEvent,

    /** Retry all failed sync operations. */
    retryFailed,
    /** Discard all error-state operations without retrying. */
    clearErrors,

    /** Get the sync status for a specific event. */
    statusFor,
    /** Get the last error for a specific event (if any). */
    errorFor,

    /** Direct access to the SyncManager for advanced use cases. */
    manager: managerRef.current,
  };
}

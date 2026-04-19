/**
 * CalendarEngine — begin a transaction.
 *
 * A transaction is a snapshot of the current event map that can be
 * either committed (applying a batch of changes atomically) or rolled back
 * (restoring the snapshot).
 *
 * This is useful for:
 *   - Optimistic UI (apply changes immediately, roll back on server error)
 *   - Undo/redo (snapshot before each operation)
 *   - Multi-step wizards (accumulate changes before finalizing)
 */

import type { EngineEvent } from '../schema/eventSchema';

// ─── Transaction handle ───────────────────────────────────────────────────────

export interface TransactionHandle {
  /** Snapshot of the events map at the time the transaction began. */
  readonly snapshot: ReadonlyMap<string, EngineEvent>;
  /** ISO timestamp when the transaction was opened. */
  readonly openedAt: string;
  /** Optional label for debugging. */
  readonly label?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a transaction handle from the current events map.
 *
 * @param events  The current events map to snapshot
 * @param label   Optional human-readable label for debugging
 */
export function beginTransaction(
  events: ReadonlyMap<string, EngineEvent>,
  label?: string,
): TransactionHandle {
  return {
    snapshot:  new Map(events),
    openedAt:  new Date().toISOString(),
    label,
  };
}

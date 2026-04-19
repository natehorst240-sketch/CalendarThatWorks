/**
 * CalendarEngine — rollback a transaction.
 *
 * Restores the events map to the snapshot captured by beginTransaction.
 * Pure function — returns the snapshot map directly.
 */

import type { EngineEvent } from '../schema/eventSchema';
import type { TransactionHandle } from './beginTransaction';

/**
 * Discard any changes made since the transaction was opened and return
 * the snapshotted events map.
 *
 * @param tx  The transaction handle returned by beginTransaction
 * @returns   The original events map (a copy of the snapshot)
 */
export function rollbackTransaction(
  tx: TransactionHandle,
): ReadonlyMap<string, EngineEvent> {
  // Return a fresh copy so the caller gets an immutable view
  return new Map(tx.snapshot);
}

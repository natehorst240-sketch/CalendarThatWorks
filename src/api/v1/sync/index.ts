/**
 * CalendarEngine v1 — sync infrastructure barrel.
 *
 * Import sync primitives from here:
 *   import { SyncManager, SyncQueue, clientWins, serverWins, resolverFor } from 'works-calendar/api/v1/sync';
 *   import type { SyncState, SyncStatus, ConflictStrategy, ConflictResolver } from 'works-calendar/api/v1/sync';
 */

// ── Queue ─────────────────────────────────────────────────────────────────────
export { SyncQueue }       from './SyncQueue';
export type {
  SyncStatus,
  QueuedOperation,
} from './SyncQueue';

// ── Conflict strategies ───────────────────────────────────────────────────────
export {
  clientWins,
  serverWins,
  latestWins,
  manualResolve,
  resolverFor,
  ConflictError,
} from './conflictStrategies';
export type {
  ConflictStrategy,
  ConflictResolver,
} from './conflictStrategies';

// ── SyncManager ───────────────────────────────────────────────────────────────
export { SyncManager }     from './SyncManager';
export type {
  SyncManagerOptions,
  SyncState,
  SyncStateListener,
  SyncUnsubscribe,
} from './SyncManager';

/**
 * conflictStrategies — built-in conflict resolution strategies for SyncManager.
 *
 * A ConflictResolver is a pure function that, given the local (optimistic) event
 * and the server (authoritative) event returned during a conflict, returns the
 * version that should be stored.
 *
 * Strategies:
 *   client-wins  — always keep the local optimistic version
 *   server-wins  — always discard the local change and accept the server version
 *   manual       — defer to an onConflict callback; throws if none is provided
 *   latest-wins  — compare updatedAt / lastSyncedAt timestamps; newest wins
 *
 * Custom strategies can be provided directly as a ConflictResolver function.
 */

import type { CalendarEventV1 } from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A conflict resolver receives the local (optimistically-applied) version of an
 * event and the server version that caused the conflict, and returns the
 * resolved event that should become the new local state.
 *
 * The resolver may be async (e.g. to show a UI modal and await user input).
 */
export type ConflictResolver = (
  local:  CalendarEventV1,
  server: CalendarEventV1,
) => CalendarEventV1 | Promise<CalendarEventV1>;

/** Named strategy shortcuts accepted by SyncManager. */
export type ConflictStrategy = 'client-wins' | 'server-wins' | 'latest-wins' | 'manual';

// ─── Built-in resolvers ───────────────────────────────────────────────────────

/** Always keep the local optimistic version. */
export const clientWins: ConflictResolver = (local) => local;

/** Always accept the server version, discarding local changes. */
export const serverWins: ConflictResolver = (_local, server) => server;

/**
 * Keep whichever version has the more recent timestamp.
 *
 * Compares, in order:
 *   1. sync.updatedAt   (set by the adapter on write)
 *   2. sync.lastSyncedAt
 *   3. Falls back to server-wins when neither has a timestamp.
 */
export const latestWins: ConflictResolver = (local, server): CalendarEventV1 => {
  const localTs  = _bestTimestamp(local);
  const serverTs = _bestTimestamp(server);

  if (localTs === null && serverTs === null) return server; // fallback: server
  if (localTs === null) return server;
  if (serverTs === null) return local;

  return localTs >= serverTs ? local : server;
};

/**
 * Requires an external `onConflict` callback to be provided to SyncManager.
 * If none is set this throws, so callers know the configuration is incomplete.
 */
export const manualResolve: ConflictResolver = (local, server): never => {
  throw new ConflictError(
    'ConflictStrategy "manual" requires an onConflict callback in SyncManager options.',
    local,
    server,
  );
};

// ─── ConflictError ────────────────────────────────────────────────────────────

/** Thrown when a conflict cannot be automatically resolved. */
export class ConflictError extends Error {
  readonly local:  CalendarEventV1;
  readonly server: CalendarEventV1;

  constructor(message: string, local: CalendarEventV1, server: CalendarEventV1) {
    super(message);
    this.name   = 'ConflictError';
    this.local  = local;
    this.server = server;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Convert a ConflictStrategy shorthand into a ConflictResolver function.
 *
 * If a full ConflictResolver function is passed it is returned unchanged,
 * letting callers use either form interchangeably:
 *
 *   resolverFor('client-wins')
 *   resolverFor((local, server) => myCustomMerge(local, server))
 */
export function resolverFor(
  strategy: ConflictStrategy | ConflictResolver,
): ConflictResolver {
  if (typeof strategy === 'function') return strategy;

  switch (strategy) {
    case 'client-wins':  return clientWins;
    case 'server-wins':  return serverWins;
    case 'latest-wins':  return latestWins;
    case 'manual':       return manualResolve;
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown conflict strategy: ${String(_exhaustive)}`);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _bestTimestamp(ev: CalendarEventV1): Date | null {
  const sync = ev.sync;
  if (!sync) return null;
  return sync.updatedAt ?? sync.lastSyncedAt ?? null;
}

/**
 * Resolve-on-submit for resource pools (issue #212).
 *
 * When an engine operation references a `ResourcePool` via
 * `event.resourcePoolId`, the concrete resource is picked here — before
 * validation — so the rest of the pipeline (overlap, dependencies,
 * lifecycle emit) sees a plain single-resource booking.
 *
 * Scope in this revision: `create` ops only. `update` / `group-change`
 * can set `resourcePoolId` too, but those paths are deferred until the
 * primary booking flow lands — matching the issue's "booking against a
 * pool in the Assets view resolves to a concrete resource in the saved
 * event" acceptance criterion.
 *
 * This module stays pure: no state mutation. The caller (engine) is
 * responsible for persisting any returned pool-cursor advance.
 */
import type { EngineOperation } from './schema/operationSchema';
import type { EngineResource } from './schema/resourceSchema';
import type { Assignment } from './schema/assignmentSchema';
import { assignmentsForEvent } from './schema/assignmentSchema';
import type { ResourcePool } from '../pools/resourcePoolSchema';
import type { ConflictEvent, ConflictRule } from '../conflictEngine';
import type { Violation } from './validation/validationTypes';
import type { OperationResult } from './operations/operationResult';
import { resolvePool } from '../pools/resolvePool';

// ─── Default rule set ────────────────────────────────────────────────────────

/**
 * The resolver disqualifies a pool member when it would collide on a
 * hard rule. We always include resource-overlap as hard — a pool should
 * never hand out a member that would reject the booking anyway.
 */
const DEFAULT_HARD_OVERLAP: ConflictRule = {
  id: '__pool-overlap',
  type: 'resource-overlap',
  severity: 'hard',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PoolResolveContext {
  readonly events: ReadonlyMap<string, import('./schema/eventSchema').EngineEvent>;
  readonly pools: ReadonlyMap<string, ResourcePool>;
  readonly assignments?: ReadonlyMap<string, Assignment>;
  readonly resources?: ReadonlyMap<string, EngineResource>;
  /**
   * Extra rules the resolver must satisfy. Host wiring can add
   * min-rest, category-mutex, etc. Resource-overlap is always included
   * as a hard rule so the resolver never returns a member the main
   * validator would reject.
   */
  readonly rules?: readonly ConflictRule[];
}

export type PoolResolveOutcome =
  | { readonly kind: 'passthrough' }                           // no pool on op
  | { readonly kind: 'rewritten'; readonly op: EngineOperation; readonly poolUpdate?: ResourcePool }
  | { readonly kind: 'rejected';  readonly result: OperationResult };

// ─── Public API ──────────────────────────────────────────────────────────────

export function resolvePoolForOp(
  op: EngineOperation,
  ctx: PoolResolveContext,
): PoolResolveOutcome {
  if (op.type !== 'create') return { kind: 'passthrough' };

  const raw = op.event;
  const poolId = raw.resourcePoolId ?? null;
  if (!poolId)           return { kind: 'passthrough' };
  if (raw.resourceId)    return { kind: 'passthrough' };   // concrete wins

  const pool = ctx.pools.get(poolId);
  if (!pool) {
    return { kind: 'rejected', result: rejectedFor(op, {
      rule:    'pool-unresolvable',
      severity:'hard',
      message: `Pool "${poolId}" is not registered.`,
      details: { poolId, code: 'POOL_UNKNOWN' },
    }) };
  }

  const proposed: Omit<ConflictEvent, 'resource'> = {
    id:       '__proposed__',
    start:    raw.start,
    end:      raw.end,
    category: raw.category ?? null,
  };

  const events: ConflictEvent[] = [];
  for (const ev of ctx.events.values()) {
    // Assignment-backed occupancy: an event may have resourceId=null but
    // hold one or more resources via Assignment records. Emit one
    // ConflictEvent per effective resource so the resolver's conflict
    // check matches what the assignment-aware overlap validator will do
    // downstream.
    const assigned = ctx.assignments
      ? assignmentsForEvent(ctx.assignments, ev.id).map(a => a.resourceId)
      : [];
    const resources = assigned.length > 0
      ? assigned
      : [ev.resourceId];
    for (const resource of resources) {
      events.push({
        id:       ev.id,
        start:    ev.start,
        end:      ev.end,
        resource,
        category: ev.category,
      });
    }
  }

  const rules = [DEFAULT_HARD_OVERLAP, ...(ctx.rules ?? [])];
  const result = resolvePool({
    pool, proposed, events, rules,
    ...(ctx.assignments && { assignments: ctx.assignments }),
    ...(ctx.resources   && { resources:   ctx.resources }),
  });

  if (result.ok === false) {
    const err = result.error;
    return { kind: 'rejected', result: rejectedFor(op, {
      rule:    'pool-unresolvable',
      severity:'hard',
      message: err.message,
      details: {
        poolId:    err.poolId,
        code:      err.code,
        evaluated: pool.memberIds,
      },
    }) };
  }

  const prevMeta = (raw.meta ?? {}) as Record<string, unknown>;
  const rewrittenEvent: typeof raw = {
    ...raw,
    resourceId:     result.resourceId,
    resourcePoolId: null,
    meta: {
      ...prevMeta,
      resolvedFromPoolId: poolId,
      poolEvaluated:      result.evaluated,
    },
  };

  const rewrittenOp: EngineOperation = { ...op, event: rewrittenEvent };

  const outcome: PoolResolveOutcome = {
    kind: 'rewritten',
    op:   rewrittenOp,
    ...(result.rrCursor !== undefined
      ? { poolUpdate: { ...pool, rrCursor: result.rrCursor } }
      : {}),
  };
  return outcome;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rejectedFor(op: EngineOperation, violation: Violation): OperationResult {
  return {
    status:    'rejected',
    operation: op,
    validation: {
      allowed:    false,
      severity:   'hard',
      violations: [violation],
      suggestedPatch: null,
    },
    changes: [],
  };
}

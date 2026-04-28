/**
 * Resource query evaluator (issue #386 v2 pools).
 *
 * Pure function — given a `ResourceQuery` and a set of resources,
 * returns the matching ids plus an `excluded` trail with the first
 * failed clause path per resource. The exclusion trail is the
 * "readiness explainability" hook the issue calls out: hosts can
 * render "1 too far · 1 capacity too low · 2 available" without
 * re-running the query themselves.
 *
 * Path resolution (`path` field of every leaf clause):
 *   - top-level `EngineResource` keys: `id`, `name`, `tenantId`,
 *     `capacity`, `color`, `timezone`,
 *   - anything else: read from `meta` via dot-path
 *     (e.g. `capabilities.refrigerated` reads
 *     `resource.meta.capabilities.refrigerated`).
 *
 * Comparators on a missing path always return false. `exists` is the
 * only clause that surfaces presence; everything else is "value
 * matches".
 */
import type { EngineResource } from '../engine/schema/resourceSchema'
import type { ResourceQuery, ResourceQueryValue } from './poolQuerySchema'

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'tenantId', 'capacity', 'color', 'timezone',
])

export interface QueryExclusion {
  readonly id: string
  /**
   * The first leaf clause that failed for this resource, expressed
   * as `op(path)` — e.g. `gte(capabilities.capacity_lbs)`. For
   * boolean composites, the failing inner clause is reported.
   */
  readonly reason: string
}

export interface QueryEvaluation {
  /** Resource ids that satisfy the entire query, in input order. */
  readonly matched: readonly string[]
  /** Per-resource exclusion trail. Order mirrors input. */
  readonly excluded: readonly QueryExclusion[]
}

export function evaluateQuery(
  query: ResourceQuery,
  resources:
    | readonly EngineResource[]
    | ReadonlyMap<string, EngineResource>,
): QueryEvaluation {
  const list: readonly EngineResource[] = resources instanceof Map
    ? Array.from(resources.values())
    : (resources as readonly EngineResource[])

  const matched: string[] = []
  const excluded: QueryExclusion[] = []

  for (const r of list) {
    const reason = firstFailingPath(query, r)
    if (reason === null) matched.push(r.id)
    else excluded.push({ id: r.id, reason })
  }

  return { matched, excluded }
}

// ─── Internals ────────────────────────────────────────────────────────────

/**
 * Walks the query tree against one resource. Returns `null` when the
 * resource matches; otherwise returns a short descriptor of the first
 * leaf clause that failed (used as the `reason` field in the excluded
 * trail).
 */
function firstFailingPath(query: ResourceQuery, r: EngineResource): string | null {
  switch (query.op) {
    case 'and': {
      for (const c of query.clauses) {
        const f = firstFailingPath(c, r)
        if (f !== null) return f
      }
      return null
    }
    case 'or': {
      if (query.clauses.length === 0) return 'or()'
      let lastReason: string | null = null
      for (const c of query.clauses) {
        const f = firstFailingPath(c, r)
        if (f === null) return null
        lastReason = f
      }
      return lastReason
    }
    case 'not': {
      const f = firstFailingPath(query.clause, r)
      return f === null ? `not(${describe(query.clause)})` : null
    }
    default: {
      return matchLeaf(query, r) ? null : describe(query)
    }
  }
}

function matchLeaf(q: Exclude<ResourceQuery, { op: 'and' | 'or' | 'not' }>, r: EngineResource): boolean {
  const v = readPath(r, q.path)
  switch (q.op) {
    case 'exists': return v !== undefined
    case 'eq':     return sameValue(v, q.value)
    case 'neq':    return !sameValue(v, q.value)
    case 'in':     return q.values.some(x => sameValue(v, x))
    case 'gt':     return typeof v === 'number' && Number.isFinite(v) && v >  q.value
    case 'gte':    return typeof v === 'number' && Number.isFinite(v) && v >= q.value
    case 'lt':     return typeof v === 'number' && Number.isFinite(v) && v <  q.value
    case 'lte':    return typeof v === 'number' && Number.isFinite(v) && v <= q.value
  }
}

function sameValue(actual: unknown, expected: ResourceQueryValue): boolean {
  if (expected === null) return actual === null
  return actual === expected
}

function readPath(r: EngineResource, path: string): unknown {
  if (TOP_LEVEL_KEYS.has(path)) {
    return (r as unknown as Record<string, unknown>)[path]
  }
  // Walk `meta.foo.bar.baz`. The leading `meta.` is optional; bare
  // `capabilities.x` is interpreted as `meta.capabilities.x`.
  const segments = path.startsWith('meta.')
    ? path.slice(5).split('.')
    : path.split('.')
  let cursor: unknown = r.meta
  for (const seg of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[seg]
  }
  return cursor
}

function describe(q: ResourceQuery): string {
  switch (q.op) {
    case 'and':    return 'and(...)'
    case 'or':     return 'or(...)'
    case 'not':    return `not(${describe(q.clause)})`
    case 'exists': return `exists(${q.path})`
    case 'in':     return `in(${q.path})`
    default:       return `${q.op}(${q.path})`
  }
}

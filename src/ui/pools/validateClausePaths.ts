/**
 * `validateClausePaths` — soft path-existence check for the
 * advanced rules editor (#452).
 *
 * `ClauseEditor`'s path input accepts any string. With a live
 * registry to consult, we can flag *"this path resolves on zero
 * resources"* so users catch typos before saving — without
 * rejecting the save, since paths that don't currently resolve
 * are sometimes intentional (forward-looking schemas, optional
 * capabilities the host hasn't populated yet).
 *
 * Pure / sync. Returns the list of unresolved paths in clause
 * order plus a flat `byPath` set for quick lookup. Composite ops
 * (and / or / not) walk their children; the `within` op
 * contributes its `path` like any other leaf.
 */
import type { ResourceQuery } from 'works-calendar-engine'
import type { EngineResource } from 'works-calendar-engine'

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'id', 'name', 'tenantId', 'capacity', 'color', 'timezone',
])

export interface ClausePathIssue {
  /** The literal path string the user typed. */
  readonly path: string
  /** How many leaf clauses in the tree referenced this path. */
  readonly count: number
}

export interface ValidateClausePathsResult {
  /** True when every path resolves on at least one resource. */
  readonly ok: boolean
  /** Per-unresolved-path issue descriptors, sorted by first occurrence. */
  readonly unresolved: readonly ClausePathIssue[]
  /** Quick membership set for "is this specific path unresolved?". */
  readonly byPath: ReadonlySet<string>
}

export function validateClausePaths(
  query: ResourceQuery,
  resources: ReadonlyMap<string, EngineResource> | readonly EngineResource[],
): ValidateClausePathsResult {
  const list = resources instanceof Map
    ? Array.from(resources.values())
    : resources as readonly EngineResource[]

  // Walk every leaf clause once, collect distinct paths in order.
  const seen: string[] = []
  const counts = new Map<string, number>()
  collectPaths(query, (p) => {
    if (!counts.has(p)) seen.push(p)
    counts.set(p, (counts.get(p) ?? 0) + 1)
  })

  const unresolvedPaths: string[] = []
  for (const path of seen) {
    if (!resolvesOnAny(path, list)) unresolvedPaths.push(path)
  }
  const unresolved: ClausePathIssue[] = unresolvedPaths.map(p => ({
    path: p, count: counts.get(p) ?? 1,
  }))
  return {
    ok: unresolved.length === 0,
    unresolved,
    byPath: new Set(unresolvedPaths),
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

function collectPaths(q: ResourceQuery, push: (p: string) => void): void {
  switch (q.op) {
    case 'and':
    case 'or':
      for (const c of q.clauses) collectPaths(c, push)
      return
    case 'not':
      collectPaths(q.clause, push)
      return
    default:
      // Every leaf op (eq / neq / in / gt / gte / lt / lte / exists /
      // within) carries a `path` field of the same shape.
      if (typeof q.path === 'string' && q.path.length > 0) push(q.path)
      return
  }
}

function resolvesOnAny(path: string, resources: readonly EngineResource[]): boolean {
  for (const r of resources) {
    if (readPath(r, path) !== undefined) return true
  }
  return false
}

function readPath(r: EngineResource, path: string): unknown {
  if (TOP_LEVEL_KEYS.has(path)) {
    return (r as unknown as Record<string, unknown>)[path]
  }
  // Bare `meta.x` and `x` resolve to `r.meta.x`. Mirrors evaluateQuery's
  // path semantics so warnings match what the resolver actually checks.
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

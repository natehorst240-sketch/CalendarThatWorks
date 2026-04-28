/**
 * Plain-English description of a `ResourcePool` for the v2 UI
 * components (issue #386).
 *
 * Pure function — turns a structural pool + query into the kind of
 * sentence the issue thread asks for ("Refrigerated · within 50 mi
 * of event · capacity ≥ 80,000 lb"). Lives outside the React layer
 * so it's easy to test, easy to reuse from non-UI surfaces (plain
 * text emails, audit log entries), and easy to swap for a
 * localization layer later.
 *
 * Returns a list of human-readable phrases — the renderer chooses
 * how to join them (chips vs. comma list vs. bullet list).
 */
import type { ResourcePool } from '../../core/pools/resourcePoolSchema'
import type { ResourceQuery } from '../../core/pools/poolQuerySchema'

export interface PoolSummary {
  /** "Pool", "Manual pool", "Query pool", "Hybrid pool" */
  readonly typeLabel: string
  /**
   * Strategy in plain English ("First available", "Least loaded",
   * "Round robin", "Closest to event").
   */
  readonly strategyLabel: string
  /**
   * Each clause as one short phrase. Empty for `manual` pools and
   * for `query` pools that have no recognizable clauses.
   */
  readonly clauseLabels: readonly string[]
  /**
   * One-line headline that combines the above. Useful for default
   * card headers when a richer layout isn't needed.
   */
  readonly headline: string
}

const TYPE_LABEL: Record<string, string> = {
  manual: 'Manual pool',
  query:  'Query pool',
  hybrid: 'Hybrid pool',
}

const STRATEGY_LABEL: Record<string, string> = {
  'first-available': 'First available',
  'least-loaded':    'Least loaded',
  'round-robin':     'Round robin',
  'closest':         'Closest to event',
}

export function summarizePool(pool: ResourcePool): PoolSummary {
  const typeLabel     = TYPE_LABEL[pool.type ?? 'manual'] ?? 'Pool'
  const strategyLabel = STRATEGY_LABEL[pool.strategy] ?? pool.strategy

  const clauseLabels: string[] = []
  if (pool.type === 'manual' || pool.type === undefined) {
    if (pool.memberIds.length > 0) {
      clauseLabels.push(`${pool.memberIds.length} ${pluralize('member', pool.memberIds.length)}`)
    }
  } else if (pool.query) {
    clauseLabels.push(...summarizeQuery(pool.query))
    if (pool.type === 'hybrid' && pool.memberIds.length > 0) {
      clauseLabels.push(`limited to ${pool.memberIds.length} curated ${pluralize('member', pool.memberIds.length)}`)
    }
  }

  const headline = clauseLabels.length > 0
    ? `${typeLabel} · ${clauseLabels.join(' · ')}`
    : typeLabel

  return { typeLabel, strategyLabel, clauseLabels, headline }
}

/**
 * Turn a query tree into a flat list of human phrases. Boolean
 * composites flatten unless a clause has no plain-English form, in
 * which case it falls back to a generic "matches custom rule".
 */
export function summarizeQuery(q: ResourceQuery): readonly string[] {
  const phrases: string[] = []
  walk(q, phrases)
  return phrases
}

function walk(q: ResourceQuery, out: string[]): void {
  switch (q.op) {
    case 'and':
      for (const c of q.clauses) walk(c, out)
      return
    case 'or': {
      // OR can't flatten without losing meaning — render the whole
      // sub-tree as a single "any of …" phrase.
      const inner = q.clauses.flatMap(c => summarizeQuery(c))
      if (inner.length > 0) out.push(`any of: ${inner.join(' / ')}`)
      return
    }
    case 'not': {
      const inner = summarizeQuery(q.clause).join(' & ')
      if (inner) out.push(`not (${inner})`)
      return
    }
    case 'within': {
      const unit = q.miles != null ? `${q.miles} mi` : q.km != null ? `${q.km} km` : 'distance'
      const ref = q.from.kind === 'proposed' ? 'event' : `${q.from.lat.toFixed(2)}, ${q.from.lon.toFixed(2)}`
      out.push(`within ${unit} of ${ref}`)
      return
    }
    case 'eq': {
      const friendly = friendlyPath(q.path)
      if (q.value === true)  out.push(friendly)
      else if (q.value === false) out.push(`not ${friendly}`)
      else if (q.value === null)  out.push(`${friendly} is empty`)
      else out.push(`${friendly} = ${formatValue(q.value)}`)
      return
    }
    case 'neq':
      out.push(`${friendlyPath(q.path)} ≠ ${formatValue(q.value)}`)
      return
    case 'in':
      out.push(`${friendlyPath(q.path)} in {${q.values.map(formatValue).join(', ')}}`)
      return
    case 'gt':
      out.push(`${friendlyPath(q.path)} > ${formatValue(q.value)}`)
      return
    case 'gte':
      out.push(`${friendlyPath(q.path)} ≥ ${formatValue(q.value)}`)
      return
    case 'lt':
      out.push(`${friendlyPath(q.path)} < ${formatValue(q.value)}`)
      return
    case 'lte':
      out.push(`${friendlyPath(q.path)} ≤ ${formatValue(q.value)}`)
      return
    case 'exists':
      out.push(`has ${friendlyPath(q.path)}`)
      return
  }
}

/**
 * `meta.capabilities.refrigerated` → `refrigerated`
 * `capabilities.capacity_lbs`      → `capacity lbs`
 * `tenantId`                       → `tenant`
 */
function friendlyPath(path: string): string {
  const trimmed = path.replace(/^meta\./, '').replace(/^capabilities\./, '')
  return trimmed.split('.').pop()!.replace(/[_-]+/g, ' ')
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return v.toLocaleString()
  if (v === null) return 'null'
  return String(v)
}

function pluralize(word: string, n: number): string {
  return n === 1 ? word : `${word}s`
}

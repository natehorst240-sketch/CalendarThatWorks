/**
 * PoolBuilder — guided create/edit modal for `ResourcePool` (issue #386).
 *
 * Progressive disclosure per the issue thread: the host picks
 * type → name → rules → strategy in stages, and we render a live
 * "Matches N · excluded N" preview against `resources` so users see
 * their query take effect as they type. The builder produces a
 * concrete `ResourcePool` via `onSave`; persistence is the host's
 * problem (typically wired to `onPoolsChange`).
 *
 * Deliberately minimal for v1:
 *   - Manual pools: pick members from the asset registry.
 *   - Query / hybrid pools: capability checkboxes + "within N mi/km
 *     of event" radius. Capabilities are sourced from the host's
 *     `capabilityCatalog` prop or auto-derived from `meta.capabilities`
 *     on the live resources.
 *   - Strategy picker, including `closest` (only enabled when a
 *     `within` clause is configured so the new strategy has a
 *     reference point).
 *
 * Out of scope here (separate UI PRs): a Level-3 raw rule builder
 * with arbitrary AND/OR/NOT, capacity/numeric range pickers, multi-
 * source location adapters config, and the wizard-level config
 * export.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { evaluateQuery } from '../../core/pools/evaluateQuery'
import type {
  ResourcePool, PoolStrategy, PoolType,
} from '../../core/pools/resourcePoolSchema'
import type {
  ResourceQuery,
} from '../../core/pools/poolQuerySchema'
import type { EngineResource } from '../../core/engine/schema/resourceSchema'
import styles from './PoolBuilder.module.css'

export interface CapabilityOption {
  /** Path under `meta.capabilities` (e.g. `refrigerated`). */
  readonly id: string
  readonly label: string
}

export interface PoolBuilderProps {
  /** Existing pool to edit; pass `null` to create a new one. */
  readonly pool: ResourcePool | null
  /** Live registry — drives the live match preview. */
  readonly resources?: ReadonlyMap<string, EngineResource> | readonly EngineResource[]
  /**
   * Capabilities the host wants to expose as checkboxes. When
   * omitted, the builder auto-derives them from each resource's
   * `meta.capabilities` keys (boolean values only). Hosts that want
   * a curated list (chips with custom labels) pass it explicitly.
   */
  readonly capabilityCatalog?: readonly CapabilityOption[]
  readonly onSave: (pool: ResourcePool) => void
  readonly onCancel: () => void
}

const STRATEGIES: readonly { value: PoolStrategy; label: string }[] = [
  { value: 'first-available', label: 'First available' },
  { value: 'least-loaded',    label: 'Least loaded' },
  { value: 'round-robin',     label: 'Round robin' },
  { value: 'closest',         label: 'Closest to event' },
]

const TYPES: readonly { value: PoolType; label: string; description: string }[] = [
  { value: 'manual', label: 'Manual',
    description: 'Pick specific members.' },
  { value: 'query',  label: 'Query',
    description: 'Match resources by their attributes (capabilities, location, …).' },
  { value: 'hybrid', label: 'Hybrid',
    description: 'A curated list filtered by query attributes.' },
]

interface DraftState {
  name: string
  type: PoolType
  memberIds: readonly string[]
  capabilities: readonly string[]   // selected capability ids
  withinMiles: number | null         // null means "no radius clause"
  strategy: PoolStrategy
  /**
   * Clauses from the original `pool.query` that the simple form
   * doesn't recognize (e.g. numeric `gte`, `or`, `not`, non-capability
   * eq). Carried through edits and re-AND'd into the saved query so
   * that hosts who configured advanced rules elsewhere don't lose
   * them when a user opens the builder. Surfaced as an inline note
   * in the UI so the user knows additional rules are in play.
   */
  preserved: readonly ResourceQuery[]
}

export default function PoolBuilder(props: PoolBuilderProps): JSX.Element {
  const { pool, resources, capabilityCatalog, onSave, onCancel } = props
  const trapRef = useFocusTrap<HTMLDivElement>(onCancel)

  const resourceList = useMemo(
    () => normalizeResources(resources),
    [resources],
  )

  const catalog = useMemo(
    () => capabilityCatalog ?? deriveCapabilityCatalog(resourceList),
    [capabilityCatalog, resourceList],
  )

  const [draft, setDraft] = useState<DraftState>(() => fromPool(pool))
  // Reset when a different pool is passed in.
  useEffect(() => { setDraft(fromPool(pool)) }, [pool])

  const built = useMemo(() => buildPool(draft, pool), [draft, pool])
  const stats = useMemo(
    () => previewStats(built, resourceList),
    [built, resourceList],
  )

  const closestRequiresRadius = draft.strategy === 'closest' && draft.withinMiles == null
  const hasPreserved = draft.preserved.length > 0
  const canSave = draft.name.trim().length > 0
    && (draft.type === 'manual'
      ? draft.memberIds.length > 0
      : draft.capabilities.length > 0
        || draft.withinMiles != null
        || hasPreserved)

  return (
    <div
      className={styles['overlay']}
      onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pool-builder-title"
        className={styles['panel']}
      >
        <header className={styles['head']}>
          <h2 id="pool-builder-title" className={styles['title']}>
            {pool ? `Edit pool: ${pool.name}` : 'Create pool'}
          </h2>
          <button
            type="button"
            className={styles['closeBtn']}
            onClick={onCancel}
            aria-label="Close pool builder"
          >×</button>
        </header>

        <section className={styles['section']}>
          <label htmlFor="pool-name" className={styles['label']}>Pool name</label>
          <input
            id="pool-name"
            className={styles['input']}
            type="text"
            value={draft.name}
            placeholder="e.g. Nearby Refrigerated Trucks"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(d => ({ ...d, name: e.target.value }))}
          />
        </section>

        <section className={styles['section']} aria-labelledby="pool-type-label">
          <span id="pool-type-label" className={styles['label']}>Type</span>
          <div className={styles['typeRow']} role="radiogroup" aria-labelledby="pool-type-label">
            {TYPES.map(t => (
              <label key={t.value} className={styles['typeOption']} data-selected={draft.type === t.value}>
                <input
                  type="radio"
                  name="pool-type"
                  value={t.value}
                  checked={draft.type === t.value}
                  onChange={() => setDraft(d => ({ ...d, type: t.value }))}
                />
                <span className={styles['typeLabel']}>{t.label}</span>
                <span className={styles['typeDesc']}>{t.description}</span>
              </label>
            ))}
          </div>
        </section>

        {(draft.type === 'manual' || draft.type === 'hybrid') && (
          <section className={styles['section']} aria-labelledby="pool-members-label">
            <span id="pool-members-label" className={styles['label']}>
              {draft.type === 'manual' ? 'Members' : 'Curated members (filtered by rules below)'}
            </span>
            <div className={styles['memberList']}>
              {resourceList.length === 0 && (
                <span className={styles['empty']}>No resources available.</span>
              )}
              {resourceList.map(r => (
                <label key={r.id} className={styles['memberOption']}>
                  <input
                    type="checkbox"
                    checked={draft.memberIds.includes(r.id)}
                    onChange={() => setDraft(d => ({
                      ...d,
                      memberIds: d.memberIds.includes(r.id)
                        ? d.memberIds.filter(x => x !== r.id)
                        : [...d.memberIds, r.id],
                    }))}
                  />
                  <span>{r.name}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        {(draft.type === 'query' || draft.type === 'hybrid') && (
          <>
            <section className={styles['section']} aria-labelledby="pool-caps-label">
              <span id="pool-caps-label" className={styles['label']}>Required capabilities</span>
              {catalog.length === 0 && (
                <span className={styles['empty']}>
                  No capabilities discovered. Hosts can pass a `capabilityCatalog` prop.
                </span>
              )}
              <div className={styles['chipRow']}>
                {catalog.map(c => {
                  const selected = draft.capabilities.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      data-selected={selected}
                      className={styles['capChip']}
                      onClick={() => setDraft(d => ({
                        ...d,
                        capabilities: selected
                          ? d.capabilities.filter(x => x !== c.id)
                          : [...d.capabilities, c.id],
                      }))}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className={styles['section']}>
              <label htmlFor="pool-radius" className={styles['label']}>
                Radius in miles (leave blank for no radius)
              </label>
              <div className={styles['radiusRow']}>
                <input
                  id="pool-radius"
                  type="number"
                  min={0}
                  step={1}
                  className={styles['inputNum']}
                  value={draft.withinMiles ?? ''}
                  placeholder="50"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const v = e.target.value
                    setDraft(d => ({ ...d, withinMiles: v === '' ? null : Number(v) }))
                  }}
                />
                <span className={styles['unit']}>miles of event</span>
              </div>
            </section>
          </>
        )}

        <section className={styles['section']}>
          <label htmlFor="pool-strategy" className={styles['label']}>Selection strategy</label>
          <select
            id="pool-strategy"
            className={styles['select']}
            value={draft.strategy}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setDraft(d => ({
              ...d, strategy: e.target.value as PoolStrategy,
            }))}
          >
            {STRATEGIES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {closestRequiresRadius && (
            <span className={styles['warning']} role="alert">
              "Closest to event" needs a radius clause so it has a reference point.
            </span>
          )}
        </section>

        {hasPreserved && (draft.type === 'query' || draft.type === 'hybrid') && (
          <section
            className={styles['preserved']}
            data-testid="pool-builder-preserved"
            role="note"
            aria-label="Additional rules preserved on save"
          >
            <strong>{draft.preserved.length}</strong>{' '}
            additional {draft.preserved.length === 1 ? 'rule isn’t' : 'rules aren’t'} editable here
            {' '}— they’ll be preserved on save.
          </section>
        )}

        <section className={styles['preview']} aria-label="Live match preview">
          <strong>{stats.matched}</strong> {stats.matched === 1 ? 'match' : 'matches'}
          {stats.excluded > 0 && (
            <span className={styles['previewExcluded']}>
              {' '}· {stats.excluded} excluded
            </span>
          )}
        </section>

        <footer className={styles['foot']}>
          <button type="button" className={styles['btnSecondary']} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles['btnPrimary']}
            disabled={!canSave || closestRequiresRadius}
            onClick={() => onSave(built)}
            title={canSave ? 'Save pool' : 'Add at least one rule or member to save'}
          >
            {pool ? 'Save changes' : 'Create pool'}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fromPool(pool: ResourcePool | null): DraftState {
  if (!pool) {
    return {
      name: '',
      type: 'manual',
      memberIds: [],
      capabilities: [],
      withinMiles: null,
      strategy: 'first-available',
      preserved: [],
    }
  }
  const { capabilities, withinMiles, preserved } = partitionQuery(pool.query)
  return {
    name: pool.name,
    type: pool.type ?? 'manual',
    memberIds: pool.memberIds,
    capabilities,
    withinMiles,
    strategy: pool.strategy,
    preserved,
  }
}

/**
 * Split an existing pool query into the buckets the form can edit
 * (capabilities, withinMiles) plus a list of *preserved* clauses
 * the form can't model. Recognized clauses are pulled out; anything
 * else — `gte`, `lte`, `or`, `not`, non-capability `eq`, a second
 * `within`, etc. — is collected verbatim so it can be re-AND'd onto
 * the user's edits at save time.
 *
 * Conservative: when the root op isn't `and`, the entire query goes
 * into `preserved` rather than being inspected for inner clauses
 * we'd later strip. The form starts with empty capabilities/radius,
 * and the user's additions are AND'd onto the original tree.
 */
function partitionQuery(q: ResourceQuery | undefined): {
  capabilities: readonly string[]
  withinMiles: number | null
  preserved: readonly ResourceQuery[]
} {
  if (!q) return { capabilities: [], withinMiles: null, preserved: [] }
  const capabilities: string[] = []
  let withinMiles: number | null = null
  const preserved: ResourceQuery[] = []
  const consume = (clause: ResourceQuery): boolean => {
    if (
      clause.op === 'eq'
      && clause.value === true
      && clause.path.startsWith('meta.capabilities.')
    ) {
      capabilities.push(clause.path.slice('meta.capabilities.'.length))
      return true
    }
    // Recognize the exact `within` shape the form emits — same path,
    // proposed-mode, miles. Anything else (km, literal-point, custom
    // path) goes through preserved so we don't smuggle a different
    // clause back into the saved query.
    if (
      clause.op === 'within'
      && clause.path === 'meta.location'
      && clause.from.kind === 'proposed'
      && clause.miles != null
      && withinMiles == null
    ) {
      withinMiles = clause.miles
      return true
    }
    return false
  }
  if (q.op === 'and') {
    for (const c of q.clauses) {
      if (!consume(c)) preserved.push(c)
    }
  } else if (!consume(q)) {
    preserved.push(q)
  }
  return { capabilities, withinMiles, preserved }
}

function buildPool(draft: DraftState, base: ResourcePool | null): ResourcePool {
  // Reuse the existing id when editing so persistence keys stay stable.
  const id = base?.id ?? (slugify(draft.name) || `pool-${Date.now()}`)
  const out: ResourcePool = {
    id,
    name: draft.name.trim() || id,
    type: draft.type,
    memberIds: draft.type === 'query' ? [] : draft.memberIds,
    strategy: draft.strategy,
    ...(base?.disabled !== undefined ? { disabled: base.disabled } : {}),
    ...(base?.rrCursor !== undefined ? { rrCursor: base.rrCursor } : {}),
  }
  if (draft.type === 'query' || draft.type === 'hybrid') {
    const query = composeQuery(draft.capabilities, draft.withinMiles, draft.preserved)
    if (query) (out as { query?: ResourceQuery }).query = query
  }
  return out
}

function composeQuery(
  capabilityIds: readonly string[],
  withinMiles: number | null,
  preserved: readonly ResourceQuery[],
): ResourceQuery | null {
  const clauses: ResourceQuery[] = []
  for (const id of capabilityIds) {
    clauses.push({ op: 'eq', path: `meta.capabilities.${id}`, value: true })
  }
  if (withinMiles != null && Number.isFinite(withinMiles)) {
    clauses.push({
      op: 'within',
      path: 'meta.location',
      from: { kind: 'proposed' },
      miles: withinMiles,
    })
  }
  // Append preserved clauses verbatim so editing a pool that has
  // advanced rules (gte, or, not, …) doesn't drop them on save.
  clauses.push(...preserved)
  if (clauses.length === 0) return null
  if (clauses.length === 1) return clauses[0]!
  return { op: 'and', clauses }
}

function deriveCapabilityCatalog(resources: readonly EngineResource[]): readonly CapabilityOption[] {
  const seen = new Map<string, CapabilityOption>()
  for (const r of resources) {
    const caps = (r.meta?.['capabilities'] ?? null) as Record<string, unknown> | null
    if (!caps || typeof caps !== 'object') continue
    for (const [id, v] of Object.entries(caps)) {
      if (typeof v !== 'boolean') continue   // numeric capabilities need range UI; skip in v1
      if (seen.has(id)) continue
      seen.set(id, { id, label: humanize(id) })
    }
  }
  return Array.from(seen.values())
}

function previewStats(
  pool: ResourcePool,
  resources: readonly EngineResource[],
): { matched: number; excluded: number } {
  if (pool.type === 'manual' || pool.type === undefined) {
    const known = new Set(resources.map(r => r.id))
    const matched = pool.memberIds.filter(id => known.has(id)).length
    return { matched, excluded: pool.memberIds.length - matched }
  }
  if (!pool.query) return { matched: 0, excluded: resources.length }
  const result = evaluateQuery(pool.query, resources)
  if (pool.type === 'hybrid') {
    const allowed = new Set(result.matched)
    const matched = pool.memberIds.filter(id => allowed.has(id)).length
    return { matched, excluded: resources.length - matched }
  }
  return { matched: result.matched.length, excluded: result.excluded.length }
}

function normalizeResources(
  resources: ReadonlyMap<string, EngineResource> | readonly EngineResource[] | undefined,
): readonly EngineResource[] {
  if (!resources) return []
  if (resources instanceof Map) return Array.from(resources.values())
  return resources as readonly EngineResource[]
}

function humanize(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

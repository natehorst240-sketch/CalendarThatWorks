/**
 * PoolCard — read-only summary card for a `ResourcePool` (issue #386).
 *
 * Shows the pool's friendly name, plain-English summary of its
 * rules, the chosen strategy, and an optional live "Matches N
 * resources" count when a registry is provided. Renders for any
 * pool type (manual / query / hybrid). Mounting is the host's call
 * — drop one in a settings tab, a config sidebar, a profile picker.
 *
 * The card itself is read-only; pass `onEdit` to surface an Edit
 * button that opens whatever builder the host has wired (typically
 * `PoolBuilder` from this directory).
 */
import type { ReactNode } from 'react'
import type { ResourcePool } from '../../core/pools/resourcePoolSchema'
import type { EngineResource } from '../../core/engine/schema/resourceSchema'
import { evaluateQuery } from '../../core/pools/evaluateQuery'
import { summarizePool } from './poolSummary'
import styles from './PoolCard.module.css'

export interface PoolCardProps {
  readonly pool: ResourcePool
  /**
   * Live registry — when provided, the card runs `evaluateQuery`
   * against it to render "Matches N resources" / readiness counts.
   * Omit to skip the live stats.
   */
  readonly resources?: ReadonlyMap<string, EngineResource> | readonly EngineResource[]
  /** Called when the user clicks the Edit button. Omit to hide it. */
  readonly onEdit?: () => void
  /** Called when the user clicks the Disable / Enable toggle. */
  readonly onToggleDisabled?: () => void
  /** Optional slot for host-provided actions (e.g. Delete). */
  readonly actions?: ReactNode
}

export default function PoolCard({
  pool, resources, onEdit, onToggleDisabled, actions,
}: PoolCardProps) {
  const summary = summarizePool(pool)
  const stats   = resources ? computeStats(pool, resources) : null

  return (
    <article
      className={styles['card']}
      data-disabled={pool.disabled ? 'true' : 'false'}
      aria-label={`Pool: ${pool.name}`}
    >
      <header className={styles['head']}>
        <div className={styles['titleBlock']}>
          <h3 className={styles['title']}>{pool.name}</h3>
          <span className={styles['typeChip']} data-type={pool.type ?? 'manual'}>
            {summary.typeLabel}
          </span>
          {pool.disabled && (
            <span className={styles['disabledChip']}>Disabled</span>
          )}
        </div>
        <div className={styles['actions']}>
          {onEdit && (
            <button type="button" className={styles['editBtn']} onClick={onEdit}>
              Edit
            </button>
          )}
          {onToggleDisabled && (
            <button
              type="button"
              className={styles['toggleBtn']}
              onClick={onToggleDisabled}
              aria-label={pool.disabled ? `Enable pool ${pool.name}` : `Disable pool ${pool.name}`}
            >
              {pool.disabled ? 'Enable' : 'Disable'}
            </button>
          )}
          {actions}
        </div>
      </header>

      {summary.clauseLabels.length > 0 && (
        <ul className={styles['clauseList']} aria-label="Pool rules">
          {summary.clauseLabels.map((c) => (
            <li key={c} className={styles['clauseChip']}>{c}</li>
          ))}
        </ul>
      )}

      <footer className={styles['foot']}>
        <span className={styles['strategy']} aria-label={`Selection: ${summary.strategyLabel}`}>
          {summary.strategyLabel}
        </span>
        {stats && (
          <span
            className={styles['stats']}
            data-testid="pool-card-stats"
            aria-label={`${stats.matched} matched, ${stats.excluded} excluded`}
          >
            <strong>{stats.matched}</strong>{' '}
            {stats.matched === 1 ? 'match' : 'matches'}
            {stats.excluded > 0 && (
              <span className={styles['excluded']}>
                {' '}· {stats.excluded} excluded
              </span>
            )}
          </span>
        )}
      </footer>
    </article>
  )
}

function computeStats(
  pool: ResourcePool,
  resources: ReadonlyMap<string, EngineResource> | readonly EngineResource[],
): { matched: number; excluded: number } {
  const list = resources instanceof Map
    ? Array.from(resources.values())
    : (resources as readonly EngineResource[])
  const known = new Set(list.map(r => r.id))

  if (pool.type === 'manual' || pool.type === undefined) {
    const matched = pool.memberIds.filter(id => known.has(id)).length
    return { matched, excluded: pool.memberIds.length - matched }
  }
  if (!pool.query) return { matched: 0, excluded: list.length }
  const result = evaluateQuery(pool.query, list)
  if (pool.type === 'hybrid') {
    const allowed = new Set(result.matched)
    const matched = pool.memberIds.filter(id => allowed.has(id)).length
    return { matched, excluded: list.length - matched }
  }
  return { matched: result.matched.length, excluded: result.excluded.length }
}

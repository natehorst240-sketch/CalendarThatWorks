/**
 * AdvancedRulesEditor — flat list manager for advanced query
 * clauses (issue #386 Level 3).
 *
 * Each row shows a clause's plain-English summary + a Remove button.
 * Editing a row toggles a `ClauseEditor` inline. New clauses are
 * added via "+ Add rule".
 *
 * Pure / controlled — operates on a `ResourceQuery[]` and emits
 * changes via `onChange`. The parent (`PoolBuilder`) owns the array
 * and AND-merges it with the simple-form clauses on save.
 */
import { useMemo, useState } from 'react'
import type { ResourceQuery } from 'works-calendar-engine'
import type { EngineResource } from 'works-calendar-engine'
import ClauseEditor from './ClauseEditor'
import { summarizeQuery } from './poolSummary'
import { validateClausePaths } from './validateClausePaths'
import styles from './AdvancedRulesEditor.module.css'

export interface AdvancedRulesEditorProps {
  readonly clauses: readonly ResourceQuery[]
  readonly onChange: (next: readonly ResourceQuery[]) => void
  /**
   * Optional path-autocomplete suggestions, threaded down to each
   * `ClauseEditor`. Hosts compose this from
   * `derivePathSuggestions(resources)`.
   */
  readonly pathSuggestions?: readonly string[] | undefined
  /**
   * Optional live registry. When provided, each row computes
   * `validateClausePaths` and surfaces a warning chip on the
   * summary when one or more paths in the clause don't resolve on
   * any resource. The chip is informational; it never blocks
   * editing — paths that don't resolve today are sometimes
   * intentional (forward-looking schemas / optional capabilities).
   */
  readonly resources?: ReadonlyMap<string, EngineResource> | readonly EngineResource[] | undefined
}

const DEFAULT_NEW_CLAUSE: ResourceQuery = { op: 'eq', path: '', value: '' }

export default function AdvancedRulesEditor({
  clauses, onChange, pathSuggestions, resources,
}: AdvancedRulesEditorProps): JSX.Element {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Per-row path validation against the live registry. Re-runs only
  // when the clause list or registry changes; cheap enough to do
  // inline since each clause is small and the registry is bounded.
  const unresolvedByRow = useMemo(() => {
    if (!resources) return [] as ReadonlyArray<ReadonlySet<string>>
    return clauses.map(c => validateClausePaths(c, resources).byPath)
  }, [clauses, resources])

  const updateAt = (index: number, next: ResourceQuery) =>
    onChange(clauses.map((c, i) => i === index ? next : c))
  const removeAt = (index: number) => {
    onChange(clauses.filter((_, i) => i !== index))
    if (editingIndex === index) setEditingIndex(null)
  }
  const addNew = () => {
    onChange([...clauses, DEFAULT_NEW_CLAUSE])
    setEditingIndex(clauses.length) // open the new row in edit mode
  }
  const moveBy = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= clauses.length) return
    const next = [...clauses]
    const tmp = next[index]!
    next[index] = next[target]!
    next[target] = tmp
    onChange(next)
    // Keep the editor focus on the moved clause if it was open.
    if (editingIndex === index) setEditingIndex(target)
    else if (editingIndex === target) setEditingIndex(index)
  }

  return (
    <div className={styles['root']} aria-label="Advanced rules editor">
      {clauses.length === 0 && (
        <p className={styles['empty']}>
          No advanced rules yet. Use these to express AND/OR/NOT logic, numeric
          ranges, fixed-point distances, or any other rule the simple form
          doesn’t cover.
        </p>
      )}
      <ul className={styles['list']}>
        {clauses.map((c, i) => {
          const phrase = summarizeQuery(c).join(' & ') || `${c.op}(...)`
          const isEditing = editingIndex === i
          const unresolved = unresolvedByRow[i] ?? null
          const unresolvedCount = unresolved ? unresolved.size : 0
          return (
            <li key={i} className={styles['row']} data-has-unresolved={unresolvedCount > 0 ? 'true' : undefined}>
              <div className={styles['rowHead']}>
                <span className={styles['summary']} data-testid={`advanced-rule-summary-${i}`}>
                  {phrase}
                </span>
                {unresolvedCount > 0 && (
                  <span
                    className={styles['warningChip']}
                    role="status"
                    title={`${unresolvedCount} path(s) don't resolve on any live resource: ${[...unresolved!].join(', ')}`}
                    data-testid={`advanced-rule-warning-${i}`}
                  >
                    ⚠ {unresolvedCount} unresolved
                  </span>
                )}
                <span className={styles['rowActions']}>
                  <button
                    type="button"
                    className={styles['rowBtn']}
                    onClick={() => moveBy(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move rule ${i + 1} up`}
                  >↑</button>
                  <button
                    type="button"
                    className={styles['rowBtn']}
                    onClick={() => moveBy(i, 1)}
                    disabled={i === clauses.length - 1}
                    aria-label={`Move rule ${i + 1} down`}
                  >↓</button>
                  <button
                    type="button"
                    className={styles['rowBtn']}
                    onClick={() => setEditingIndex(isEditing ? null : i)}
                    aria-expanded={isEditing}
                    aria-controls={`advanced-rule-body-${i}`}
                  >
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    className={styles['rowBtn']}
                    onClick={() => removeAt(i)}
                    aria-label={`Remove rule ${i + 1}`}
                  >
                    Remove
                  </button>
                </span>
              </div>
              {isEditing && (
                <div id={`advanced-rule-body-${i}`} className={styles['rowBody']}>
                  <ClauseEditor
                    clause={c}
                    pathSuggestions={pathSuggestions}
                    unresolvedPaths={unresolved ?? undefined}
                    onChange={(next) => updateAt(i, next)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button type="button" className={styles['addBtn']} onClick={addNew}>
        + Add rule
      </button>
    </div>
  )
}

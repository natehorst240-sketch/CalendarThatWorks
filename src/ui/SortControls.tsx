import { useMemo } from 'react'
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react'
import type { SortConfig, SortDirection } from '../types/grouping.ts'
import styles from '../styles/SortControls.module.css'

export type SortField = {
  /** Event field key (passed as SortConfig.field when selected). */
  key: string
  /** Human-readable label shown in the field dropdown. */
  label: string
}

export type SortControlsProps = {
  /** Current ordered list of sort criteria. */
  value: SortConfig[]
  /** Called with the next list whenever the user edits a row. */
  onChange: (next: SortConfig[]) => void
  /** Fields the user can sort by. Duplicate picks are allowed; order matters. */
  fields: SortField[]
  /** Maximum number of sort rows (default: 3 — matches grouping-depth cap). */
  maxSorts?: number
  /** Label used above the control (default: "Sort by"). */
  label?: string
  className?: string
  id?: string
}

const DEFAULT_MAX = 3

export default function SortControls({
  value,
  onChange,
  fields,
  maxSorts = DEFAULT_MAX,
  label = 'Sort by',
  className,
  id,
}: SortControlsProps) {
  const defaultField = fields[0]?.key ?? ''
  const canAdd = value.length < maxSorts && fields.length > 0

  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const f of fields) map[f.key] = f.label
    return map
  }, [fields])

  const updateAt = (index: number, patch: Partial<SortConfig>) => {
    const next = value.map((entry, i) =>
      i === index ? { ...entry, ...patch } : entry,
    )
    onChange(next)
  }

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const addRow = () => {
    if (!canAdd) return
    onChange([...value, { field: defaultField, direction: 'asc' }])
  }

  const clearAll = () => onChange([])

  return (
    <div id={id} className={[styles.root, className].filter(Boolean).join(' ')}>
      <div className={styles.headerRow}>
        <span className={styles.label}>{label}</span>
        {value.length > 0 && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={clearAll}
            aria-label="Clear all sort criteria"
          >
            Clear
          </button>
        )}
      </div>

      {value.length === 0 ? (
        <p className={styles.emptyHint} aria-live="polite">
          No sort applied.
        </p>
      ) : (
        <ul className={styles.rows} role="list">
          {value.map((entry, index) => {
            const currentLabel = fieldLabelMap[entry.field] ?? entry.field
            const tiebreakerHint = index > 0 ? 'then' : 'by'
            return (
              <li key={index} className={styles.row}>
                <span className={styles.rowHint} aria-hidden="true">
                  {tiebreakerHint}
                </span>
                <label
                  className={styles.srOnly}
                  htmlFor={`sort-field-${index}`}
                >
                  Sort field {index + 1}
                </label>
                <select
                  id={`sort-field-${index}`}
                  className={styles.fieldSelect}
                  value={entry.field}
                  onChange={e => updateAt(index, { field: e.target.value })}
                >
                  {fields.map(f => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                  {!fieldLabelMap[entry.field] && (
                    <option value={entry.field}>{entry.field}</option>
                  )}
                </select>

                <DirectionToggle
                  direction={entry.direction}
                  fieldLabel={currentLabel}
                  onChange={direction => updateAt(index, { direction })}
                />

                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeAt(index)}
                  aria-label={`Remove sort by ${currentLabel}`}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        className={styles.addBtn}
        onClick={addRow}
        disabled={!canAdd}
        aria-label="Add sort criterion"
      >
        <Plus size={14} />
        <span>Add sort</span>
      </button>
    </div>
  )
}

type DirectionToggleProps = {
  direction: SortDirection
  fieldLabel: string
  onChange: (direction: SortDirection) => void
}

function DirectionToggle({
  direction,
  fieldLabel,
  onChange,
}: DirectionToggleProps) {
  const next: SortDirection = direction === 'asc' ? 'desc' : 'asc'
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown
  const readableDir = direction === 'asc' ? 'ascending' : 'descending'
  return (
    <button
      type="button"
      className={styles.directionBtn}
      data-direction={direction}
      onClick={() => onChange(next)}
      aria-label={`Sort ${fieldLabel} ${readableDir}; click to toggle`}
      title={direction === 'asc' ? 'Ascending' : 'Descending'}
    >
      <Icon size={14} />
      <span>{direction === 'asc' ? 'Asc' : 'Desc'}</span>
    </button>
  )
}

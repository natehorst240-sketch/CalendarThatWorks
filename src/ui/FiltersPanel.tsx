/**
 * FiltersPanel — Notion-style nested AND/OR condition builder with
 * sentence-style rows. Primary filter UI in the sidebar.
 *
 * Uses the shared useConditionBuilder hook for condition state management.
 */
import { useEffect, useMemo } from 'react';
import { Plus, X, Filter } from 'lucide-react';
import type { UseConditionBuilderResult } from '../hooks/useConditionBuilder';
import type { FilterField } from '../filters/filterSchema';
import styles from './FiltersPanel.module.css';

export type FiltersPanelProps = {
  /** Condition builder state from useConditionBuilder hook. */
  builder: UseConditionBuilderResult;
  /** Schema for field options. */
  schema: FilterField[];
  /** Current event items (for dynamic option lists). */
  items: unknown[];
  /** Called when filters change (debounced live preview). */
  onFiltersChange?: (filters: Record<string, unknown>) => void;
};

export default function FiltersPanel({
  builder,
  schema,
  items,
  onFiltersChange,
}: FiltersPanelProps) {
  const {
    conditions,
    fieldOptions,
    operatorMap,
    addCondition,
    updateCondition,
    removeCondition,
    clearConditions,
    activeCount,
  } = builder;

  // Live preview: convert conditions to filters whenever they change
  useEffect(() => {
    if (!onFiltersChange) return;
    const filters = builder.toFilters();
    onFiltersChange(filters);
  }, [conditions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fieldOptions.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <Filter size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
          <div>No filterable fields available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Condition rows */}
      <div>
        {conditions.map((cond, index) => {
          const fieldDef = schema.find(f => f.key === cond.field);
          const options = fieldDef?.options
            ?? (fieldDef?.getOptions ? fieldDef.getOptions(items) : null);

          return (
            <div key={cond.id} className={styles.conditionWrap}>
              {/* Logic connector (AND / OR) */}
              {index > 0 && (
                <div className={styles.logicRow}>
                  {(['AND', 'OR'] as const).map(lbl => (
                    <button
                      key={lbl}
                      className={[
                        styles.logicBtn,
                        cond.logic === lbl && styles.logicActive,
                      ].filter(Boolean).join(' ')}
                      onClick={() => updateCondition(cond.id, { logic: lbl })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              {/* Sentence-style row: [Field] [Operator] [Value] [X] */}
              <div className={styles.conditionRow}>
                <select
                  className={styles.select}
                  value={cond.field}
                  onChange={e => updateCondition(cond.id, { field: e.target.value })}
                  aria-label="Filter field"
                >
                  {fieldOptions.map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>

                <select
                  className={styles.select}
                  value={cond.operator}
                  onChange={e => updateCondition(cond.id, { operator: e.target.value })}
                  aria-label="Filter operator"
                >
                  {(operatorMap[cond.field] ?? []).map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {options && options.length > 0 ? (
                  <select
                    className={[styles.select, styles.valueSelect].join(' ')}
                    value={cond.value}
                    onChange={e => updateCondition(cond.id, { value: e.target.value })}
                    aria-label="Filter value"
                  >
                    <option value="">Select...</option>
                    {options.map(opt => (
                      <option key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={[styles.input, styles.valueInput].join(' ')}
                    type="text"
                    value={cond.value}
                    onChange={e => updateCondition(cond.id, { value: e.target.value })}
                    placeholder="Value..."
                    aria-label="Filter value"
                  />
                )}

                <button
                  className={styles.removeBtn}
                  onClick={() => removeCondition(cond.id)}
                  disabled={conditions.length <= 1}
                  aria-label="Remove condition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add condition buttons */}
      <div className={styles.addRow}>
        <button className={styles.addBtn} onClick={() => addCondition('AND')}>
          <Plus size={13} /> AND
        </button>
        <button className={styles.addBtn} onClick={() => addCondition('OR')}>
          <Plus size={13} /> OR
        </button>
      </div>

      {/* Clear all */}
      {activeCount > 0 && (
        <div className={styles.clearRow}>
          <button className={styles.clearLink} onClick={clearConditions}>
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

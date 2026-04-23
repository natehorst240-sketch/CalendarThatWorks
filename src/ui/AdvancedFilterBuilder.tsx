/**
 * AdvancedFilterBuilder — Visual AND/OR condition builder for Smart Views.
 *
 * Lets users compose multi-condition filters with explicit AND / OR logic
 * between each row, then save the result as a named Smart View.
 *
 * Props:
 *   schema           FilterField[]  — schema driving available fields + operators
 *                                     (defaults to DEFAULT_FILTER_SCHEMA)
 *   items            unknown[]      — current event list; passed to field.getOptions()
 *                                     for dynamic option lists (defaults to [])
 *   categories       string[]  — kept for backwards-compat; ignored when schema wired
 *   resources        string[]  — same
 *   onSave           (name, filters, conditions) => void
 *                              — called when user saves; `filters` is a live
 *                                filter-state object (with Sets) ready for
 *                                useSavedViews.saveView(); `conditions` is the
 *                                raw condition array stored as metadata.
 *   initialName      string    — (edit mode) pre-fill the view name field
 *   initialConditions array   — (edit mode) pre-fill condition rows
 *   editingId        string    — (edit mode) id of the view being edited;
 *                                changes Save button to "Update Smart View" and
 *                                calls onUpdate instead of onSave
 *   onUpdate         (id, name, filters, conditions) => void
 *                              — (edit mode) called instead of onSave when
 *                                editingId is set
 *   onCancelEdit     () => void — (edit mode) called when user cancels editing
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema';
import type { FilterField, FilterOption } from '../filters/filterSchema';
import { useConditionBuilder } from '../hooks/useConditionBuilder';
import type { Condition } from '../hooks/useConditionBuilder';
import styles from './AdvancedFilterBuilder.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AdvancedFilterBuilderProps = {
  schema?: FilterField[];
  items?: unknown[];
  onSave?: (name: string, filters: Record<string, unknown>, conditions: Condition[]) => void;
  categories?: unknown[];
  resources?: unknown[];
  initialName?: string;
  initialConditions?: unknown[] | null;
  editingId?: string | null;
  onUpdate?: (id: string, name: string, filters: Record<string, unknown>, conditions: Condition[]) => void;
  onCancelEdit?: () => void;
};

/** Safely coerce an unknown value from persisted storage into a typed Condition. */
function toCondition(input: unknown, fallbackFieldKey: string): Condition {
  const c = (input ?? {}) as Partial<Condition>;
  return {
    id:       '',   // hook assigns a fresh id in its useState initializer
    field:    typeof c.field    === 'string' ? c.field    : fallbackFieldKey,
    operator: typeof c.operator === 'string' ? c.operator : 'is',
    value:    typeof c.value    === 'string' ? c.value    : '',
    logic:    c.logic === 'OR' ? 'OR' : 'AND',
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdvancedFilterBuilder({
  schema = DEFAULT_FILTER_SCHEMA,
  items = [],
  onSave,
  categories = [],
  resources = [],
  initialName = '',
  initialConditions = null,
  editingId = null,
  onUpdate,
  onCancelEdit,
}: AdvancedFilterBuilderProps) {
  void categories;
  void resources;

  // Pre-process unknown initial conditions into typed Condition[] for the hook.
  // Computed once on mount — the parent remounts via key={editingId} on switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initializer
  const safeInitialConditions = useMemo<Condition[] | null>(() => {
    if (!initialConditions || initialConditions.length === 0) return null;
    const firstKey = schema.filter(f => f.type !== 'date-range')[0]?.key ?? 'categories';
    return initialConditions.map(c => toCondition(c, firstKey));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    conditions, fieldOptions, operatorMap,
    addCondition, updateCondition, removeCondition,
    clearConditions, toFilters,
  } = useConditionBuilder({ schema, initialConditions: safeInitialConditions });

  const [viewName,  setViewName]  = useState(initialName);
  const [nameError, setNameError] = useState('');
  const [saved,     setSaved]     = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef       = useRef<HTMLDivElement | null>(null);
  const nameInputRef  = useRef<HTMLInputElement | null>(null);

  // Clear the "Saved!" feedback timeout on unmount to avoid state updates on
  // an unmounted component (can happen in edit mode when the parent unmounts
  // the builder immediately after onUpdate).
  useEffect(() => () => { clearTimeout(savedTimerRef.current); }, []);

  // On mount in edit mode, scroll the builder into view and focus the name
  // input so users immediately see the editor populate after clicking pencil.
  // The parent remounts this component via `key={editingId}` on each edit
  // switch, so this mount-only effect runs exactly when a new target is chosen.
  useEffect(() => {
    if (editingId == null) return;
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only on edit open
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────

  const showSaved = () => {
    setSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = () => {
    const name = viewName.trim();
    if (!name) { setNameError('Enter a name for this Smart View.'); return; }
    setNameError('');
    const filters = toFilters();
    if (editingId && onUpdate) {
      onUpdate(editingId, name, filters, conditions);
      showSaved();
    } else {
      onSave?.(name, filters, conditions);
      showSaved();
      setViewName('');
      clearConditions();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.builder} ref={rootRef}>

      {/* ── Condition rows ── */}
      <div className={styles.conditions}>
        {conditions.map((cond, index) => {
          const fieldDef = schema.find((f) => f.key === cond.field);
          const options: FilterOption[] | null = fieldDef?.options
                        ?? (fieldDef?.getOptions ? fieldDef.getOptions(items) : null);
          return (
            <div key={cond.id} className={styles.conditionWrap}>

              {/* Logic connector (AND / OR) between rows */}
              {index > 0 && (
                <div className={styles.logicRow}>
                  {(['AND', 'OR'] as const).map((lbl) => (
                    <button
                      key={lbl}
                      className={[styles.logicBtn, cond.logic === lbl && styles.logicActive].filter(Boolean).join(' ')}
                      onClick={() => updateCondition(cond.id, { logic: lbl })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              {/* Condition parts */}
              <div className={styles.conditionRow}>
                {/* Field */}
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

                {/* Operator */}
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

                {/* Value — dropdown if options available, else text */}
                {options && options.length > 0 ? (
                  <select
                    className={[styles.select, styles.valueSelect].join(' ')}
                    value={cond.value}
                    onChange={e => updateCondition(cond.id, { value: e.target.value })}
                    aria-label="Filter value"
                  >
                    <option value="">Select…</option>
                    {options.map(opt => (
                      <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={[styles.input, styles.valueInput].join(' ')}
                    type="text"
                    value={cond.value}
                    onChange={e => updateCondition(cond.id, { value: e.target.value })}
                    placeholder="Value…"
                    aria-label="Filter value"
                  />
                )}

                {/* Remove */}
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

      {/* ── Add condition buttons ── */}
      <div className={styles.addRow}>
        <button className={styles.addBtn} onClick={() => addCondition('AND')}>
          <Plus size={13} /> AND
        </button>
        <button className={styles.addBtn} onClick={() => addCondition('OR')}>
          <Plus size={13} /> OR
        </button>
      </div>

      {/* ── Save as Smart View ── */}
      <div className={styles.saveSection}>
        <div className={styles.nameField}>
          <label htmlFor="afb-view-name" className={styles.srOnly}>Smart View name</label>
          <input
            id="afb-view-name"
            ref={nameInputRef}
            className={[styles.input, styles.nameInput, nameError ? styles.inputError : ''].filter(Boolean).join(' ')}
            type="text"
            value={viewName}
            onChange={e => { setViewName(e.target.value); if (nameError) setNameError(''); }}
            placeholder="Name this Smart View…"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          {nameError && <span className={styles.errorMsg}>{nameError}</span>}
        </div>
        <button className={[styles.saveBtn, saved ? styles.saveBtnSaved : ''].filter(Boolean).join(' ')} onClick={handleSave}>
          {saved ? <><Check size={13} /> Saved!</> : (editingId ? 'Update Smart View' : 'Save Smart View')}
        </button>
        {editingId && onCancelEdit && (
          <button className={styles.cancelBtn} onClick={onCancelEdit}>Cancel</button>
        )}
      </div>
    </div>
  );
}

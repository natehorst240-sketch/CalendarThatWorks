/**
 * AdvancedFilterBuilder.jsx — Visual AND/OR condition builder for Smart Views.
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
import { createId } from '../core/createId';
import { DEFAULT_FILTER_SCHEMA, defaultOperatorsForType } from '../filters/filterSchema';
import { conditionsToFilters } from '../filters/conditionEngine';
import styles from './AdvancedFilterBuilder.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCondition(logic = 'AND', firstFieldKey = 'categories') {
  return { id: createId('cond'), field: firstFieldKey, operator: 'is', value: '', logic };
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
}: any) {
  // Exclude date-range fields from the condition builder field list
  const fieldOptions = useMemo(
    () => schema.filter(f => f.type !== 'date-range'),
    [schema]
  );

  // Operator map keyed by field.key — falls back to defaultOperatorsForType
  const operatorMap = useMemo(() => {
    const map = {};
    for (const f of fieldOptions) {
      map[f.key] = f.operators ?? defaultOperatorsForType(f.type);
    }
    return map;
  }, [fieldOptions]);

  const firstFieldKey = fieldOptions[0]?.key ?? 'categories';

  const [conditions, setConditions] = useState(() =>
    initialConditions && initialConditions.length > 0
      ? initialConditions.map(c => ({ ...c, id: createId('cond') }))
      : [makeCondition('AND', firstFieldKey)]
  );
  const [viewName,   setViewName]   = useState(initialName);
  const [nameError,  setNameError]  = useState('');
  const [saved,      setSaved]      = useState(false);
  const savedTimerRef = useRef(null);
  const rootRef       = useRef(null);
  const nameInputRef  = useRef(null);

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

  // ── Condition mutations ─────────────────────────────────────────────────

  const addCondition = (logic) => {
    setConditions(prev => [...prev, makeCondition(logic, firstFieldKey)]);
  };

  const updateCondition = (id, updates) => {
    setConditions(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, ...updates };
      // Reset operator + value when field changes
      if (updates.field && updates.field !== c.field) {
        next.operator = operatorMap[updates.field]?.[0]?.value ?? 'is';
        next.value    = '';
      }
      return next;
    }));
  };

  const removeCondition = (id) => {
    setConditions(prev => prev.length > 1 ? prev.filter(c => c.id !== id) : prev);
  };

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = () => {
    const name = viewName.trim();
    if (!name) {
      setNameError('Enter a name for this Smart View.');
      return;
    }
    setNameError('');
    const filters = conditionsToFilters(conditions, schema);
    if (editingId && onUpdate) {
      onUpdate(editingId, name, filters, conditions);
      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } else {
      onSave?.(name, filters, conditions);
      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      setViewName('');
      setConditions([makeCondition('AND', firstFieldKey)]);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.builder} ref={rootRef}>

      {/* ── Condition rows ── */}
      <div className={styles.conditions}>
        {conditions.map((cond, index) => {
          const fieldDef = schema.find(f => f.key === cond.field);
          const options  = fieldDef?.options
                        ?? (fieldDef?.getOptions ? fieldDef.getOptions(items) : null);
          return (
            <div key={cond.id} className={styles.conditionWrap}>

              {/* Logic connector (AND / OR) between rows */}
              {index > 0 && (
                <div className={styles.logicRow}>
                  {(['AND', 'OR']).map(lbl => (
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

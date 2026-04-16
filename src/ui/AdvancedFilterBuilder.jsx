/**
 * AdvancedFilterBuilder.jsx — Visual AND/OR condition builder for Smart Views.
 *
 * Lets users compose multi-condition filters with explicit AND / OR logic
 * between each row, then save the result as a named Smart View.
 *
 * Props:
 *   categories       string[]  — available category values for the value picker
 *   resources        string[]  — available resource/person values
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
import { useState, useEffect, useRef } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { createId } from '../core/createId.js';
import styles from './AdvancedFilterBuilder.module.css';

// ─── Static config ────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: 'category', label: 'Category' },
  { value: 'person',   label: 'Person'   },
  { value: 'title',    label: 'Title'    },
];

const OPERATORS = {
  category: [
    { value: 'is',     label: 'is'     },
    { value: 'is not', label: 'is not' },
  ],
  person: [
    { value: 'is',     label: 'is'     },
    { value: 'is not', label: 'is not' },
  ],
  title: [
    { value: 'contains',     label: 'contains'        },
    { value: 'not contains', label: 'does not contain' },
    { value: 'is',           label: 'is exactly'      },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Best-effort translation from visual conditions → standard filter state.
 * The standard engine treats multi-select fields as OR-within, AND-between,
 * which maps well onto most real-world use cases.
 */
function conditionsToFilters(conditions) {
  const categories = new Set();
  const resources  = new Set();
  let   search     = '';

  for (const cond of conditions) {
    const val = cond.value?.trim();
    if (!val) continue;

    if (cond.field === 'category' && cond.operator === 'is') {
      categories.add(val);
    } else if (cond.field === 'person' && cond.operator === 'is') {
      resources.add(val);
    } else if (cond.field === 'title' && cond.operator === 'contains') {
      search = val; // last wins for text search
    }
  }

  return { categories, resources, sources: new Set(), search, dateRange: null };
}

function makeCondition(logic = 'AND') {
  return { id: createId('cond'), field: 'category', operator: 'is', value: '', logic };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdvancedFilterBuilder({
  onSave,
  categories = [],
  resources = [],
  initialName = '',
  initialConditions = null,
  editingId = null,
  onUpdate,
  onCancelEdit,
}) {
  const [conditions, setConditions] = useState(() =>
    initialConditions && initialConditions.length > 0
      ? initialConditions.map(c => ({ ...c, id: createId('cond') }))
      : [makeCondition('AND')]
  );
  const [viewName,   setViewName]   = useState(initialName);
  const [nameError,  setNameError]  = useState('');
  const [saved,      setSaved]      = useState(false);
  const savedTimerRef = useRef(null);

  // Clear the "Saved!" feedback timeout on unmount to avoid state updates on
  // an unmounted component (can happen in edit mode when the parent unmounts
  // the builder immediately after onUpdate).
  useEffect(() => () => { clearTimeout(savedTimerRef.current); }, []);

  // Sync when switching to a different view for editing.
  // The parent uses `key={editingId}` to remount this component when the target
  // view changes, so this effect primarily handles the initial-mount hydration.
  // `initialName` and `initialConditions` are props derived from `editingId`
  // (they always change together with it), so listing `editingId` alone is the
  // correct stable signal. Adding the derived props would cause redundant resets
  // if the parent ever re-renders with new object/array references but the same
  // editing target — hence the intentional exclusion below.
  useEffect(() => {
    setViewName(initialName);
    setConditions(
      initialConditions && initialConditions.length > 0
        ? initialConditions.map(c => ({ ...c, id: createId('cond') }))
        : [makeCondition('AND')]
    );
    setNameError('');
    setSaved(false);
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps -- initialName/initialConditions are derived from editingId

  // ── Condition mutations ─────────────────────────────────────────────────

  const addCondition = (logic) => {
    setConditions(prev => [...prev, makeCondition(logic)]);
  };

  const updateCondition = (id, updates) => {
    setConditions(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, ...updates };
      // Reset operator + value when field type changes
      if (updates.field && updates.field !== c.field) {
        next.operator = OPERATORS[updates.field]?.[0]?.value ?? 'is';
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
    const filters = conditionsToFilters(conditions);
    if (editingId && onUpdate) {
      onUpdate(editingId, name, filters, conditions);
      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } else {
      onSave?.(name, filters, conditions);
      // Reset builder for another view
      setSaved(true);
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
      setViewName('');
      setConditions([makeCondition('AND')]);
    }
  };

  // ── Value picker: select when options available, text input otherwise ───

  const getOptions = (field) => {
    if (field === 'category') return categories;
    if (field === 'person')   return resources;
    return null;
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.builder}>

      {/* ── Condition rows ── */}
      <div className={styles.conditions}>
        {conditions.map((cond, index) => {
          const options = getOptions(cond.field);
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
                  {FIELD_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  className={styles.select}
                  value={cond.operator}
                  onChange={e => updateCondition(cond.id, { operator: e.target.value })}
                  aria-label="Filter operator"
                >
                  {(OPERATORS[cond.field] ?? []).map(op => (
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
                      <option key={opt} value={opt}>{opt}</option>
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

/**
 * ProfileBar.jsx — Saved-view chips with add/rename/delete/resave.
 */
import { useState, useRef, useEffect } from 'react';
import { Plus, Bookmark, BookmarkCheck, Pencil, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { buildFilterSummary } from '../filters/filterState.js';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema.js';
import styles from './ProfileBar.module.css';

const PROFILE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export default function ProfileBar({
  views,
  activeId,
  isDirty,
  schema = DEFAULT_FILTER_SCHEMA,
  onApply,
  onAdd,
  onResave,
  onUpdate,
  onDelete,
}) {
  const [saveOpen,    setSaveOpen]    = useState(false);
  const [manageId,    setManageId]    = useState(null); // which view is being managed
  const scrollRef = useRef(null);

  if (views.length === 0 && !saveOpen) {
    // Collapsed state — just a small "Save view" prompt
    return (
      <div className={styles.collapsed}>
        <button className={styles.saveHint} onClick={() => setSaveOpen(true)}>
          <Bookmark size={13} />
          Save current view…
        </button>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      {/* View chip strip */}
      <div className={styles.strip} ref={scrollRef}>
        {views.map(savedView => (
          <ViewChip
            key={savedView.id}
            savedView={savedView}
            schema={schema}
            isActive={savedView.id === activeId}
            isDirty={isDirty && savedView.id === activeId}
            isManaging={manageId === savedView.id}
            onApply={() => { onApply(savedView); setManageId(null); setSaveOpen(false); }}
            onManageToggle={() => setManageId(prev => prev === savedView.id ? null : savedView.id)}
            onResave={() => { onResave(savedView.id); setManageId(null); }}
            onDelete={() => { onDelete(savedView.id); setManageId(null); }}
            onRename={(name) => { onUpdate(savedView.id, { name }); setManageId(null); }}
            onColorChange={(color) => onUpdate(savedView.id, { color })}
          />
        ))}

        {/* Add button (inline in strip when views exist) */}
        {!saveOpen && (
          <button className={styles.addChip} onClick={() => { setSaveOpen(true); setManageId(null); }}
            title="Save current filters as a new saved view">
            <Plus size={13} />
            Save view
          </button>
        )}
      </div>

      {/* Save form */}
      {saveOpen && (
        <SaveForm
          onSave={(opts) => { onAdd(opts); setSaveOpen(false); }}
          onCancel={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── View Chip ─────────────────────────────────────────────── */
function ViewChip({ savedView, schema, isActive, isDirty, isManaging, onApply, onManageToggle,
  onResave, onDelete, onRename, onColorChange }) {

  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal]   = useState(savedView.name);
  const chipRef = useRef(null);

  // Close manage panel on outside click
  useEffect(() => {
    if (!isManaging) return;
    function handler(e) {
      if (chipRef.current && !chipRef.current.contains(e.target)) {
        onManageToggle();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isManaging, onManageToggle]);

  const color = savedView.color ?? '#64748b';

  // Build a summary string for the tooltip using schema-driven formatting
  const summaryItems = buildFilterSummary(savedView.filters, schema);
  const summaryParts = summaryItems.map(item => `${item.label}: ${item.displayValues.join(', ')}`);
  if (savedView.view) summaryParts.push(`View: ${savedView.view}`);
  const summary = summaryParts.length ? summaryParts.join(' \u00b7 ') : 'No filters applied';

  const chipClass = [styles.chip, isDirty && styles.dirty].filter(Boolean).join(' ');

  return (
    <div
      ref={chipRef}
      className={[styles.chipWrap, isActive && styles.chipWrapActive].filter(Boolean).join(' ')}
      style={{ '--chip-color': color }}
    >
      <button
        className={chipClass}
        onClick={onApply}
        title={summary}
      >
        {isActive
          ? <BookmarkCheck size={12} className={styles.chipIcon} />
          : <Bookmark size={12} className={styles.chipIcon} />
        }
        <span className={styles.chipName}>{savedView.name}</span>
        {isDirty && <span className={styles.dirtyDot} title="Filters changed since saved" />}
        {savedView.view && (
          <span className={styles.viewTag}>{savedView.view.slice(0,3)}</span>
        )}
      </button>

      {/* Manage toggle (pencil) — sibling of chip, not nested, to avoid invalid
          button-in-button and the associated mobile tap-handling issues. */}
      <button
        type="button"
        className={styles.manageBtn}
        onClick={e => { e.stopPropagation(); onManageToggle(); }}
        aria-label="Manage saved view"
      >
        <Pencil size={10} />
      </button>

      {/* Manage panel */}
      {isManaging && (
        <div className={styles.managePanel}>
          {/* Filter summary */}
          <div className={styles.summaryBlock}>
            <FilterSummary savedView={savedView} schema={schema} />
          </div>

          {/* Rename */}
          {renaming ? (
            <div className={styles.renameRow}>
              <input
                className={styles.renameInput}
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { onRename(nameVal); setRenaming(false); }
                  if (e.key === 'Escape') { setNameVal(savedView.name); setRenaming(false); }
                }}
                autoFocus
              />
              <button className={styles.iconBtn} onClick={() => { onRename(nameVal); setRenaming(false); }}>
                <Check size={13} />
              </button>
              <button className={styles.iconBtn} onClick={() => { setNameVal(savedView.name); setRenaming(false); }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <button className={styles.manageLine} onClick={() => setRenaming(true)}>
              <Pencil size={12} /> Rename
            </button>
          )}

          {/* Color picker */}
          <div className={styles.colorRow}>
            {PROFILE_COLORS.map(c => (
              <button
                key={c}
                className={[styles.colorDot, savedView.color === c && styles.colorDotActive].filter(Boolean).join(' ')}
                style={{ background: c }}
                onClick={() => onColorChange(c)}
                aria-label={`Set color ${c}`}
              />
            ))}
          </div>

          {/* Resave current filters */}
          <button className={styles.manageLine} onClick={onResave}>
            <RefreshCw size={12} /> Update with current filters
          </button>

          {/* Delete */}
          <button className={[styles.manageLine, styles.danger].join(' ')} onClick={onDelete}>
            <Trash2 size={12} /> Delete saved view
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Filter Summary (inside manage panel) ─────────────────────── */
function FilterSummary({ savedView, schema }) {
  const summaryItems = buildFilterSummary(savedView.filters, schema);

  if (summaryItems.length === 0 && !savedView.view) {
    return <p className={styles.summaryNone}>No filters — matches all events</p>;
  }

  return (
    <div className={styles.summary}>
      {summaryItems.map(item => (
        <div key={item.key} className={styles.summaryRow}>
          <span className={styles.summaryLabel}>{item.label}</span>
          <span className={styles.summaryTags}>
            {item.displayValues.map((dv, i) => (
              <span key={`${item.key}-${i}`} className={styles.tag}>{dv}</span>
            ))}
          </span>
        </div>
      ))}
      {savedView.view && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Pinned view</span>
          <span className={styles.summaryTags}>
            <span className={styles.tag}>{savedView.view}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Save Form ────────────────────────────────────────────────── */
function SaveForm({ onSave, onCancel }) {
  const [name,     setName]     = useState('');
  const [color,    setColor]    = useState(PROFILE_COLORS[0]);
  const [pinView,  setPinView]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    onSave({ name: trimmed, color, pinView });
  }

  return (
    <div className={styles.saveForm}>
      <input
        ref={inputRef}
        className={styles.nameInput}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder="View name, e.g. Agusta Inspections…"
      />

      {/* Color row */}
      <div className={styles.colorRow}>
        {PROFILE_COLORS.map(c => (
          <button
            key={c}
            className={[styles.colorDot, color === c && styles.colorDotActive].filter(Boolean).join(' ')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Choose color ${c}`}
          />
        ))}
      </div>

      <label className={styles.pinRow}>
        <input type="checkbox" checked={pinView} onChange={e => setPinView(e.target.checked)} />
        Also pin the current view (month/week/day…)
      </label>

      <div className={styles.saveActions}>
        <button className={styles.btnSave} onClick={handleSave} disabled={!name.trim()}>
          Save view
        </button>
        <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}



/**
 * CustomizeQuickViewsPanel — popover where saved views are organized.
 *
 * Moves the rename / color / delete / resave / edit-conditions affordances
 * that previously lived behind the pencil button on each chip into a single
 * surface. Also exposes a visibility toggle so users can pick which views
 * appear as chips in the ProfileBar strip.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Settings, Pencil, Trash2, RefreshCw, Check, X,
  Eye, EyeOff, Settings2, ChevronDown,
} from 'lucide-react';
import styles from './ProfileBar.module.css';

const PROFILE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

export default function CustomizeQuickViewsPanel({
  views,
  onRename,
  onColorChange,
  onResave,
  onDelete,
  onToggleVisibility,
  onEditConditions,
}: any) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.headerControl}>
      <button
        type="button"
        className={styles.headerBtn}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={views.length === 0}
        title={views.length === 0 ? 'Save a view first to customize' : 'Customize quick views'}
      >
        <Settings size={13} />
        <span>Customize Quick Views</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`${styles.dropdownPanel} ${styles.customizePanel}`}
          role="dialog"
          aria-label="Customize quick views"
        >
          {views.length === 0 ? (
            <p className={styles.dropdownEmpty}>No saved views yet.</p>
          ) : (
            <ul className={styles.customizeList}>
              {views.map((view: any) => (
                <CustomizeRow
                  key={view.id}
                  view={view}
                  onRename={onRename}
                  onColorChange={onColorChange}
                  onResave={onResave}
                  onDelete={onDelete}
                  onToggleVisibility={onToggleVisibility}
                  onEditConditions={onEditConditions}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CustomizeRow({
  view,
  onRename,
  onColorChange,
  onResave,
  onDelete,
  onToggleVisibility,
  onEditConditions,
}: any) {
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(view.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isHidden = !!view.hiddenFromStrip;
  const color = view.color ?? '#64748b';

  function commitRename() {
    const trimmed = nameVal.trim();
    if (!trimmed) {
      setNameVal(view.name);
      setRenaming(false);
      return;
    }
    if (trimmed !== view.name) onRename(view.id, trimmed);
    setRenaming(false);
  }

  return (
    <li className={styles.customizeRow} style={{ '--chip-color': color } as React.CSSProperties}>
      <div className={styles.customizeHeader}>
        {renaming ? (
          <div className={styles.renameRow}>
            <input
              className={styles.renameInput}
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { commitRename(); }
                if (e.key === 'Escape') { setNameVal(view.name); setRenaming(false); }
              }}
              autoFocus
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={commitRename}
              aria-label="Confirm rename"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => { setNameVal(view.name); setRenaming(false); }}
              aria-label="Cancel rename"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className={styles.customizeNameRow}>
            <span className={styles.customizeColorDot} style={{ background: color }} aria-hidden="true" />
            <span className={styles.customizeName}>{view.name}</span>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setRenaming(true)}
              aria-label={`Rename ${view.name}`}
            >
              <Pencil size={12} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.colorRow}>
        {PROFILE_COLORS.map(c => (
          <button
            key={c}
            type="button"
            className={[styles.colorDot, view.color === c && styles.colorDotActive].filter(Boolean).join(' ')}
            style={{ background: c }}
            onClick={() => onColorChange(view.id, c)}
            aria-label={`Set color ${c} for ${view.name}`}
          />
        ))}
      </div>

      <div className={styles.customizeActions}>
        <button
          type="button"
          className={styles.manageLine}
          onClick={() => onToggleVisibility(view.id)}
        >
          {isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
          {isHidden ? 'Show in quick views' : 'Hide from quick views'}
        </button>

        <button
          type="button"
          className={styles.manageLine}
          onClick={() => onResave(view.id)}
        >
          <RefreshCw size={12} /> Update with current filters
        </button>

        {onEditConditions && (
          <button
            type="button"
            className={styles.manageLine}
            onClick={() => onEditConditions(view.id)}
          >
            <Settings2 size={12} /> Edit conditions
          </button>
        )}

        {confirmDelete ? (
          <div className={styles.confirmRow} role="alertdialog" aria-label="Confirm delete">
            <span className={styles.confirmText}>Delete saved view?</span>
            <button
              type="button"
              className={[styles.confirmBtn, styles.confirmYes].join(' ')}
              onClick={() => { onDelete(view.id); setConfirmDelete(false); }}
              autoFocus
            >
              Yes, delete
            </button>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={[styles.manageLine, styles.danger].join(' ')}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={12} /> Delete saved view
          </button>
        )}
      </div>
    </li>
  );
}

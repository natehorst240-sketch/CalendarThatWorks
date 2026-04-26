/**
 * ViewsPanel — Save/load complete configurations (filters + groups + sort + view type).
 *
 * Lists saved views with one-click apply, save-current, rename, color change,
 * resave, delete, and visibility toggle (show/hide from ProfileBar chip strip).
 */
import { useState, useRef, useEffect } from 'react';
import {
  Plus, Bookmark, BookmarkCheck, Check,
  Pencil, Trash2, Eye, EyeOff, RefreshCw,
  CalendarDays, Calendar, Columns3, List, CalendarRange, Boxes, MapPin,
} from 'lucide-react';
import styles from './ViewsPanel.module.css';

const PROFILE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const VIEW_ICON_MAP: Record<string, { Icon: any; label: string }> = {
  month:    { Icon: CalendarDays,  label: 'Month' },
  week:     { Icon: Columns3,      label: 'Week' },
  day:      { Icon: Calendar,      label: 'Day' },
  agenda:   { Icon: List,          label: 'Agenda' },
  schedule: { Icon: CalendarRange, label: 'Schedule' },
  base:     { Icon: MapPin,        label: 'Base' },
  assets:   { Icon: Boxes,         label: 'Assets' },
};

export type ViewsPanelProps = {
  /** All saved views. */
  views: any[];
  /** Currently active view id. */
  activeId: string | null;
  /** Whether the active view has unsaved changes. */
  isDirty: boolean;
  /** Apply a saved view. */
  onApply: (view: any) => void;
  /** Save current state as a new view. */
  onSave: (name: string, color: string | null) => void;
  /** Resave current state into an existing view. */
  onResave: (id: string) => void;
  /** Update view metadata (name, color). */
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  /** Delete a view. */
  onDelete: (id: string) => void;
  /** Toggle strip visibility. */
  onToggleVisibility: (id: string) => void;
  /** Owner-customizable label for "Base" — affects the view-type tooltip. */
  locationLabel?: string;
  /** Owner-customizable label for "Asset" — affects the view-type tooltip. */
  assetsLabel?: string;
};

export default function ViewsPanel({
  views,
  activeId,
  isDirty,
  onApply,
  onSave,
  onResave,
  onUpdate,
  onDelete,
  onToggleVisibility,
  locationLabel = 'Base',
  assetsLabel = 'Asset',
}: ViewsPanelProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveColor, setSaveColor] = useState<string>(PROFILE_COLORS[0]!);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saveOpen) nameInputRef.current?.focus();
  }, [saveOpen]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    onSave(name, saveColor);
    setSaveName('');
    setSaveOpen(false);
  };

  const handleRename = (id: string) => {
    const name = renameValue.trim();
    if (!name) return;
    onUpdate(id, { name });
    setRenamingId(null);
  };

  return (
    <div className={styles['root']}>
      {/* Save current as view */}
      {!saveOpen ? (
        <button
          className={styles['saveBtn']}
          onClick={() => setSaveOpen(true)}
        >
          <Plus size={14} /> Save current as view
        </button>
      ) : (
        <div className={styles['saveForm']}>
          <div className={styles['saveFormRow']}>
            <input
              ref={nameInputRef}
              className={styles['nameInput']}
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="View name..."
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              aria-label="New view name"
            />
            <button
              className={styles['confirmBtn']}
              onClick={handleSave}
              disabled={!saveName.trim()}
            >
              <Check size={13} /> Save
            </button>
            <button className={styles['cancelBtn']} onClick={() => setSaveOpen(false)}>
              Cancel
            </button>
          </div>
          <div className={styles['colorRow']}>
            <span className={styles['colorLabel']}>Color:</span>
            {PROFILE_COLORS.map(c => (
              <div
                key={c}
                className={[styles['colorDot'], saveColor === c && styles['selected']].filter(Boolean).join(' ')}
                style={{ background: c }}
                onClick={() => setSaveColor(c)}
                role="radio"
                aria-checked={saveColor === c}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* View list */}
      {views.length === 0 ? (
        <div className={styles['empty']}>
          <Bookmark size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
          <div>No saved views yet</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Save your current filters and grouping as a view</div>
        </div>
      ) : (
        <div className={styles['viewList']}>
          {views.map(v => {
            const isActive = v.id === activeId;
            const viewInfo = v.view ? VIEW_ICON_MAP[v.view] : null;
            const ViewIcon = viewInfo?.Icon;
            const viewTooltip = viewInfo
              ? v.view === 'base'
                ? locationLabel
                : v.view === 'assets'
                  ? `${assetsLabel}s`
                  : viewInfo.label
              : '';

            return (
              <div
                key={v.id}
                className={[styles['viewItem'], isActive && styles['active']].filter(Boolean).join(' ')}
              >
                {/* Color dot */}
                <div
                  className={styles['viewColor']}
                  style={{ background: v.color || PROFILE_COLORS[0] }}
                />

                {/* Name (or rename input) */}
                {renamingId === v.id ? (
                  <input
                    ref={renameInputRef}
                    className={styles['renameInput']}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(v.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => handleRename(v.id)}
                    aria-label="Rename view"
                  />
                ) : (
                  <button
                    className={styles['viewName']}
                    onClick={() => onApply(v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    title={`Apply "${v.name}"`}
                  >
                    {v.name}
                  </button>
                )}

                {/* View type icon */}
                {ViewIcon && (
                  <span className={styles['viewIcon']} title={viewTooltip}>
                    <ViewIcon size={14} />
                  </span>
                )}

                {/* Active indicator */}
                {isActive && (
                  <BookmarkCheck size={14} style={{ color: 'var(--wc-accent)', flexShrink: 0 }} />
                )}

                {/* Action buttons */}
                <div className={styles['viewActions']}>
                  {/* Resave (only when active + dirty) */}
                  {isActive && isDirty && (
                    <button
                      className={styles['viewActionBtn']}
                      onClick={e => { e.stopPropagation(); onResave(v.id); }}
                      title="Update with current state"
                      aria-label={`Resave "${v.name}" with current state`}
                    >
                      <RefreshCw size={13} />
                    </button>
                  )}

                  {/* Rename */}
                  <button
                    className={styles['viewActionBtn']}
                    onClick={e => {
                      e.stopPropagation();
                      setRenamingId(v.id);
                      setRenameValue(v.name);
                    }}
                    title="Rename"
                    aria-label={`Rename "${v.name}"`}
                  >
                    <Pencil size={13} />
                  </button>

                  {/* Visibility toggle */}
                  <button
                    className={[
                      styles['viewActionBtn'],
                      v.hiddenFromStrip && styles['hidden'],
                    ].filter(Boolean).join(' ')}
                    onClick={e => { e.stopPropagation(); onToggleVisibility(v.id); }}
                    title={v.hiddenFromStrip ? 'Show in chip strip' : 'Hide from chip strip'}
                    aria-label={v.hiddenFromStrip ? `Show "${v.name}" in strip` : `Hide "${v.name}" from strip`}
                  >
                    {v.hiddenFromStrip ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>

                  {/* Delete */}
                  <button
                    className={[styles['viewActionBtn'], styles['danger']].join(' ')}
                    onClick={e => { e.stopPropagation(); onDelete(v.id); }}
                    title="Delete"
                    aria-label={`Delete "${v.name}"`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * ProfileBar — Saved-view header with quick-view chip strip and organizing controls.
 *
 * Layout:
 *   [All views ▾] [Customize Quick Views ▾] [Clear all filters] [+ Save view]
 *   [chip] [chip] [chip] ...   (only views where !hiddenFromStrip)
 *
 * Applying a saved view and seeing the "unsaved" dirty indicator still work
 * the same way. Renaming / recoloring / deleting / resaving now live in the
 * CustomizeQuickViewsPanel rather than behind a pencil button on each chip.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Plus, Bookmark, BookmarkCheck,
  CalendarDays, Calendar, Columns3, List, CalendarRange, Boxes,
} from 'lucide-react';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema';
import ViewsDropdown from './ViewsDropdown';
import CustomizeQuickViewsPanel from './CustomizeQuickViewsPanel';
import ClearFiltersButton from './ClearFiltersButton';
import styles from './ProfileBar.module.css';

const PROFILE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const VIEW_ICON_MAP = {
  month:    { Icon: CalendarDays,  label: 'Month view' },
  week:     { Icon: Columns3,      label: 'Week view' },
  day:      { Icon: Calendar,      label: 'Day view' },
  agenda:   { Icon: List,          label: 'Agenda view' },
  schedule: { Icon: CalendarRange, label: 'Schedule view' },
  assets:   { Icon: Boxes,         label: 'Assets view' },
};

export default function ProfileBar({
  views,
  activeId,
  isDirty,
  schema = DEFAULT_FILTER_SCHEMA,
  hasActiveFilters = false,
  onApply,
  onAdd,
  onResave,
  onUpdate,
  onDelete,
  onToggleVisibility,
  onClearFilters,
  onEditConditions,
}: any) {
  const [saveOpen, setSaveOpen] = useState(false);

  const visibleViews = views.filter((v: any) => !v.hiddenFromStrip);

  return (
    <div className={styles.bar}>
      <div className={styles.headerRow}>
        <ViewsDropdown
          views={views}
          activeId={activeId}
          onApply={(sv: any) => { onApply(sv); setSaveOpen(false); }}
          onToggleVisibility={onToggleVisibility}
        />

        <CustomizeQuickViewsPanel
          views={views}
          onRename={(id: string, name: string) => onUpdate(id, { name })}
          onColorChange={(id: string, color: string) => onUpdate(id, { color })}
          onResave={(id: string) => onResave(id)}
          onDelete={(id: string) => onDelete(id)}
          onToggleVisibility={onToggleVisibility}
          onEditConditions={onEditConditions}
        />

        <ClearFiltersButton
          hasActiveFilters={hasActiveFilters}
          onClear={onClearFilters}
        />

        <button
          type="button"
          className={styles.addChip}
          onClick={() => setSaveOpen(v => !v)}
          title="Save current filters as a new saved view"
        >
          <Plus size={13} />
          Save view
        </button>
      </div>

      {visibleViews.length > 0 && (
        <div className={styles.strip}>
          {visibleViews.map((savedView: any) => (
            <ViewChip
              key={savedView.id}
              savedView={savedView}
              isActive={savedView.id === activeId}
              isDirty={isDirty && savedView.id === activeId}
              onApply={() => { onApply(savedView); setSaveOpen(false); }}
            />
          ))}
        </div>
      )}

      {saveOpen && (
        <SaveForm
          onSave={(opts: any) => { onAdd(opts); setSaveOpen(false); }}
          onCancel={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── View Chip ─────────────────────────────────────────────── */
function ViewChip({ savedView, isActive, isDirty, onApply }: any) {
  const color = savedView.color ?? '#64748b';
  const viewIcon = savedView.view ? VIEW_ICON_MAP[savedView.view] : null;

  const chipClass = [styles.chip, isDirty && styles.dirty].filter(Boolean).join(' ');
  const wrapClass = [
    styles.chipWrap,
    isActive && styles.chipWrapActive,
    isDirty && styles.chipWrapDirty,
  ].filter(Boolean).join(' ');

  return (
    <div
      className={wrapClass}
      style={{ '--chip-color': color } as React.CSSProperties}
    >
      <button className={chipClass} onClick={onApply} title={savedView.name}>
        {isActive
          ? <BookmarkCheck size={12} className={styles.chipIcon} />
          : <Bookmark size={12} className={styles.chipIcon} />
        }
        <span className={styles.chipName}>{savedView.name}</span>
        {isDirty && (
          <span className={styles.dirtyTag} title="Filters changed since saved">
            <span className={styles.dirtyDot} />
            <span className={styles.dirtyText}>unsaved</span>
          </span>
        )}
        {viewIcon && (
          <viewIcon.Icon
            size={11}
            className={styles.viewIcon}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}

/* ─── Save Form ────────────────────────────────────────────────── */
function SaveForm({ onSave, onCancel }: any) {
  const [name,     setName]     = useState('');
  const [color,    setColor]    = useState(PROFILE_COLORS[0]);
  const [pinView,  setPinView]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

      <div className={styles.colorRow}>
        {PROFILE_COLORS.map(c => (
          <button
            key={c}
            type="button"
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
        <button type="button" className={styles.btnSave} onClick={handleSave} disabled={!name.trim()}>
          Save view
        </button>
        <button type="button" className={styles.btnCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

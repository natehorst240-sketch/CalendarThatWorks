/**
 * ProfileBar.jsx — Saved-view chips with add/rename/delete/resave.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Bookmark, BookmarkCheck, Pencil, Trash2, RefreshCw, Check, X, Settings2,
  CalendarDays, Calendar, Columns3, List, CalendarRange, Boxes, MapPin,
} from 'lucide-react';
import { buildFilterSummary } from '../filters/filterState';
import { DEFAULT_FILTER_SCHEMA } from '../filters/filterSchema';
import styles from './ProfileBar.module.css';

const PROFILE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const VIEW_ICON_MAP: Record<string, { Icon: any; label: string }> = {
  month:    { Icon: CalendarDays,  label: 'Month view' },
  week:     { Icon: Columns3,      label: 'Week view' },
  day:      { Icon: Calendar,      label: 'Day view' },
  agenda:   { Icon: List,          label: 'Agenda view' },
  schedule: { Icon: CalendarRange, label: 'Schedule view' },
  base:     { Icon: MapPin,        label: 'Base view' },
  assets:   { Icon: Boxes,         label: 'Assets view' },
};

const GLOBAL_GROUP_KEY = '__global__';
const DEFAULT_VIEW_ORDER = ['month','week','day','agenda','schedule','base','assets'];

export default function ProfileBar({
  views,
  activeId,
  isDirty,
  schema = DEFAULT_FILTER_SCHEMA,
  currentView,
  viewOrder = DEFAULT_VIEW_ORDER,
  enabledViews,
  locationLabel = 'Base',
  onApply,
  onAdd,
  onResave,
  onUpdate,
  onDelete,
  onEditConditions,
}: any) {
  // Views that are never hidden by Setup (Month + Week are always on).
  const ALWAYS_ON_VIEWS = new Set(['month', 'week']);
  // enabledViews is the config-allowed list (ids currently shown as tabs).
  // If the host doesn't pass it, treat every view as enabled (pre-feature compat).
  const enabledSet = useMemo(
    () => (Array.isArray(enabledViews) ? new Set(enabledViews) : null),
    [enabledViews],
  );
  const isViewEnabled = (viewId: string | null | undefined) => {
    if (!viewId) return true; // global bucket — always applicable
    if (ALWAYS_ON_VIEWS.has(viewId)) return true;
    if (!enabledSet) return true;
    return enabledSet.has(viewId);
  };
  const [saveOpen,    setSaveOpen]    = useState(false);
  const [manageId,    setManageId]    = useState(null); // which view is being managed
  const scrollRef = useRef(null);

  // Bucket saved views by the tab they were created on. Views with a null /
  // unknown `view` land in the global bucket so they remain applicable from
  // any tab (pre-feature backward compat).
  const grouped = useMemo(() => {
    const buckets = new Map<string, any[]>();
    viewOrder.forEach((v: string) => buckets.set(v, []));
    buckets.set(GLOBAL_GROUP_KEY, []);
    views.forEach((sv: any) => {
      const key = sv.view && buckets.has(sv.view) ? sv.view : GLOBAL_GROUP_KEY;
      buckets.get(key)!.push(sv);
    });
    return buckets;
  }, [views, viewOrder]);

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

  const renderChip = (savedView: any, isEnabled: boolean) => (
    <ViewChip
      key={savedView.id}
      savedView={savedView}
      schema={schema}
      isActive={savedView.id === activeId}
      isDirty={isDirty && savedView.id === activeId}
      isEnabled={isEnabled}
      isManaging={isEnabled && manageId === savedView.id}
      onApply={isEnabled
        ? () => { onApply(savedView); setManageId(null); setSaveOpen(false); }
        : undefined}
      onManageToggle={isEnabled
        ? () => setManageId((prev: any) => prev === savedView.id ? null : savedView.id)
        : undefined}
      onResave={isEnabled ? () => { onResave(savedView.id); setManageId(null); } : undefined}
      onDelete={isEnabled ? () => { onDelete(savedView.id); setManageId(null); } : undefined}
      onRename={isEnabled ? (name: string) => { onUpdate(savedView.id, { name }); setManageId(null); } : undefined}
      onColorChange={isEnabled ? (color: string) => onUpdate(savedView.id, { color }) : undefined}
      onEditConditions={isEnabled && onEditConditions ? () => { onEditConditions(savedView.id); setManageId(null); } : undefined}
    />
  );

  const nonEmpty = [...grouped.entries()].filter(([, list]) => list.length > 0);

  return (
    <div className={styles.bar}>
      {/* View chip strip */}
      <div className={styles.strip} ref={scrollRef}>
        {nonEmpty.map(([key, list], idx) => {
          const meta = key === GLOBAL_GROUP_KEY
            ? { Icon: Bookmark, label: 'All views' }
            : (VIEW_ICON_MAP[key] ?? { Icon: Bookmark, label: key });
          const headerLabel = key === 'base' ? `${locationLabel} view` : meta.label;
          // A chip is "enabled" when its pinned view is currently allowed by
          // Setup (enabledViews). Chips for other tabs stay clickable — applying
          // switches the active tab via cal.setView in the parent.
          const groupEnabled = key === GLOBAL_GROUP_KEY || isViewEnabled(key);
          const isCurrent = key === currentView;
          return (
            <div key={key} className={styles.group} data-active={isCurrent ? 'true' : 'false'}>
              {idx > 0 && <span className={styles.groupDivider} aria-hidden="true" />}
              <div className={styles.groupHeader} title={groupEnabled ? undefined : `${headerLabel} is hidden in Setup`}>
                <meta.Icon size={11} aria-hidden="true" />
                <span>{headerLabel}</span>
              </div>
              {list.map((sv: any) => renderChip(sv, groupEnabled))}
            </div>
          );
        })}

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
function ViewChip({ savedView, schema, isActive, isDirty, isEnabled = true, isManaging, onApply, onManageToggle,
  onResave, onDelete, onRename, onColorChange, onEditConditions }) {

  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal]   = useState(savedView.name);
  const [isHovered, setIsHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // Reset confirm-delete when manage panel closes
  useEffect(() => { if (!isManaging) setConfirmDelete(false); }, [isManaging]);

  const color = savedView.color ?? '#64748b';

  // Build a summary string for the tooltip using schema-driven formatting
  const summaryItems = buildFilterSummary(savedView.filters, schema);
  const summaryParts = summaryItems.map(item => `${item.label}: ${item.displayValues.join(', ')}`);
  if (savedView.view) summaryParts.push(`View: ${savedView.view}`);
  const summary = summaryParts.length ? summaryParts.join(' \u00b7 ') : 'No filters applied';

  const chipClass = [styles.chip, isDirty && styles.dirty, !isEnabled && styles.chipDimmed].filter(Boolean).join(' ');
  const wrapClass = [
    styles.chipWrap,
    isActive && styles.chipWrapActive,
    isDirty && styles.chipWrapDirty,
    !isEnabled && styles.chipWrapDimmed,
  ].filter(Boolean).join(' ');

  // Pencil is mounted only when its visual is meaningful — fixes the
  // hidden-button querySelector / focus-order trap that previously kept
  // the DOM button present even when invisible.
  const showPencil = isEnabled && (isHovered || isActive || isManaging);
  const shouldOpenEditorDirectly = typeof onEditConditions === 'function';

  const viewIcon = savedView.view ? VIEW_ICON_MAP[savedView.view] : null;

  return (
    <div
      ref={chipRef}
      className={wrapClass}
      style={{ '--chip-color': color } as React.CSSProperties}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        className={chipClass}
        onClick={onApply}
        disabled={!isEnabled}
        aria-disabled={!isEnabled || undefined}
        title={isEnabled ? summary : `${summary} — switch to the ${savedView.view ?? ''} tab to apply`}
      >
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

      {/* Manage toggle (pencil) — only mounted when chip is hovered/active/managing
          so screen readers and keyboard users don't traverse a hidden button. */}
      {showPencil && (
        <button
          type="button"
          className={styles.manageBtn}
          onClick={e => {
            e.stopPropagation();
            if (shouldOpenEditorDirectly) {
              onEditConditions();
              return;
            }
            onManageToggle();
          }}
          aria-label={shouldOpenEditorDirectly ? 'Edit saved view' : 'Manage saved view'}
          title={shouldOpenEditorDirectly ? 'Edit this saved view' : 'Manage this saved view'}
        >
          <Pencil size={10} />
        </button>
      )}

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

          {/* Edit conditions in Settings */}
          {onEditConditions && (
            <button className={styles.manageLine} onClick={onEditConditions}>
              <Settings2 size={12} /> Edit conditions
            </button>
          )}

          {/* Resave current filters */}
          <button className={styles.manageLine} onClick={onResave}>
            <RefreshCw size={12} /> Update with current filters
          </button>

          {/* Delete with two-step inline confirm */}
          {confirmDelete ? (
            <div className={styles.confirmRow} role="alertdialog" aria-label="Confirm delete">
              <span className={styles.confirmText}>Delete saved view?</span>
              <button
                className={[styles.confirmBtn, styles.confirmYes].join(' ')}
                onClick={onDelete}
                autoFocus
              >
                Yes, delete
              </button>
              <button
                className={styles.confirmBtn}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className={[styles.manageLine, styles.danger].join(' ')}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={12} /> Delete saved view
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Filter Summary (inside manage panel) ─────────────────────── */
function FilterSummary({ savedView, schema }: any) {
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
          <span className={styles.summaryLabel}>Tab</span>
          <span className={styles.summaryTags}>
            <span className={styles.tag}>{savedView.view}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Save Form ────────────────────────────────────────────────── */
function SaveForm({ onSave, onCancel }: any) {
  const [name,  setName]  = useState('');
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    onSave({ name: trimmed, color });
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

      <p className={styles.pinRow}>
        Saved views are now scoped to the current tab.
      </p>

      <div className={styles.saveActions}>
        <button className={styles.btnSave} onClick={handleSave} disabled={!name.trim()}>
          Save view
        </button>
        <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}


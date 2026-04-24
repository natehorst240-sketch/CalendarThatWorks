/**
 * ProfileBar — Saved-view header with quick-view chip strip and organizing controls.
 *
 * Layout:
 *   [All views ▾] [Customize Quick Views ▾] [Clear all filters] [+ Save view]
 *   [chip] [chip] [chip] ...   (only views where !hiddenFromStrip)
 *
 * Chips group under their tab (month/week/schedule/base/assets/…) with a
 * header + divider. Chips pinned to a tab the owner has hidden in Setup are
 * dimmed and non-clickable — they still appear so ownership of the view is
 * preserved, they just can't be applied until the tab is re-enabled.
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Plus, Bookmark, BookmarkCheck,
  CalendarDays, Calendar, Columns3, List, CalendarRange, Boxes, MapPin,
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
const ALWAYS_ON_VIEWS = new Set(['month', 'week']);

export default function ProfileBar({
  views,
  activeId,
  isDirty,
  schema = DEFAULT_FILTER_SCHEMA,
  currentView,
  viewOrder = DEFAULT_VIEW_ORDER,
  enabledViews,
  locationLabel = 'Base',
  hasActiveFilters = false,
  compact = false,
  tailSlot,
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

  const enabledSet = useMemo(
    () => (Array.isArray(enabledViews) ? new Set(enabledViews) : null),
    [enabledViews],
  );
  const isViewEnabled = (viewId: string | null | undefined) => {
    if (!viewId) return true;
    if (ALWAYS_ON_VIEWS.has(viewId)) return true;
    if (!enabledSet) return true;
    return enabledSet.has(viewId);
  };

  const visibleViews = views.filter((v: any) => !v.hiddenFromStrip);

  // Bucket visible saved views by the tab they were created on. Views with a
  // null/unknown `view` land in the global bucket so they remain applicable
  // from any tab (pre-feature backward compat).
  const grouped = useMemo(() => {
    const buckets = new Map<string, any[]>();
    viewOrder.forEach((v: string) => buckets.set(v, []));
    buckets.set(GLOBAL_GROUP_KEY, []);
    visibleViews.forEach((sv: any) => {
      const key = sv.view && buckets.has(sv.view) ? sv.view : GLOBAL_GROUP_KEY;
      buckets.get(key)!.push(sv);
    });
    return buckets;
  }, [visibleViews, viewOrder]);

  const nonEmpty = [...grouped.entries()].filter(([, list]) => list.length > 0);

  // Compact mode scopes the strip to the active view only so the section
  // header ("AGENDA VIEW", "BASE VIEW", …) becomes redundant — the toolbar
  // already tells the user which tab they're on. Globally-pinned views ride
  // along so cross-view favorites stay accessible.
  const compactChips = useMemo(() => {
    if (!compact) return [];
    const flat: any[] = [];
    const scoped = grouped.get(currentView);
    if (scoped) flat.push(...scoped);
    const global = grouped.get(GLOBAL_GROUP_KEY);
    if (global) flat.push(...global);
    return flat;
  }, [compact, grouped, currentView]);

  return (
    <div className={[styles['bar'], compact && styles['barCompact']].filter(Boolean).join(' ')}>
      {!compact && (
        <div className={styles['headerRow']}>
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
            className={styles['addChip']}
            onClick={() => setSaveOpen(v => !v)}
            title="Save current filters as a new saved view"
          >
            <Plus size={13} />
            Save view
          </button>
        </div>
      )}

      {!compact && nonEmpty.length > 0 && (
        <div className={styles['strip']}>
          {nonEmpty.map(([key, list], idx) => {
            const meta = key === GLOBAL_GROUP_KEY
              ? { Icon: Bookmark, label: 'All views' }
              : (VIEW_ICON_MAP[key] ?? { Icon: Bookmark, label: key });
            const headerLabel = key === 'base' ? `${locationLabel} view` : meta.label;
            const groupEnabled = key === GLOBAL_GROUP_KEY || isViewEnabled(key);
            const isCurrent = key === currentView;
            return (
              <div key={key} className={styles['group']} data-active={isCurrent ? 'true' : 'false'}>
                {idx > 0 && <span className={styles['groupDivider']} aria-hidden="true" />}
                <div
                  className={styles['groupHeader']}
                  title={groupEnabled ? undefined : `${headerLabel} is hidden in Setup`}
                >
                  <meta.Icon size={11} aria-hidden="true" />
                  <span>{headerLabel}</span>
                </div>
                {list.map((savedView: any) => (
                  <ViewChip
                    key={savedView.id}
                    savedView={savedView}
                    isActive={savedView.id === activeId}
                    isDirty={isDirty && savedView.id === activeId}
                    isEnabled={groupEnabled}
                    onApply={groupEnabled
                      ? () => { onApply(savedView); setSaveOpen(false); }
                      : undefined}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {compact && (
        <div className={styles['strip']}>
          {compactChips.length > 0 && (
            <div className={styles['group']} data-active="true">
              {compactChips.map((savedView: any) => {
                const chipEnabled = !savedView.view || isViewEnabled(savedView.view);
                return (
                  <ViewChip
                    key={savedView.id}
                    savedView={savedView}
                    isActive={savedView.id === activeId}
                    isDirty={isDirty && savedView.id === activeId}
                    isEnabled={chipEnabled}
                    onApply={chipEnabled
                      ? () => { onApply(savedView); setSaveOpen(false); }
                      : undefined}
                  />
                );
              })}
            </div>
          )}
          <div className={styles['stripTail']}>
            {tailSlot && <div className={styles['tailSlot']}>{tailSlot}</div>}
            <button
              type="button"
              className={styles['tailSaveBtn']}
              onClick={() => setSaveOpen(v => !v)}
              title="Save current filters as a new saved view"
              aria-label="Save current view"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Save</span>
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                className={styles['tailClearBtn']}
                onClick={onClearFilters}
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>
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
function ViewChip({ savedView, isActive, isDirty, isEnabled = true, onApply }: any) {
  const color = savedView.color ?? '#64748b';
  const viewIcon = savedView.view ? VIEW_ICON_MAP[savedView.view] : null;

  const chipClass = [styles['chip'], isDirty && styles['dirty'], !isEnabled && styles['chipDimmed']]
    .filter(Boolean).join(' ');
  const wrapClass = [
    styles['chipWrap'],
    isActive && styles['chipWrapActive'],
    isDirty && styles['chipWrapDirty'],
    !isEnabled && styles['chipWrapDimmed'],
  ].filter(Boolean).join(' ');

  return (
    <div
      className={wrapClass}
      style={{ '--chip-color': color } as React.CSSProperties}
    >
      <button
        className={chipClass}
        onClick={onApply}
        disabled={!isEnabled}
        aria-disabled={!isEnabled || undefined}
        title={isEnabled
          ? savedView.name
          : `${savedView.name} — ${savedView.view ?? ''} tab is hidden in Setup`}
      >
        {isActive
          ? <BookmarkCheck size={12} className={styles['chipIcon']} />
          : <Bookmark size={12} className={styles['chipIcon']} />
        }
        <span className={styles['chipName']}>{savedView.name}</span>
        {isDirty && (
          <span className={styles['dirtyTag']} title="Filters changed since saved">
            <span className={styles['dirtyDot']} />
            <span className={styles['dirtyText']}>unsaved</span>
          </span>
        )}
        {viewIcon && (
          <viewIcon.Icon
            size={11}
            className={styles['viewIcon']}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}

/* ─── Save Form ────────────────────────────────────────────────── */
function SaveForm({ onSave, onCancel }: any) {
  const [name,  setName]  = useState('');
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    onSave({ name: trimmed, color });
  }

  return (
    <div className={styles['saveForm']}>
      <input
        ref={inputRef}
        className={styles['nameInput']}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder="View name, e.g. Agusta Inspections…"
      />

      <div className={styles['colorRow']}>
        {PROFILE_COLORS.map(c => (
          <button
            key={c}
            type="button"
            className={[styles['colorDot'], color === c && styles['colorDotActive']].filter(Boolean).join(' ')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Choose color ${c}`}
          />
        ))}
      </div>

      <div className={styles['saveActions']}>
        <button type="button" className={styles['btnSave']} onClick={handleSave} disabled={!name.trim()}>
          Save view
        </button>
        <button type="button" className={styles['btnCancel']} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

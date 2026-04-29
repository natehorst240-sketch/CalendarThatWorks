/**
 * FilterGroupSidebar — slide-out panel with tab navigation.
 *
 * Tabs: Focus, Saved.
 *
 * The legacy "View" tab (perspective preset cards) was removed in favor
 * of the Focus tab's cascade scope picker — the perspectives weren't
 * actual operations, just labels of entities, and they competed
 * confusingly with the toolbar's display-mode tabs (Month/Schedule/
 * Base/etc.). When a `cascadeConfig` is supplied the Focus tab renders
 * the cascade UI; otherwise it falls back to the legacy condition
 * builder (`FiltersPanel`) so non-cascade hosts keep working.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, SlidersHorizontal, Filter, Bookmark } from 'lucide-react';
import type { GroupLevel } from './GroupsPanel';
import FiltersPanel from './FiltersPanel';
import ViewsPanel from './ViewsPanel';
import CascadePanel from './CascadePanel';
import type { CascadeConfig, CascadeSelections } from './CascadePanel';
import { useConditionBuilder } from '../hooks/useConditionBuilder';
import type { Condition } from '../hooks/useConditionBuilder';
import type { FilterField } from '../filters/filterSchema';
import type { SortConfig } from '../types/grouping';
import styles from './FilterGroupSidebar.module.css';

export type SidebarTab = 'focus' | 'saved';

export type FilterGroupSidebarProps = {
  /** Whether the sidebar is open. */
  open: boolean;
  /** Called to close the sidebar. */
  onClose: () => void;
  /** Tab to focus each time the sidebar opens. Defaults to 'focus'. */
  initialTab?: SidebarTab;

  // Group/sort wiring stays in the props (consumed by saved-view restore
  // and by the cascade-driven group-level updates), but no longer has a
  // dedicated tab UI.
  /** Current group-by levels. */
  groupLevels: GroupLevel[];
  /** Called when group levels change. */
  onGroupLevelsChange: (levels: GroupLevel[]) => void;
  /** Current sort config. */
  sort: SortConfig[];
  /** Called when sort changes. */
  onSortChange: (sort: SortConfig[]) => void;
  /** Show-all-groups toggle. */
  showAllGroups: boolean;
  /** Called when showAllGroups changes. */
  onShowAllGroupsChange: (show: boolean) => void;

  // Focus tab — cascade UI when cascadeConfig set, condition builder otherwise.
  /** Optional cascade config. When provided, Focus tab renders the cascade. */
  cascadeConfig?: CascadeConfig;
  /** Current cascade selections. Required when cascadeConfig is provided. */
  cascadeSelections?: CascadeSelections;
  /** Called when cascade selections change. Required with cascadeConfig. */
  onCascadeSelectionsChange?: (next: CascadeSelections) => void;

  // Filters tab
  /** Filter schema. */
  schema: FilterField[];
  /** Current events for dynamic options. */
  items: unknown[];
  /** Called when filter conditions produce new filters. */
  onFiltersChange: (filters: Record<string, unknown>) => void;
  /** Initial conditions (e.g. from a saved view). */
  initialConditions?: Condition[] | null;

  // Views tab
  /** All saved views. */
  views: any[];
  /** Currently active saved view id. */
  activeViewId: string | null;
  /** Whether the active view has unsaved changes. */
  isViewDirty: boolean;
  /** Apply a saved view. */
  onApplyView: (view: any) => void;
  /** Save current state as a new view. */
  onSaveView: (name: string, color: string | null) => void;
  /** Resave current state into an existing view. */
  onResaveView: (id: string) => void;
  /** Update view metadata. */
  onUpdateView: (id: string, patch: Record<string, unknown>) => void;
  /** Delete a view. */
  onDeleteView: (id: string) => void;
  /** Toggle view's strip visibility. */
  onToggleViewVisibility: (id: string) => void;

  /** Owner-customizable label for "Base" — forwarded to ViewsPanel for the
   *  view-type tooltip. */
  locationLabel?: string;
  /** Owner-customizable label for "Asset" — forwarded to ViewsPanel for the
   *  view-type tooltip. */
  assetsLabel?: string;
};

export default function FilterGroupSidebar({
  open,
  onClose,
  initialTab,
  // (group/sort props kept for API compat but no longer drive a tab)
  groupLevels: _groupLevels,
  onGroupLevelsChange: _onGroupLevelsChange,
  sort: _sort,
  onSortChange: _onSortChange,
  showAllGroups: _showAllGroups,
  onShowAllGroupsChange: _onShowAllGroupsChange,
  // Focus
  cascadeConfig,
  cascadeSelections,
  onCascadeSelectionsChange,
  schema,
  items,
  onFiltersChange,
  initialConditions,
  // Views
  views,
  activeViewId,
  isViewDirty,
  onApplyView,
  onSaveView,
  onResaveView,
  onUpdateView,
  onDeleteView,
  onToggleViewVisibility,
  locationLabel,
  assetsLabel,
}: FilterGroupSidebarProps) {
  // Default to Focus — it's the primary surface now that View is gone.
  const [activeTab, setActiveTab] = useState<SidebarTab>(initialTab ?? 'focus');
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Sync the active tab with the requested initialTab whenever the sidebar
  // opens AND whenever the caller retargets initialTab while already open.
  // Map any legacy 'view' value onto 'focus' since the tab no longer exists.
  useEffect(() => {
    if (open) {
      const next = (initialTab as string) === 'view' ? 'focus' : (initialTab ?? 'focus');
      setActiveTab(next as SidebarTab);
    }
  }, [open, initialTab]);

  const cascadeCount = useMemo(() => {
    if (!cascadeSelections) return 0;
    let n = 0;
    for (const k in cascadeSelections) {
      if (cascadeSelections[k] && cascadeSelections[k]!.length > 0) n += 1;
    }
    return n;
  }, [cascadeSelections]);

  // Condition builder for the Filters tab
  const conditionBuilder = useConditionBuilder({
    schema,
    initialConditions,
  });

  // Focus trap: when open, trap focus within the sidebar
  useEffect(() => {
    if (!open) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      const focusable = sidebar.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Keyboard shortcut: Cmd/Ctrl + / to toggle sidebar
  // (this is handled at WorksCalendar level, but we handle Escape here)

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={[styles['overlay'], open && styles['open']].filter(Boolean).join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div
        ref={sidebarRef}
        className={[styles['sidebar'], open && styles['open']].filter(Boolean).join(' ')}
        role="complementary"
        aria-label="Filter and group sidebar"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className={styles['header']}>
          <div className={styles['headerText']}>
            <h2 className={styles['headerTitle']}>
              <SlidersHorizontal size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              View Controls
            </h2>
            <p className={styles['headerHint']}>Changes apply as you go</p>
          </div>
          <button
            className={styles['closeBtn']}
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab strip */}
        <div className={styles['tabs']} role="tablist" aria-label="Sidebar tabs">
          <button
            className={[styles['tab'], activeTab === 'focus' && styles['active']].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('focus')}
            role="tab"
            aria-selected={activeTab === 'focus'}
            aria-controls="sidebar-tab-focus"
          >
            <Filter size={14} />
            Focus
            {(cascadeConfig ? cascadeCount : conditionBuilder.activeCount) > 0 && (
              <span className={styles['badge']}>
                {cascadeConfig ? cascadeCount : conditionBuilder.activeCount}
              </span>
            )}
          </button>
          <button
            className={[styles['tab'], activeTab === 'saved' && styles['active']].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('saved')}
            role="tab"
            aria-selected={activeTab === 'saved'}
            aria-controls="sidebar-tab-saved"
          >
            <Bookmark size={14} />
            Saved
            {views.length > 0 && (
              <span className={styles['badge']}>{views.length}</span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className={styles['content']}>
          {activeTab === 'focus' && (
            <div id="sidebar-tab-focus" role="tabpanel" aria-label="Focus">
              {cascadeConfig && cascadeSelections && onCascadeSelectionsChange ? (
                <CascadePanel
                  config={cascadeConfig}
                  selections={cascadeSelections}
                  onSelectionsChange={onCascadeSelectionsChange}
                  onSave={() => {
                    // The cascade currently captures into the saved-view system
                    // via the host's onSaveView. Naming is auto-derived; the
                    // host can offer a rename via the Saved tab.
                    onSaveView('Custom view', null);
                  }}
                />
              ) : (
                <FiltersPanel
                  builder={conditionBuilder}
                  schema={schema}
                  items={items}
                  onFiltersChange={onFiltersChange}
                />
              )}
            </div>
          )}
          {activeTab === 'saved' && (
            <div id="sidebar-tab-saved" role="tabpanel" aria-label="Saved">
              <ViewsPanel
                views={views}
                activeId={activeViewId}
                isDirty={isViewDirty}
                onApply={onApplyView}
                onSave={onSaveView}
                onResave={onResaveView}
                onUpdate={onUpdateView}
                onDelete={onDeleteView}
                onToggleVisibility={onToggleViewVisibility}
                {...(locationLabel ? { locationLabel } : {})}
                {...(assetsLabel ? { assetsLabel } : {})}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * SidebarToggleButton — shown in the toolbar to open/close the sidebar.
 */
export function SidebarToggleButton({
  isOpen,
  onClick,
  filterCount = 0,
  groupCount = 0,
}: {
  isOpen: boolean;
  onClick: () => void;
  filterCount?: number;
  groupCount?: number;
}) {
  const totalActive = filterCount + groupCount;
  return (
    <button
      className={[styles['toggleBtn'], isOpen && styles['active']].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={isOpen ? 'Close view controls' : 'Open view controls'}
      aria-expanded={isOpen}
      title="Perspective, focus & saved views"
    >
      <SlidersHorizontal size={15} />
      <span>Customize View</span>
      <span className={styles['toggleArrow']} aria-hidden="true">→</span>
      {totalActive > 0 && (
        <span className={styles['badge']}>{totalActive}</span>
      )}
    </button>
  );
}

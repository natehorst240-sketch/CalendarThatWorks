/**
 * FilterGroupSidebar — slide-out panel with 3-tab navigation:
 * View, Focus, Saved.
 *
 * Replaces the FilterBar as the primary tool for manipulating
 * what the calendar shows and how it is organized. Available to
 * all users (not owner-gated like ConfigPanel).
 *
 * Issue #268 renamed the tabs and header:
 *   Groups  → View   (a perspective picker; grouping builder is now "Advanced")
 *   Filters → Focus
 *   Views   → Saved
 *   "Organize" → "View Controls"
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { X, SlidersHorizontal, Layers, Filter, Bookmark } from 'lucide-react';
import ViewPanel from './ViewPanel';
import type { GroupLevel } from './GroupsPanel';
import FiltersPanel from './FiltersPanel';
import ViewsPanel from './ViewsPanel';
import { useConditionBuilder } from '../hooks/useConditionBuilder';
import type { Condition } from '../hooks/useConditionBuilder';
import type { FilterField } from '../filters/filterSchema';
import type { SortConfig } from '../types/grouping';
import styles from './FilterGroupSidebar.module.css';

export type SidebarTab = 'view' | 'focus' | 'saved';

export type FilterGroupSidebarProps = {
  /** Whether the sidebar is open. */
  open: boolean;
  /** Called to close the sidebar. */
  onClose: () => void;

  // Groups tab
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
};

export default function FilterGroupSidebar({
  open,
  onClose,
  // Groups
  groupLevels,
  onGroupLevelsChange,
  sort,
  onSortChange,
  showAllGroups,
  onShowAllGroupsChange,
  // Filters
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
}: FilterGroupSidebarProps) {
  // Default to the View tab so the perspective picker is the owner's
  // first stop. Focus/Saved open via explicit tab clicks.
  const [activeTab, setActiveTab] = useState<SidebarTab>('view');
  const sidebarRef = useRef<HTMLDivElement>(null);

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
        className={[styles.overlay, open && styles.open].filter(Boolean).join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <div
        ref={sidebarRef}
        className={[styles.sidebar, open && styles.open].filter(Boolean).join(' ')}
        role="complementary"
        aria-label="Filter and group sidebar"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            <SlidersHorizontal size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            View Controls
          </h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab strip */}
        <div className={styles.tabs} role="tablist" aria-label="Sidebar tabs">
          <button
            className={[styles.tab, activeTab === 'view' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('view')}
            role="tab"
            aria-selected={activeTab === 'view'}
            aria-controls="sidebar-tab-view"
          >
            <Layers size={14} />
            View
            {groupLevels.length > 0 && (
              <span className={styles.badge}>{groupLevels.length}</span>
            )}
          </button>
          <button
            className={[styles.tab, activeTab === 'focus' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('focus')}
            role="tab"
            aria-selected={activeTab === 'focus'}
            aria-controls="sidebar-tab-focus"
          >
            <Filter size={14} />
            Focus
            {conditionBuilder.activeCount > 0 && (
              <span className={styles.badge}>{conditionBuilder.activeCount}</span>
            )}
          </button>
          <button
            className={[styles.tab, activeTab === 'saved' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setActiveTab('saved')}
            role="tab"
            aria-selected={activeTab === 'saved'}
            aria-controls="sidebar-tab-saved"
          >
            <Bookmark size={14} />
            Saved
            {views.length > 0 && (
              <span className={styles.badge}>{views.length}</span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className={styles.content}>
          {activeTab === 'view' && (
            <div id="sidebar-tab-view" role="tabpanel" aria-label="View">
              <ViewPanel
                levels={groupLevels}
                onLevelsChange={onGroupLevelsChange}
                sort={sort}
                onSortChange={onSortChange}
                schema={schema}
                showAllGroups={showAllGroups}
                onShowAllGroupsChange={onShowAllGroupsChange}
              />
            </div>
          )}
          {activeTab === 'focus' && (
            <div id="sidebar-tab-focus" role="tabpanel" aria-label="Focus">
              <FiltersPanel
                builder={conditionBuilder}
                schema={schema}
                items={items}
                onFiltersChange={onFiltersChange}
              />
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
      className={[styles.toggleBtn, isOpen && styles.active].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={isOpen ? 'Close view controls' : 'Open view controls'}
      aria-expanded={isOpen}
      title="Perspective, focus & saved views"
    >
      <SlidersHorizontal size={15} />
      <span>View Controls</span>
      {totalActive > 0 && (
        <span className={styles.badge}>{totalActive}</span>
      )}
    </button>
  );
}

import { useState, useRef, useCallback, useEffect } from 'react';
import { deserializeFilters } from './useSavedViews';
import { captureSavedViewFields } from '../core/viewScope';
import type { GroupByInput } from './useNormalizedConfig';
import type { SortConfig } from '../types/grouping';
import type { AssetsZoomLevel } from '../types/assets';

/** Persisted saved view as read by `handleApplyView`. */
export interface SavedViewRecord {
  id: string;
  filters?: Record<string, unknown> | null;
  view?: string;
  groupBy?: GroupByInput | null;
  sort?: SortConfig[] | null;
  showAllGroups?: boolean;
  zoomLevel?: AssetsZoomLevel;
  collapsedGroups?: string[];
  selectedBaseIds?: string[];
}

interface CalHandle {
  view: string;
  filters: Record<string, unknown>;
  replaceFilters: (filters: Record<string, unknown>) => void;
  clearFilters: () => void;
  setView: (v: string) => void;
}

interface SavedViewsHandle {
  saveView: (name: string, filters: Record<string, unknown>, opts?: Record<string, unknown>) => unknown;
  deleteView: (id: string) => void;
}

export interface UseSavedViewsManagerParams {
  cal: CalHandle;
  schema: Array<{ type: string; key: string }>;
  savedViews: SavedViewsHandle;
  activeGroupBy: GroupByInput | null;
  setActiveGroupBy: (v: GroupByInput | null) => void;
  activeSort: SortConfig[] | null;
  setActiveSort: (v: SortConfig[] | null) => void;
  activeShowAllGroups: boolean;
  setActiveShowAllGroups: (v: boolean) => void;
  activeAssetsZoom: AssetsZoomLevel;
  setActiveAssetsZoom: (v: AssetsZoomLevel) => void;
  activeAssetsCollapsed: Set<string>;
  setActiveAssetsCollapsed: (v: Set<string>) => void;
  selectedBaseIds: string[];
  setSelectedBaseIds: (v: string[]) => void;
}

export interface UseSavedViewsManagerReturn {
  savedViewActiveId: string | null;
  savedViewDirty: boolean;
  handleApplyView: (savedView: SavedViewRecord) => void;
  handleClearFilters: () => void;
  handleDeleteView: (id: string) => void;
  handleSidebarSaveView: (name: string, color: string | null) => void;
}

export function useSavedViewsManager({
  cal,
  schema,
  savedViews,
  activeGroupBy,
  setActiveGroupBy,
  activeSort,
  setActiveSort,
  activeShowAllGroups,
  setActiveShowAllGroups,
  activeAssetsZoom,
  setActiveAssetsZoom,
  activeAssetsCollapsed,
  setActiveAssetsCollapsed,
  selectedBaseIds,
  setSelectedBaseIds,
}: UseSavedViewsManagerParams): UseSavedViewsManagerReturn {
  const [savedViewActiveId, setSavedViewActiveId] = useState<string | null>(null);
  const [savedViewDirty, setSavedViewDirty] = useState(false);
  const skipDirtyRef = useRef(false);

  const handleSidebarSaveView = useCallback((name: string, color: string | null) => {
    savedViews.saveView(name, cal.filters, {
      color,
      view: cal.view,
      ...captureSavedViewFields(cal.view, {
        groupBy: activeGroupBy,
        sort: activeSort,
        showAllGroups: activeShowAllGroups,
        zoomLevel: activeAssetsZoom,
        collapsedGroups: activeAssetsCollapsed,
        selectedBaseIds,
      }),
    });
  }, [cal, savedViews, activeGroupBy, activeSort, activeShowAllGroups, activeAssetsZoom, activeAssetsCollapsed, selectedBaseIds]);

  // Mark dirty when filters/view/groupBy/sort/showAllGroups/assets-state change
  // after a saved view was applied. A ref skips the first run that fires
  // synchronously after handleApplyView seeds state from the saved view.
  useEffect(() => {
    if (skipDirtyRef.current) { skipDirtyRef.current = false; return; }
    if (savedViewActiveId) setSavedViewDirty(true);
  }, [cal.filters, cal.view, activeGroupBy, activeSort, activeShowAllGroups, activeAssetsZoom, activeAssetsCollapsed, selectedBaseIds]);

  const handleApplyView = useCallback((savedView: SavedViewRecord) => {
    if (savedView.id === savedViewActiveId) {
      setSavedViewActiveId(null);
      setSavedViewDirty(false);
      return;
    }
    skipDirtyRef.current = true;
    cal.replaceFilters(deserializeFilters(savedView.filters, schema));
    if (savedView.view) cal.setView(savedView.view);
    setActiveGroupBy(savedView.groupBy ?? null);
    setActiveSort(Array.isArray(savedView.sort) ? savedView.sort : null);
    setActiveShowAllGroups(!!savedView.showAllGroups);
    if (savedView.zoomLevel) setActiveAssetsZoom(savedView.zoomLevel);
    setActiveAssetsCollapsed(
      Array.isArray(savedView.collapsedGroups)
        ? new Set(savedView.collapsedGroups)
        : new Set(),
    );
    setSelectedBaseIds(
      Array.isArray(savedView.selectedBaseIds) ? savedView.selectedBaseIds : [],
    );
    setSavedViewActiveId(savedView.id);
    setSavedViewDirty(false);
  }, [cal, schema, savedViewActiveId, setActiveGroupBy, setActiveSort, setActiveShowAllGroups, setActiveAssetsZoom, setActiveAssetsCollapsed, setSelectedBaseIds]);

  const handleClearFilters = useCallback(() => {
    cal.clearFilters();
    setSavedViewActiveId(null);
    setSavedViewDirty(false);
  }, [cal]);

  const handleDeleteView = useCallback((id: string) => {
    savedViews.deleteView(id);
    if (savedViewActiveId === id) {
      setSavedViewActiveId(null);
      setSavedViewDirty(false);
    }
  }, [savedViews, savedViewActiveId]);

  return {
    savedViewActiveId,
    savedViewDirty,
    handleApplyView,
    handleClearFilters,
    handleDeleteView,
    handleSidebarSaveView,
  };
}

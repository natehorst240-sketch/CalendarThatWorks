import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePermissions } from './usePermissions';
import { useEventOptions } from './useEventOptions';
import { useSavedViews } from './useSavedViews';
import { useSetupLanding } from './useSetupLanding';
import { useGroupingSort } from './useGroupingSort';
import { useCascadeFilters } from './useCascadeFilters';
import { useSavedViewsManager } from './useSavedViewsManager';
import { useOwnerConfig } from './useOwnerConfig';
import { createManualLocationProvider } from '../providers/ManualLocationProvider.ts';
import type { AssetsZoomLevel, LocationProvider } from '../types/assets';
import type { SidebarTab } from '../ui/FilterGroupSidebar';
import type { FilterField } from '../filters/filterSchema';
import type { GroupByInput } from './useNormalizedConfig.ts';
import type { SortConfig } from '../types/grouping.ts';
import type { CascadeConfig } from '../ui/CascadePanel';
import type { CalendarRole } from '../WorksCalendar.types';
import type { CalObject } from './useCalendarSetup';

export interface UseCalendarWorkspaceInput {
  calendarId: string;
  cal: CalObject;
  schema: FilterField[];
  ownerCfg: ReturnType<typeof useOwnerConfig>;
  cascadeConfig: CascadeConfig | undefined;
  groupBy: GroupByInput | undefined;
  sort: SortConfig | SortConfig[] | null | undefined;
  showAllGroups: boolean;
  locationProvider: LocationProvider | undefined;
  showSetupLanding: boolean;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  role: CalendarRole | undefined;
}

export function useCalendarWorkspace({
  calendarId, cal, schema, ownerCfg,
  cascadeConfig, groupBy, sort, showAllGroups,
  locationProvider, showSetupLanding, weekStartDay, role,
}: UseCalendarWorkspaceInput) {
  const perms = usePermissions(role);
  const eventOptions = useEventOptions(calendarId);
  const savedViews = useSavedViews(calendarId);

  const setupCompleted = !!ownerCfg.config?.['setup']?.completed;
  const { setupDismissed, shouldShowSetup, handleSetupSkip, handleReopenSetup, handleSetupFinish } = useSetupLanding({
    showSetupLanding, setupCompleted, updateConfig: ownerCfg.updateConfig, closeConfig: ownerCfg.closeConfig, savedViews, weekStartDay,
  });

  const {
    activeGroupBy, setActiveGroupBy, activeSort, setActiveSort,
    activeShowAllGroups, setActiveShowAllGroups, sidebarGroupLevels, handleSidebarGroupLevelsChange,
  } = useGroupingSort({ groupBy, sort: sort ?? null, showAllGroups: !!showAllGroups });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarInitialTab, setSidebarInitialTab] = useState<SidebarTab>('focus');

  const handleScopeClick = useCallback(() => { setSidebarInitialTab('focus'); setSidebarOpen(true); }, []);
  const handleSidebarFiltersChange = useCallback((filters: Record<string, unknown>) => { cal.replaceFilters(filters); }, [cal]);

  const { cascadeSelections, handleCascadeSelectionsChange } = useCascadeFilters({
    cascadeConfig, calFilters: cal.filters, replaceFilters: cal.replaceFilters,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); setSidebarOpen(prev => !prev); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [activeAssetsZoom, setActiveAssetsZoom] = useState<AssetsZoomLevel>('month');
  const [activeAssetsCollapsed, setActiveAssetsCollapsed] = useState<Set<string>>(() => new Set());
  const [selectedBaseIds, setSelectedBaseIds] = useState<string[]>([]);
  const effectiveLocationProvider = useMemo<LocationProvider>(
    () => locationProvider ?? createManualLocationProvider(),
    [locationProvider],
  );

  const {
    savedViewActiveId, savedViewDirty,
    handleApplyView, handleClearFilters, handleDeleteView, handleSidebarSaveView,
  } = useSavedViewsManager({
    cal, schema, savedViews,
    activeGroupBy, setActiveGroupBy, activeSort, setActiveSort,
    activeShowAllGroups, setActiveShowAllGroups,
    activeAssetsZoom, setActiveAssetsZoom,
    activeAssetsCollapsed, setActiveAssetsCollapsed,
    selectedBaseIds, setSelectedBaseIds,
  });

  return {
    perms, eventOptions, savedViews,
    shouldShowSetup, setupDismissed, handleSetupSkip, handleReopenSetup, handleSetupFinish,
    activeGroupBy, setActiveGroupBy, activeSort, setActiveSort,
    activeShowAllGroups, setActiveShowAllGroups, sidebarGroupLevels, handleSidebarGroupLevelsChange,
    sidebarOpen, setSidebarOpen, sidebarInitialTab, setSidebarInitialTab,
    handleScopeClick, handleSidebarFiltersChange,
    cascadeSelections, handleCascadeSelectionsChange,
    activeAssetsZoom, setActiveAssetsZoom, activeAssetsCollapsed, setActiveAssetsCollapsed,
    selectedBaseIds, setSelectedBaseIds, effectiveLocationProvider,
    savedViewActiveId, savedViewDirty, handleApplyView, handleClearFilters,
    handleDeleteView, handleSidebarSaveView,
  };
}

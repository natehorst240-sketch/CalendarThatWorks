import { useState, useEffect, useMemo, useCallback } from 'react';
import type { GroupByInput } from './useNormalizedConfig';
import type { SortConfig } from '../types/grouping';
import type { GroupLevel } from '../ui/GroupsPanel';

export interface UseGroupingSortParams {
  groupBy?: GroupByInput | null;
  sort?: SortConfig | SortConfig[] | null;
  showAllGroups?: boolean;
}

export interface UseGroupingSortReturn {
  activeGroupBy: GroupByInput | null;
  setActiveGroupBy: (v: GroupByInput | null) => void;
  activeSort: SortConfig[] | null;
  setActiveSort: (v: SortConfig[] | null) => void;
  activeShowAllGroups: boolean;
  setActiveShowAllGroups: (v: boolean) => void;
  sidebarGroupLevels: GroupLevel[];
  handleSidebarGroupLevelsChange: (levels: GroupLevel[]) => void;
}

function normalizeSortProp(s: SortConfig | SortConfig[] | null | undefined): SortConfig[] | null {
  if (!s) return null;
  return Array.isArray(s) ? s : [s];
}

export function useGroupingSort({
  groupBy,
  sort,
  showAllGroups,
}: UseGroupingSortParams): UseGroupingSortReturn {
  const [activeGroupBy, setActiveGroupBy] = useState<GroupByInput | null>(groupBy ?? null);
  useEffect(() => setActiveGroupBy(groupBy ?? null), [groupBy]);

  const [activeSort, setActiveSort] = useState<SortConfig[] | null>(normalizeSortProp(sort));
  useEffect(() => setActiveSort(normalizeSortProp(sort)), [sort]);

  const [activeShowAllGroups, setActiveShowAllGroups] = useState<boolean>(!!showAllGroups);
  useEffect(() => setActiveShowAllGroups(!!showAllGroups), [showAllGroups]);

  const sidebarGroupLevels = useMemo<GroupLevel[]>(() => {
    if (!activeGroupBy) return [];
    if (typeof activeGroupBy === 'string') return [{ field: activeGroupBy, showEmpty: false }];
    if (Array.isArray(activeGroupBy)) {
      return activeGroupBy.map(item =>
        typeof item === 'string'
          ? { field: item, showEmpty: false }
          : { field: item.field, showEmpty: !!item.showEmpty },
      );
    }
    return [];
  }, [activeGroupBy]);

  const handleSidebarGroupLevelsChange = useCallback((levels: GroupLevel[]) => {
    if (levels.length === 0) {
      setActiveGroupBy(null);
    } else if (levels.length === 1) {
      setActiveGroupBy(levels[0]!.field);
    } else {
      setActiveGroupBy(levels.map(l => ({ field: l.field, showEmpty: l.showEmpty })));
    }
  }, []);

  return {
    activeGroupBy,
    setActiveGroupBy,
    activeSort,
    setActiveSort,
    activeShowAllGroups,
    setActiveShowAllGroups,
    sidebarGroupLevels,
    handleSidebarGroupLevelsChange,
  };
}

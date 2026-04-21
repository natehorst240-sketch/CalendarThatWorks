import { useState, useMemo, useCallback } from 'react';
import { groupRows } from '../grouping/groupRows';

type GroupingOptions<T> = {
  groupBy?: unknown
  fieldAccessor?: ((row: T) => unknown) | Array<(row: T) => unknown>
  groupHeaderHeight?: number
};

export function useGrouping<T extends Record<string, any>>(rows: T[], options: GroupingOptions<T> = {}): {
  flatRows: Array<Record<string, any>>;
  groupOrder: string[];
  collapsedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  isGrouped: boolean;
} {
  const { groupBy, fieldAccessor, groupHeaderHeight = 36 } = options;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const { flatRows, groupOrder } = useMemo(() => {
    if (!groupBy) return { flatRows: rows as Array<T | Record<string, any>>, groupOrder: [] };
    return groupRows(rows, { groupBy, fieldAccessor: fieldAccessor as any, collapsedGroups, groupHeaderHeight });
  }, [rows, groupBy, fieldAccessor, collapsedGroups, groupHeaderHeight]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedGroups(new Set()), []);

  const collapseAll = useCallback(() => {
    setCollapsedGroups(new Set(groupOrder));
  }, [groupOrder]);

  return {
    flatRows,
    groupOrder,
    collapsedGroups,
    toggleGroup,
    expandAll,
    collapseAll,
    isGrouped: !!groupBy,
  };
}

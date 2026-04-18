import { useState, useMemo, useCallback } from 'react';
import { groupRows } from '../grouping/groupRows.js';

export function useGrouping(rows, options: {
  groupBy?: unknown
  fieldAccessor?: unknown
  groupHeaderHeight?: number
} = {}) {
  const { groupBy, fieldAccessor, groupHeaderHeight = 36 } = options;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const { flatRows, groupOrder } = useMemo(() => {
    if (!groupBy) return { flatRows: rows, groupOrder: [] };
    return groupRows(rows, { groupBy, fieldAccessor, collapsedGroups, groupHeaderHeight });
  }, [rows, groupBy, fieldAccessor, collapsedGroups, groupHeaderHeight]);

  const toggleGroup = useCallback((key) => {
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

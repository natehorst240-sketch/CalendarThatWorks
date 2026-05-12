import { useState, useCallback } from 'react';
import type { NormalizedEvent } from '../types/events';

export type BulkSelectMode = 'toggle' | 'add' | 'clear' | 'set';

export function useBulkSelect() {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const selectEvent = useCallback((id: string, mode: BulkSelectMode = 'toggle') => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      switch (mode) {
        case 'toggle': if (next.has(id)) { next.delete(id); } else { next.add(id); } break;
        case 'add':    next.add(id); break;
        case 'clear':  next.clear(); break;
        case 'set':    next.clear(); next.add(id); break;
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((events: readonly NormalizedEvent[]) => {
    setSelectedIds(new Set(events.map(e => String(e.id))));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return { selectedIds, selectEvent, selectAll, clearSelection };
}

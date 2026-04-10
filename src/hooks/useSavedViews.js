/**
 * useSavedViews — per-calendar saved filter views with localStorage persistence.
 *
 * Storage key: `wc-saved-views-${calendarId}`
 *
 * Each saved view:
 *   { id: string, name: string, createdAt: string, filters: SerializedFilters }
 *
 * SerializedFilters (Sets stored as arrays for JSON):
 *   { categories: string[], resources: string[], sources: string[],
 *     search: string, dateRange: null | { start: string, end: string } }
 */
import { useState, useEffect, useCallback } from 'react';

function viewsKey(calendarId) { return `wc-saved-views-${calendarId}`; }

function loadViews(calendarId) {
  try {
    const raw = localStorage.getItem(viewsKey(calendarId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function persistViews(calendarId, views) {
  try {
    localStorage.setItem(viewsKey(calendarId), JSON.stringify(views));
  } catch {}
}

/**
 * Convert a live filter state (with Sets) to a JSON-safe object.
 * @param {object} filters — { categories: Set, resources: Set, sources: Set, search, dateRange }
 * @returns {object} SerializedFilters
 */
export function serializeFilters(filters) {
  return {
    categories: [...(filters.categories ?? [])],
    resources:  [...(filters.resources  ?? [])],
    sources:    [...(filters.sources    ?? [])],
    search:     filters.search ?? '',
    dateRange:  filters.dateRange
      ? {
          start: filters.dateRange.start instanceof Date
            ? filters.dateRange.start.toISOString()
            : filters.dateRange.start,
          end: filters.dateRange.end instanceof Date
            ? filters.dateRange.end.toISOString()
            : filters.dateRange.end,
        }
      : null,
  };
}

/**
 * Convert a SerializedFilters object back to live filter state (with Sets).
 * @param {object} saved — SerializedFilters
 * @returns {object} live filter state
 */
export function deserializeFilters(saved) {
  return {
    categories: new Set(saved.categories ?? []),
    resources:  new Set(saved.resources  ?? []),
    sources:    new Set(saved.sources    ?? []),
    search:     saved.search ?? '',
    dateRange:  saved.dateRange
      ? {
          start: new Date(saved.dateRange.start),
          end:   new Date(saved.dateRange.end),
        }
      : null,
  };
}

/**
 * Hook for managing saved filter views per calendar.
 * @param {string} calendarId
 * @returns {{ views, saveView, deleteView }}
 */
export function useSavedViews(calendarId) {
  const [views, setViews] = useState(() => loadViews(calendarId));

  // Re-load when calendarId changes
  useEffect(() => {
    setViews(loadViews(calendarId));
  }, [calendarId]);

  // Persist on every change
  useEffect(() => {
    persistViews(calendarId, views);
  }, [calendarId, views]);

  const saveView = useCallback((name, filters) => {
    const view = {
      id:        `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      createdAt: new Date().toISOString(),
      filters:   serializeFilters(filters),
    };
    setViews(prev => [...prev, view]);
    return view;
  }, []);

  const deleteView = useCallback((id) => {
    setViews(prev => prev.filter(v => v.id !== id));
  }, []);

  return { views, saveView, deleteView };
}

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
 * Generic: converts any Set values to arrays, preserves everything else.
 *
 * @param {object} filters — live filter state (may contain Sets)
 * @returns {object} JSON-safe serialized filters
 */
export function serializeFilters(filters) {
  return JSON.parse(
    JSON.stringify(filters, (_key, value) => {
      if (value instanceof Set) return [...value];
      return value;
    }),
  );
}

/**
 * Convert a serialized filters object back to live filter state.
 * Schema-aware: restores Set for every field whose type is 'multi-select'.
 * Falls back to a hardcoded list of known Set fields when no schema given.
 *
 * @param {object}   saved  — serialized filters (arrays instead of Sets)
 * @param {import('../filters/filterSchema.js').FilterField[]} [schema]
 * @returns {object} live filter state
 */
export function deserializeFilters(saved, schema) {
  if (!saved) return {};

  const result = { ...saved };

  // Determine which keys should be restored as Sets
  let setKeys;
  if (schema) {
    setKeys = schema.filter(f => f.type === 'multi-select').map(f => f.key);
  } else {
    // Fallback for callers that don't pass a schema
    setKeys = ['categories', 'resources', 'sources'];
  }

  for (const key of setKeys) {
    if (Array.isArray(result[key])) {
      result[key] = new Set(result[key]);
    }
  }

  // Restore dateRange Date objects
  if (result.dateRange) {
    result.dateRange = {
      start: new Date(result.dateRange.start),
      end:   new Date(result.dateRange.end),
    };
  }

  return result;
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

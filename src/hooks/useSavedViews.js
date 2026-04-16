/**
 * useSavedViews — per-calendar saved filter views with localStorage persistence.
 *
 * Storage key: `wc-saved-views-${calendarId}`
 *
 * Each saved view:
 *   { id: string, name: string, createdAt: string,
 *     color?: string | null, view?: string | null,
 *     filters: SerializedFilters }
 *
 * SerializedFilters (Sets stored as arrays for JSON):
 *   { categories: string[], resources: string[], sources: string[],
 *     search: string, dateRange: null | { start: string, end: string } }
 */
import { useState, useEffect, useCallback } from 'react';
import { createId } from '../core/createId.js';

function viewsKey(calendarId) { return `wc-saved-views-${calendarId}`; }
const STORAGE_VERSION = 2;

function isValidDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeSavedView(view) {
  if (!view || typeof view !== 'object') return null;
  if (typeof view.id !== 'string' || typeof view.name !== 'string') return null;
  if (!view.filters || typeof view.filters !== 'object') return null;

  return {
    id:        view.id,
    name:      view.name,
    createdAt: typeof view.createdAt === 'string' ? view.createdAt : new Date().toISOString(),
    color:     view.color ?? null,
    view:      view.view ?? null,
    filters:   view.filters,
  };
}

function normalizeViews(views) {
  if (!Array.isArray(views)) return [];
  return views.map(normalizeSavedView).filter(Boolean);
}

function migrateSavedViewsPayload(payload, calendarId) {
  if (Array.isArray(payload)) {
    // v1 shape: direct array
    return normalizeViews(payload);
  }

  if (payload && typeof payload === 'object') {
    if (payload.version === STORAGE_VERSION) {
      return normalizeViews(payload.views);
    }

    // Future explicit migration path by version number.
    if (typeof payload.version === 'number' && payload.version > STORAGE_VERSION) {
      return [];
    }
  }

  // One-time migration from legacy wc-profiles-* key
  return migrateProfiles(calendarId);
}

function migrateProfiles(calendarId) {
  try {
    const legacyKey = `wc-profiles-${calendarId}`;
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return [];
    const profiles = JSON.parse(raw);
    // Convert profile shape to saved view shape
    return normalizeViews(profiles.map(p => ({
      id:        p.id,
      name:      p.name,
      createdAt: p.createdAt ?? new Date().toISOString(),
      color:     p.color ?? null,
      view:      p.view ?? null,
      filters:   p.filters, // already serialized (arrays, not Sets)
    })));
  } catch { return []; }
}

function loadViews(calendarId) {
  try {
    const raw = localStorage.getItem(viewsKey(calendarId));
    if (raw) {
      const migrated = migrateSavedViewsPayload(JSON.parse(raw), calendarId);
      if (migrated.length > 0) return migrated;
    } else {
      const migrated = migrateProfiles(calendarId);
      if (migrated.length > 0) return migrated;
    }
  } catch {}
  return [];
}

function persistViews(calendarId, views) {
  try {
    localStorage.setItem(viewsKey(calendarId), JSON.stringify({
      version: STORAGE_VERSION,
      views,
    }));
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
  if (
    result.dateRange &&
    typeof result.dateRange === 'object' &&
    isValidDate(result.dateRange.start) &&
    isValidDate(result.dateRange.end)
  ) {
    result.dateRange = {
      start: new Date(result.dateRange.start),
      end:   new Date(result.dateRange.end),
    };
  } else if (result.dateRange) {
    result.dateRange = null;
  }

  return result;
}

/**
 * Hook for managing saved filter views per calendar.
 * @param {string} calendarId
 * @returns {{ views, saveView, updateView, resaveView, deleteView }}
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

  const saveView = useCallback((name, filters, { color, view, conditions } = {}) => {
    const savedView = {
      id:         createId('view'),
      name,
      createdAt:  new Date().toISOString(),
      color:      color ?? null,
      view:       view ?? null,
      conditions: conditions ?? null,
      filters:    serializeFilters(filters),
    };
    setViews(prev => [...prev, savedView]);
    return savedView;
  }, []);

  const updateView = useCallback((id, patch) => {
    setViews(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
  }, []);

  const resaveView = useCallback((id, filters, viewName) => {
    setViews(prev => prev.map(v =>
      v.id === id
        ? { ...v, filters: serializeFilters(filters), view: viewName ?? v.view }
        : v
    ));
  }, []);

  const deleteView = useCallback((id) => {
    setViews(prev => prev.filter(v => v.id !== id));
  }, []);

  return { views, saveView, updateView, resaveView, deleteView };
}

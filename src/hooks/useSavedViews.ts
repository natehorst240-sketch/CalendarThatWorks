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
import { createId } from '../core/createId';

function viewsKey(calendarId) { return `wc-saved-views-${calendarId}`; }
const STORAGE_VERSION = 4;
const MIN_READABLE_VERSION = 2;

const ASSETS_ZOOM_LEVELS = new Set(['day', 'week', 'month', 'quarter']);

function isValidDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Accept the three GroupByInput shapes (string | string[] | GroupConfig[]),
 * stripping any non-serialisable fields (e.g. getKey/getLabel functions) so
 * the value survives JSON.stringify/parse.
 */
function sanitizeGroupBy(value) {
  if (typeof value === 'string' && value) return value;
  if (!Array.isArray(value) || value.length === 0) return null;

  if (value.every(item => typeof item === 'string' && item)) {
    return value.slice();
  }

  const objects = value
    .filter(item => item && typeof item === 'object' && typeof item.field === 'string' && item.field)
    .map(item => {
      const out: { field: any; label?: string; showEmpty?: boolean } = { field: item.field };
      if (typeof item.label === 'string') out.label = item.label;
      if (typeof item.showEmpty === 'boolean') out.showEmpty = item.showEmpty;
      return out;
    });
  return objects.length > 0 ? objects : null;
}

/** Accept SortConfig[] with serialisable fields only. */
function sanitizeSort(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const entries = value
    .filter(item =>
      item
      && typeof item === 'object'
      && typeof item.field === 'string'
      && item.field
      && (item.direction === 'asc' || item.direction === 'desc'),
    )
    .map(item => ({ field: item.field, direction: item.direction }));
  return entries.length > 0 ? entries : null;
}

/** Accept Set<string> | string[]; persist as string[]. */
function sanitizeCollapsedGroups(value) {
  if (value instanceof Set) value = [...value];
  if (!Array.isArray(value)) return null;
  const entries = value.filter(item => typeof item === 'string' && item);
  return entries.length > 0 ? entries : null;
}

/** Assets-view zoom level: one of 'day' | 'week' | 'month' | 'quarter', else null. */
function sanitizeZoomLevel(value) {
  return typeof value === 'string' && ASSETS_ZOOM_LEVELS.has(value) ? value : null;
}

function normalizeSavedView(view) {
  if (!view || typeof view !== 'object') return null;
  if (typeof view.id !== 'string' || typeof view.name !== 'string') return null;
  if (!view.filters || typeof view.filters !== 'object') return null;

  return {
    id:              view.id,
    name:            view.name,
    createdAt:       typeof view.createdAt === 'string' ? view.createdAt : new Date().toISOString(),
    color:           view.color ?? null,
    view:            view.view ?? null,
    conditions:      Array.isArray(view.conditions) ? view.conditions : null,
    groupBy:         sanitizeGroupBy(view.groupBy),
    sort:            sanitizeSort(view.sort),
    sortBy:          sanitizeSort(view.sortBy),
    zoomLevel:       sanitizeZoomLevel(view.zoomLevel),
    collapsedGroups: sanitizeCollapsedGroups(view.collapsedGroups),
    showAllGroups:   typeof view.showAllGroups === 'boolean' ? view.showAllGroups : null,
    hiddenFromStrip: view.hiddenFromStrip === true,
    filters:         view.filters,
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
    if (
      typeof payload.version === 'number'
      && payload.version >= MIN_READABLE_VERSION
      && payload.version <= STORAGE_VERSION
    ) {
      // v2 and v3 share the same on-disk shape; normalizeSavedView fills in
      // new fields (sort, collapsedGroups, showAllGroups) as null on load.
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
export function deserializeFilters(saved, schema?: any[]) {
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

  const saveView = useCallback((name, filters, {
    color,
    view,
    conditions,
    groupBy,
    sort,
    sortBy,
    zoomLevel,
    collapsedGroups,
    showAllGroups,
  }: {
    color?: any
    view?: any
    conditions?: any
    groupBy?: any
    sort?: any
    sortBy?: any
    zoomLevel?: any
    collapsedGroups?: any
    showAllGroups?: any
  } = {}) => {
    const savedView = {
      id:              createId('view'),
      name,
      createdAt:       new Date().toISOString(),
      color:           color ?? null,
      view:            view ?? null,
      conditions:      conditions ?? null,
      groupBy:         sanitizeGroupBy(groupBy),
      sort:            sanitizeSort(sort),
      sortBy:          sanitizeSort(sortBy),
      zoomLevel:       sanitizeZoomLevel(zoomLevel),
      collapsedGroups: sanitizeCollapsedGroups(collapsedGroups),
      showAllGroups:   typeof showAllGroups === 'boolean' ? showAllGroups : null,
      hiddenFromStrip: false,
      filters:         serializeFilters(filters),
    };
    setViews(prev => [...prev, savedView]);
    return savedView;
  }, []);

  const updateView = useCallback((id, patch) => {
    setViews(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
  }, []);

  const resaveView = useCallback((id, filters, viewName?, groupBy?, opts: {
    sort?: any
    showAllGroups?: any
    sortBy?: any
    zoomLevel?: any
    collapsedGroups?: any
  } = {}) => {
    const { sort, showAllGroups, sortBy, zoomLevel, collapsedGroups } = opts || {};
    setViews(prev => prev.map(v =>
      v.id === id
        ? {
            ...v,
            filters: serializeFilters(filters),
            view:    viewName ?? v.view,
            ...(groupBy !== undefined ? { groupBy: sanitizeGroupBy(groupBy) } : {}),
            ...(sort !== undefined ? { sort: sanitizeSort(sort) } : {}),
            ...(sortBy !== undefined ? { sortBy: sanitizeSort(sortBy) } : {}),
            ...(zoomLevel !== undefined ? { zoomLevel: sanitizeZoomLevel(zoomLevel) } : {}),
            ...(collapsedGroups !== undefined
              ? { collapsedGroups: sanitizeCollapsedGroups(collapsedGroups) }
              : {}),
            ...(showAllGroups !== undefined
              ? { showAllGroups: typeof showAllGroups === 'boolean' ? showAllGroups : null }
              : {}),
          }
        : v
    ));
  }, []);

  const deleteView = useCallback((id) => {
    setViews(prev => prev.filter(v => v.id !== id));
  }, []);

  const toggleStripVisibility = useCallback((id) => {
    setViews(prev => prev.map(v =>
      v.id === id ? { ...v, hiddenFromStrip: !v.hiddenFromStrip } : v
    ));
  }, []);

  return { views, saveView, updateView, resaveView, deleteView, toggleStripVisibility };
}

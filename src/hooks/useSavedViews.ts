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
type GroupByInput = any;
type SavedView = {
  id: string;
  name: string;
  createdAt: string;
  color: string | null;
  view: string | null;
  conditions: unknown[] | null;
  groupBy: string | string[] | Array<{ field: string; label?: string; showEmpty?: boolean }> | null;
  sort: unknown[] | null;
  sortBy: unknown[] | null;
  zoomLevel: string | null;
  collapsedGroups: string[] | null;
  showAllGroups: boolean | null;
  selectedBaseIds: string[] | null;
  hiddenFromStrip: boolean;
  filters: Record<string, unknown>;
};
type SaveViewOptions = {
  color?: string | null;
  view?: string | null;
  conditions?: unknown[] | null;
  groupBy?: unknown;
  sort?: unknown;
  sortBy?: unknown;
  zoomLevel?: unknown;
  collapsedGroups?: unknown;
  showAllGroups?: unknown;
  selectedBaseIds?: unknown;
};

function viewsKey(calendarId: string): string { return `wc-saved-views-${calendarId}`; }
const STORAGE_VERSION = 4;
const MIN_READABLE_VERSION = 2;

const ASSETS_ZOOM_LEVELS = new Set(['day', 'week', 'month', 'quarter']);

function isValidDate(value: unknown): boolean {
  if (!(typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Accept the three GroupByInput shapes (string | string[] | GroupConfig[]),
 * stripping any non-serialisable fields (e.g. getKey/getLabel functions) so
 * the value survives JSON.stringify/parse.
 */
function sanitizeGroupBy(value: any): any {
  if (typeof value === 'string' && value) return value;
  if (!Array.isArray(value) || value.length === 0) return null;

  if (value.every(item => typeof item === 'string' && item)) {
    return value.slice();
  }

  const objects = value
    .filter((item: any) => !!item && typeof item === 'object' && typeof item.field === 'string' && !!item.field)
    .map(item => {
      const out: { field: string; label?: string; showEmpty?: boolean } = { field: item.field };
      if (typeof item.label === 'string') out.label = item.label;
      if (typeof item.showEmpty === 'boolean') out.showEmpty = item.showEmpty;
      return out;
    });
  return objects.length > 0 ? objects : null;
}

/** Accept SortConfig[] with serialisable fields only. */
function sanitizeSort(value: unknown): Array<{ field: string; direction: 'asc' | 'desc' }> | null {
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
function sanitizeCollapsedGroups(value: unknown): string[] | null {
  if (value instanceof Set) value = [...value];
  if (!Array.isArray(value)) return null;
  const entries = value.filter(item => typeof item === 'string' && item);
  return entries.length > 0 ? entries : null;
}

/** Assets-view zoom level: one of 'day' | 'week' | 'month' | 'quarter', else null. */
function sanitizeZoomLevel(value: unknown): string | null {
  return typeof value === 'string' && ASSETS_ZOOM_LEVELS.has(value) ? value : null;
}

/** Base-view selected bases: persists as string[] of base ids. */
function sanitizeBaseIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.filter(item => typeof item === 'string' && item);
  return entries.length > 0 ? entries : null;
}

function normalizeSavedView(view: unknown): SavedView | null {
  if (!view || typeof view !== 'object') return null;
  const v = view as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  if (!v.filters || typeof v.filters !== 'object' || Array.isArray(v.filters)) return null;

  return {
    id:              v.id,
    name:            v.name,
    createdAt:       typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString(),
    color:           (v.color as string | null | undefined) ?? null,
    view:            (v.view as string | null | undefined) ?? null,
    conditions:      Array.isArray(v.conditions) ? v.conditions : null,
    groupBy:         sanitizeGroupBy((v.groupBy as GroupByInput | undefined) ?? null),
    sort:            sanitizeSort(v.sort),
    sortBy:          sanitizeSort(v.sortBy),
    zoomLevel:       sanitizeZoomLevel(v.zoomLevel),
    collapsedGroups: sanitizeCollapsedGroups(v.collapsedGroups),
    showAllGroups:   typeof v.showAllGroups === 'boolean' ? v.showAllGroups : null,
    selectedBaseIds: sanitizeBaseIds(v.selectedBaseIds),
    hiddenFromStrip: v.hiddenFromStrip === true,
    filters:         v.filters as Record<string, unknown>,
  };
}

function normalizeViews(views: unknown): SavedView[] {
  if (!Array.isArray(views)) return [];
  return views.map(normalizeSavedView).filter((v): v is SavedView => v !== null);
}

function migrateSavedViewsPayload(payload: unknown, calendarId: string): SavedView[] {
  if (Array.isArray(payload)) {
    // v1 shape: direct array
    return normalizeViews(payload);
  }

  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (
      typeof p.version === 'number'
      && p.version >= MIN_READABLE_VERSION
      && p.version <= STORAGE_VERSION
    ) {
      // v2–v4 share a compatible on-disk shape; normalizeSavedView fills in
      // fields added in later versions (sort, collapsedGroups, showAllGroups,
      // hiddenFromStrip) when loading older payloads.
      return normalizeViews(p.views);
    }

    // Future explicit migration path by version number.
    if (typeof p.version === 'number' && p.version > STORAGE_VERSION) {
      return [];
    }
  }

  // One-time migration from legacy wc-profiles-* key
  return migrateProfiles(calendarId);
}

function migrateProfiles(calendarId: string): SavedView[] {
  try {
    const legacyKey = `wc-profiles-${calendarId}`;
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return [];
    const profiles = JSON.parse(raw);
    // Convert profile shape to saved view shape
    return normalizeViews((profiles as Array<Record<string, unknown>>).map((p) => ({
      id:        p.id,
      name:      p.name,
      createdAt: p.createdAt ?? new Date().toISOString(),
      color:     p.color ?? null,
      view:      p.view ?? null,
      filters:   p.filters, // already serialized (arrays, not Sets)
    })));
  } catch { return []; }
}

function loadViews(calendarId: string): SavedView[] {
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

function persistViews(calendarId: string, views: SavedView[]): void {
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
export function serializeFilters<T extends Record<string, unknown>>(filters: T): Record<string, any> {
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
export function deserializeFilters(saved: Record<string, any> | null | undefined, schema?: Array<{ type: string; key: string }>): Record<string, any> {
  if (!saved) return {};

  const result: Record<string, any> = { ...saved };

  // Determine which keys should be restored as Sets
  let setKeys: string[];
  if (schema) {
    setKeys = schema.filter((f) => f.type === 'multi-select').map((f) => f.key);
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
export function useSavedViews(calendarId: string): {
  views: SavedView[];
  saveView: (name: string, filters: Record<string, unknown>, opts?: SaveViewOptions) => SavedView;
  updateView: (id: string, patch: Partial<SavedView>) => void;
  resaveView: (
    id: string,
    filters: Record<string, unknown>,
    viewName?: string | null,
    groupBy?: GroupByInput,
    opts?: {
      sort?: unknown;
      showAllGroups?: unknown;
      sortBy?: unknown;
      zoomLevel?: unknown;
      collapsedGroups?: unknown;
      selectedBaseIds?: unknown;
    },
  ) => void;
  deleteView: (id: string) => void;
  toggleStripVisibility: (id: string) => void;
} {
  const [views, setViews] = useState<SavedView[]>(() => loadViews(calendarId));

  // Re-load when calendarId changes
  useEffect(() => {
    setViews(loadViews(calendarId));
  }, [calendarId]);

  // Persist on every change
  useEffect(() => {
    persistViews(calendarId, views);
  }, [calendarId, views]);

  const saveView = useCallback((name: string, filters: Record<string, unknown>, {
    color,
    view,
    conditions,
    groupBy,
    sort,
    sortBy,
    zoomLevel,
    collapsedGroups,
    showAllGroups,
    selectedBaseIds,
  }: SaveViewOptions = {}) => {
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
      selectedBaseIds: sanitizeBaseIds(selectedBaseIds),
      hiddenFromStrip: false,
      filters:         serializeFilters(filters),
    };
    setViews(prev => [...prev, savedView]);
    return savedView;
  }, []);

  const updateView = useCallback((id: string, patch: Partial<SavedView>) => {
    setViews(prev => prev.map(v => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const resaveView = useCallback((id: string, filters: Record<string, unknown>, viewName?: string | null, groupBy?: GroupByInput, opts: {
    sort?: unknown
    showAllGroups?: unknown
    sortBy?: unknown
    zoomLevel?: unknown
    collapsedGroups?: unknown
    selectedBaseIds?: unknown
  } = {}) => {
    const { sort, showAllGroups, sortBy, zoomLevel, collapsedGroups, selectedBaseIds } = opts || {};
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
            ...(selectedBaseIds !== undefined
              ? { selectedBaseIds: sanitizeBaseIds(selectedBaseIds) }
              : {}),
          }
        : v
    ));
  }, []);

  const deleteView = useCallback((id: string) => {
    setViews(prev => prev.filter(v => v.id !== id));
  }, []);

  const toggleStripVisibility = useCallback((id: string) => {
    setViews(prev => prev.map(v =>
      v.id === id ? { ...v, hiddenFromStrip: !v.hiddenFromStrip } : v
    ));
  }, []);

  return { views, saveView, updateView, resaveView, deleteView, toggleStripVisibility };
}

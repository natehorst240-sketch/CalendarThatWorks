/**
 * profileStore.js — Save/load/delete named filter profiles in localStorage.
 *
 * Profile shape:
 * {
 *   id:      string,
 *   name:    string,
 *   color:   string | null,   // hex chip accent
 *   filters: {
 *     categories: string[],
 *     resources:  string[],
 *     search:     string,
 *   },
 *   view:    string | null,   // if set, switches view when applied
 * }
 */

function storageKey(calendarId) {
  return `wc-profiles-${calendarId}`;
}

export function loadProfiles(calendarId) {
  try {
    const raw = localStorage.getItem(storageKey(calendarId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(calendarId, profiles) {
  try {
    localStorage.setItem(storageKey(calendarId), JSON.stringify(profiles));
  } catch {
    // quota exceeded or SSR
  }
}

export function createProfile({ name, color, filters, view }) {
  return {
    id:      `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name:    name.trim(),
    color:   color || null,
    filters: {
      categories: [...(filters.categories ?? [])],
      resources:  [...(filters.resources  ?? [])],
      search:     filters.search ?? '',
    },
    view: view || null,
  };
}

/** Serialize the live filter state (Sets → arrays) for storage. */
export function serializeFilters(filters) {
  return {
    categories: [...(filters.categories ?? new Set())],
    resources:  [...(filters.resources  ?? new Set())],
    search:     filters.search ?? '',
  };
}

/** Deserialize stored filters back into live state (arrays → Sets). */
export function deserializeFilters(stored) {
  return {
    categories: new Set(stored.categories ?? []),
    resources:  new Set(stored.resources  ?? []),
    search:     stored.search ?? '',
    dateRange:  null,
  };
}

export const PROFILE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

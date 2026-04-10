/**
 * filterEngine.js — Multi-level, chainable event filter.
 *
 * Pipeline: source → category → resource → date range → text search
 */
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';

/**
 * @param {object[]} events   — normalized events
 * @param {object}   filters  — { sources, categories, resources, dateRange, search }
 */
export function applyFilters(events, filters = {}) {
  let result = events;

  // 0. Source filter (Set of _sourceId values; empty = show all)
  // Events without _sourceId (prop-injected events) are always shown.
  if (filters.sources && filters.sources.size > 0) {
    result = result.filter(e => !e._sourceId || filters.sources.has(e._sourceId));
  }

  // 1. Category filter (Set of active category strings; empty = show all)
  if (filters.categories && filters.categories.size > 0) {
    result = result.filter(e => filters.categories.has(e.category));
  }

  // 2. Resource filter
  if (filters.resources && filters.resources.size > 0) {
    result = result.filter(e => filters.resources.has(e.resource));
  }

  // 3. Date range filter
  if (filters.dateRange) {
    const { start, end } = filters.dateRange;
    if (start || end) {
      const rangeStart = start ? startOfDay(start) : new Date(0);
      const rangeEnd   = end   ? endOfDay(end)     : new Date(8640000000000000);
      result = result.filter(e =>
        isWithinInterval(e.start, { start: rangeStart, end: rangeEnd }) ||
        isWithinInterval(e.end,   { start: rangeStart, end: rangeEnd }) ||
        (e.start <= rangeStart && e.end >= rangeEnd)
      );
    }
  }

  // 4. Text search (title + resource + meta values)
  if (filters.search && filters.search.trim()) {
    const q = filters.search.toLowerCase();
    result = result.filter(e => {
      if (e.title?.toLowerCase().includes(q)) return true;
      if (e.resource?.toLowerCase().includes(q)) return true;
      if (e.category?.toLowerCase().includes(q)) return true;
      if (e.meta) {
        return Object.values(e.meta).some(v =>
          String(v).toLowerCase().includes(q)
        );
      }
      return false;
    });
  }

  return result;
}

/**
 * Extract unique sorted categories from an event list.
 */
export function getCategories(events) {
  const set = new Set();
  events.forEach(e => { if (e.category) set.add(e.category); });
  return [...set].sort();
}

/**
 * Extract unique sorted resources from an event list.
 */
export function getResources(events) {
  const set = new Set();
  events.forEach(e => { if (e.resource) set.add(e.resource); });
  return [...set].sort();
}

/**
 * Extract unique { id, label } source pairs from an event list.
 * Only includes events that have a _sourceId.
 */
export function getSources(events) {
  const seen = new Map();
  events.forEach(e => {
    if (e._sourceId && !seen.has(e._sourceId)) {
      seen.set(e._sourceId, { id: e._sourceId, label: e._sourceLabel ?? e._sourceId });
    }
  });
  return [...seen.values()];
}

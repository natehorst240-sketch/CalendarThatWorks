/**
 * filterEngine.js — schema-driven, chainable event filter.
 *
 * applyFilters(items, filters, schema) loops through the schema and applies
 * each field's filter in order. Fields with a custom predicate use it
 * directly; built-in types (text, date-range, multi-select …) fall back to
 * the shared matching helpers.
 *
 * Backward-compatible: the schema parameter defaults to DEFAULT_FILTER_SCHEMA
 * which reproduces the previous hardcoded pipeline exactly.
 */
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { DEFAULT_FILTER_SCHEMA } from './filterSchema';
import { isEmptyFilterValue }    from './filterState';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Filter an array of events using a filter state object and an optional schema.
 *
 * @param {object[]} items    — normalized events
 * @param {object}   filters  — { [fieldKey]: value }
 * @param [schema]
 * @returns {object[]}
 */
type FilterItem = Record<string, any>;
type FilterState = Record<string, any>;

export function applyFilters(
  items: FilterItem[],
  filters: FilterState = {},
  schema: any[] = DEFAULT_FILTER_SCHEMA,
): FilterItem[] {
  return items.filter((item: FilterItem) =>
    schema.every(field => {
      const value = filters[field.key];
      if (isEmptyFilterValue(value)) return true;

      // Custom predicate takes absolute priority
      if (field.predicate) return field.predicate(item, value);

      // Built-in type dispatch
      if (field.type === 'text' || field.key === 'search') {
        return _matchSearch(item, value);
      }
      if (field.type === 'date-range' || field.key === 'dateRange') {
        return _matchDateRange(item, value);
      }
      return _defaultMatch(item[field.key], value, field.type);
    }),
  );
}

// ── Built-in matching helpers ─────────────────────────────────────────────────

function _defaultMatch(itemValue: unknown, filterValue: unknown, fieldType: string): boolean {
  switch (fieldType) {
    case 'multi-select': {
      const set = filterValue instanceof Set ? filterValue : new Set((filterValue as Iterable<unknown>) ?? []);
      return set.has(itemValue);
    }
    case 'select':
      return itemValue === filterValue;
    case 'boolean':
      return Boolean(itemValue) === Boolean(filterValue);
    case 'text':
      return String(itemValue ?? '').toLowerCase()
        .includes(String(filterValue).toLowerCase());
    default:
      return true;
  }
}

function _matchDateRange(item: FilterItem, range: { start?: Date; end?: Date } | null | undefined): boolean {
  if (!range) return true;
  const { start, end } = range;
  if (!start && !end) return true;
  const rangeStart = start ? startOfDay(start) : new Date(0);
  const rangeEnd   = end   ? endOfDay(end)     : new Date(8640000000000000);
  const evStart    = item.start;
  const evEnd      = item.end ?? item.start;
  return (
    isWithinInterval(evStart, { start: rangeStart, end: rangeEnd }) ||
    isWithinInterval(evEnd,   { start: rangeStart, end: rangeEnd }) ||
    (evStart <= rangeStart && evEnd >= rangeEnd)
  );
}

function _matchSearch(item: FilterItem, query: string | null | undefined): boolean {
  if (!query || !query.trim()) return true;
  const q = query.toLowerCase();
  if (item.title?.toLowerCase().includes(q))    return true;
  if (item.resource?.toLowerCase().includes(q)) return true;
  if (item.category?.toLowerCase().includes(q)) return true;
  if (item.meta) {
    return Object.values(item.meta).some(v => String(v).toLowerCase().includes(q));
  }
  return false;
}

// ── Option extractors ─────────────────────────────────────────────────────────

/** Extract unique sorted categories from an event list. */
export function getCategories(events: FilterItem[]): string[] {
  const set = new Set<string>();
  events.forEach((e: FilterItem) => { if (e.category) set.add(e.category); });
  return [...set].sort();
}

/** Extract unique sorted resources from an event list. */
export function getResources(events: FilterItem[]): string[] {
  const set = new Set<string>();
  events.forEach((e: FilterItem) => { if (e.resource) set.add(e.resource); });
  return [...set].sort();
}

/** Extract unique { id, label } source pairs from an event list. */
export function getSources(events: FilterItem[]): Array<{ id: string; label: string }> {
  const map = new Map<string, { id: string; label: string }>();
  events.forEach((e: FilterItem) => {
    if (e._sourceId && !map.has(e._sourceId)) {
      map.set(e._sourceId, { id: e._sourceId, label: e._sourceLabel ?? e._sourceId });
    }
  });
  return [...map.values()];
}

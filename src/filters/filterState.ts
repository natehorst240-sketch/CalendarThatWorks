/**
 * filterState — pure helpers for generic filter state management.
 *
 * These functions know nothing about the UI or React. They operate on plain
 * filter state objects and FilterField schema arrays.
 */
import { DEFAULT_FILTER_SCHEMA } from './filterSchema';

// ── Value helpers ─────────────────────────────────────────────────────────────

/**
 * Return true when a filter value should be treated as "not active".
 * Handles Sets, arrays, strings, and null/undefined.
 */
export function isEmptyFilterValue(value) {
  if (value == null) return true;
  if (value instanceof Set) return value.size === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/**
 * Return the "cleared" (inactive) default value for a FilterField.
 * Uses field.defaultValue when provided, otherwise derives from field.type.
 */
export function clearFilterValue(field) {
  if (!field) return undefined;
  if (field.defaultValue !== undefined) return field.defaultValue;
  switch (field.type) {
    case 'multi-select': return new Set();
    case 'text':         return '';
    case 'date-range':   return null;
    case 'boolean':      return null;
    case 'select':       return null;
    default:             return null;
  }
}

/**
 * Return true when at least one schema field has a non-empty value in `filters`.
 * Mirrors the derivation used in FilterBar so the saved-views header can share it.
 */
export function hasActiveFilters(filters, schema: any[] = DEFAULT_FILTER_SCHEMA) {
  if (!filters) return false;
  return schema.some(field => !isEmptyFilterValue(filters[field.key]));
}

// ── Initial state ─────────────────────────────────────────────────────────────

/**
 * Build an initial FilterState from a schema.
 * Returns { [field.key]: cleared_value } for every field in the schema.
 *
 * @param schema
 * @returns {Record<string, unknown>}
 */
export function createInitialFilters(schema: any[] = DEFAULT_FILTER_SCHEMA): any {
  const filters: any = {};
  for (const field of schema) {
    filters[field.key] = clearFilterValue(field);
  }
  return filters;
}

// ── Active pills ──────────────────────────────────────────────────────────────

/**
 * Build the list of active filter pills from the current filter state.
 * Multi-select fields produce one pill per selected value.
 * Text and date-range fields are skipped (they have dedicated UI).
 *
 * Returns: Array<{ key, fieldLabel, value, displayValue }>
 *
 * Useful as context for renderFilterBar implementations.
 *
 * @param {Record<string, unknown>} filters
 * @param schema
 */
export function buildActiveFilterPills(filters, schema: any[] = DEFAULT_FILTER_SCHEMA) {
  const pills = [];
  for (const field of schema) {
    const value = filters[field.key];
    if (isEmptyFilterValue(value)) continue;
    // Skip fields with dedicated UI — they render their own active state
    if (field.type === 'date-range') continue;
    if (field.type === 'text') continue;

    if (field.type === 'multi-select' && (value instanceof Set || Array.isArray(value))) {
      const items = value instanceof Set ? [...value] : value;
      for (const v of items) {
        pills.push({
          key:          field.key,
          fieldLabel:   field.label,
          value:        v,
          displayValue: field.pillLabel ? field.pillLabel(v) : String(v),
        });
      }
    } else {
      pills.push({
        key:          field.key,
        fieldLabel:   field.label,
        value,
        displayValue: field.pillLabel ? field.pillLabel(value) : String(value),
      });
    }
  }
  return pills;
}

// ── Filter summary (for saved-view UIs) ───────────────────────────────────────

/**
 * Build a structured summary of active filters for display in saved-view UIs.
 *
 * Returns: Array<{ key, label, type, displayValues: string[] }>
 *
 * Handles all field types:
 *   multi-select  -> list of selected values (with pillLabel / options lookup)
 *   select        -> single option label (looked up from options list)
 *   text          -> the search string wrapped in quotes
 *   date-range    -> formatted start/end dates
 *   boolean       -> "Yes" / "No"
 *   custom        -> String(value) fallback
 *
 * For keys present in filters but absent from the schema (forward-compat),
 * falls back to capitalize-key + stringify.
 *
 * @param {Record<string, unknown>} filters
 * @param schema
 * @returns {Array<{ key: string, label: string, type: string, displayValues: string[] }>}
 */
export function buildFilterSummary(filters, schema: any[] = DEFAULT_FILTER_SCHEMA) {
  if (!filters) return [];

  const fieldMap = new Map();
  for (const field of schema) {
    fieldMap.set(field.key, field);
  }

  const items = [];

  // Walk schema fields first (preserves schema ordering)
  for (const field of schema) {
    const value = filters[field.key];
    if (isSummaryEmpty(value)) continue;

    const displayValues = formatFieldValue(field, value);
    if (displayValues.length === 0) continue;

    items.push({
      key:           field.key,
      label:         field.label,
      type:          field.type,
      displayValues,
    });
  }

  // Handle keys present in filters but not in schema (forward-compat)
  for (const [key, value] of Object.entries(filters)) {
    if (fieldMap.has(key)) continue; // already handled above
    if (isSummaryEmpty(value)) continue;

    const label = key.charAt(0).toUpperCase() + key.slice(1);
    const displayValues = Array.isArray(value)
      ? value.map(v => String(v))
      : [String(value)];

    items.push({ key, label, type: 'unknown', displayValues });
  }

  return items;
}

// ── Internal helpers for buildFilterSummary ────────────────────────────────────

/** Check if a value should be treated as inactive/empty for summary purposes. */
function isSummaryEmpty(value) {
  if (value == null || value === '') return true;
  if (value instanceof Set) return value.size === 0;
  if (Array.isArray(value)) return value.length === 0;
  // date-range objects with no start and no end
  if (typeof value === 'object' && !(value instanceof Date)) {
    return !value.start && !value.end;
  }
  return false;
}

/**
 * Look up the display label for a value from a field's options list.
 * Returns the option label if found, otherwise null.
 */
function lookupOptionLabel(field, rawValue) {
  if (!field.options) return null;
  const opt = field.options.find(o => o.value === rawValue);
  return opt ? opt.label : null;
}

/**
 * Resolve a single raw value to its display string, respecting
 * pillLabel > options lookup > String fallback.
 */
function resolveDisplayValue(field, rawValue) {
  if (field.pillLabel) return field.pillLabel(rawValue);
  const optLabel = lookupOptionLabel(field, rawValue);
  if (optLabel) return optLabel;
  return String(rawValue);
}

/**
 * Format a date value (Date object or ISO string) as a short readable string.
 */
function formatDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Produce the displayValues array for a single field + value pair.
 * Returns string[] (may be empty if the value is effectively inactive).
 */
function formatFieldValue(field, value) {
  switch (field.type) {
    case 'multi-select': {
      const items = value instanceof Set ? [...value] : Array.isArray(value) ? value : [value];
      return items.map(v => resolveDisplayValue(field, v));
    }

    case 'select': {
      return [resolveDisplayValue(field, value)];
    }

    case 'text': {
      const str = String(value).trim();
      return str ? [`"${str}"`] : [];
    }

    case 'date-range': {
      // value may be { start, end } with Date objects or ISO strings
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        const startStr = formatDate(value.start);
        const endStr   = formatDate(value.end);
        if (startStr && endStr) return [`${startStr} \u2013 ${endStr}`];
        if (startStr)           return [`From ${startStr}`];
        if (endStr)             return [`Until ${endStr}`];
        return [];
      }
      // Single date value (unusual but handle gracefully)
      const d = formatDate(value);
      return d ? [d] : [];
    }

    case 'boolean': {
      return [value ? 'Yes' : 'No'];
    }

    default: {
      // custom or unrecognized type
      return [String(value)];
    }
  }
}

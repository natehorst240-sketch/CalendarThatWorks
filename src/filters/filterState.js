/**
 * filterState — pure helpers for generic filter state management.
 *
 * These functions know nothing about the UI or React. They operate on plain
 * filter state objects and FilterField schema arrays.
 */
import { DEFAULT_FILTER_SCHEMA } from './filterSchema.js';

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

// ── Initial state ─────────────────────────────────────────────────────────────

/**
 * Build an initial FilterState from a schema.
 * Returns { [field.key]: cleared_value } for every field in the schema.
 *
 * @param {import('./filterSchema.js').FilterField[]} schema
 * @returns {Record<string, unknown>}
 */
export function createInitialFilters(schema = DEFAULT_FILTER_SCHEMA) {
  const filters = {};
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
 * @param {import('./filterSchema.js').FilterField[]} schema
 */
export function buildActiveFilterPills(filters, schema = DEFAULT_FILTER_SCHEMA) {
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

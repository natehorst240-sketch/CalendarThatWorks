/**
 * filterSchema — core types and default schema for the schema-driven filter engine.
 *
 * FilterField describes one filterable dimension. Hosts can pass a custom
 * filterSchema array to WorksCalendar to add unlimited extra filter fields
 * without touching internals.
 *
 * DEFAULT_FILTER_SCHEMA preserves existing behaviour (categories / resources /
 * sources / dateRange / search) while opening the door to custom schemas.
 */

// ── Field types ───────────────────────────────────────────────────────────────

export type FilterFieldType =
  | 'select'
  | 'multi-select'
  | 'date-range'
  | 'text'
  | 'boolean'
  | 'custom'

export type FilterOption = {
  /** Human-readable text shown in pills and dropdowns. */
  label: string
  /** Raw value stored in filter state and matched against item fields. */
  value: string | number | boolean
  /** Optional accent color for the pill / swatch. */
  color?: string
  /** Optional icon name or URL. */
  icon?: string
}

export type FilterField = {
  /** Unique key — matches the property name in FilterState. */
  key: string
  /** Human-readable label. Used in pills and screen-reader announcements. */
  label: string
  type: FilterFieldType
  /** Static option list. Takes precedence over getOptions when both supplied. */
  options?: FilterOption[]
  /** Placeholder text for text / search inputs. */
  placeholder?: string
  /** Whether an option dropdown supports text search. */
  searchable?: boolean
  /** Whether an active filter for this field can be individually dismissed. */
  clearable?: boolean
  /** Value used when the field is inactive (falls back to clearFilterValue). */
  defaultValue?: unknown
  /**
   * Override the display label for an active filter value.
   * Receives the raw value for a single selection; return a display string.
   */
  pillLabel?: (value: unknown) => string
  /**
   * Custom filter predicate — takes priority over all built-in matching.
   * Return true to include the item.
   */
  predicate?: (item: unknown, value: unknown) => boolean
  /**
   * Dynamically compute options from the current item list.
   * Called on render; keep it fast (it runs on every paint).
   */
  getOptions?: (items: unknown[]) => FilterOption[]
  /**
   * Hide this field from the default FilterBar UI.
   * Boolean, or a function receiving the current items + active filters.
   */
  hidden?: boolean | ((ctx: { items: unknown[]; filters: Record<string, unknown> }) => boolean)
}

/** Generic filter state — one key per FilterField, value shape depends on type. */
export type FilterState = Record<string, unknown>

// ── Default schema ────────────────────────────────────────────────────────────
// Mirrors the previously hardcoded filter pipeline so legacy behaviour is
// preserved automatically. Predicates bridge the plural filter keys
// (categories, resources, sources) to the singular event properties
// (category, resource, _sourceId).

export const DEFAULT_FILTER_SCHEMA: FilterField[] = [
  {
    key:   'categories',
    label: 'Category',
    type:  'multi-select',
    predicate: (item: any, value: any) =>
      value instanceof Set
        ? value.has(item.category)
        : (value as string[]).includes(item.category),
    getOptions: (items: any[]) => {
      const seen = new Set<string>()
      items.forEach(e => { if (e.category) seen.add(e.category) })
      return [...seen].sort().map(c => ({ label: c, value: c }))
    },
  },
  {
    key:   'resources',
    label: 'Resource',
    type:  'multi-select',
    predicate: (item: any, value: any) =>
      value instanceof Set
        ? value.has(item.resource)
        : (value as string[]).includes(item.resource),
    getOptions: (items: any[]) => {
      const seen = new Set<string>()
      items.forEach(e => { if (e.resource) seen.add(e.resource) })
      return [...seen].sort().map(r => ({ label: r, value: r }))
    },
  },
  {
    key:   'sources',
    label: 'Source',
    type:  'multi-select',
    // Events without _sourceId (passed via the events prop) are always visible.
    predicate: (item: any, value: any) =>
      !item._sourceId ||
      (value instanceof Set
        ? value.has(item._sourceId)
        : (value as string[]).includes(item._sourceId)),
    // Compute options from events that have a _sourceId tag.
    getOptions: (items: any[]) => {
      const seen = new Map<string, FilterOption>()
      items.forEach(e => {
        if (e._sourceId && !seen.has(e._sourceId)) {
          seen.set(e._sourceId, {
            label: e._sourceLabel ?? e._sourceId,
            value: e._sourceId,
          })
        }
      })
      return [...seen.values()]
    },
  },
  {
    key:   'dateRange',
    label: 'Date',
    type:  'date-range',
  },
  {
    key:         'search',
    label:       'Search',
    type:        'text',
    placeholder: 'Search events…',
  },
]

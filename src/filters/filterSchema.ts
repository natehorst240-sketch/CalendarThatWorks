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

export type FilterOperator = {
  value: string
  label: string
  noValue?: boolean
}

export function defaultOperatorsForType(type: FilterFieldType): FilterOperator[] {
  switch (type) {
    case 'multi-select':
    case 'select':
      return [
        { value: 'is',     label: 'is' },
        { value: 'is_not', label: 'is not' },
      ]
    case 'text':
      return [
        { value: 'contains',     label: 'contains' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'is',           label: 'is exactly' },
      ]
    case 'date-range':
      return [
        { value: 'between', label: 'between' },
        { value: 'before',  label: 'before' },
        { value: 'after',   label: 'after' },
      ]
    case 'boolean':
      return [
        { value: 'is', label: 'is' },
      ]
    case 'custom':
    default:
      return []
  }
}

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
  /** Operators available for this field. Defaults to defaultOperatorsForType(type). */
  operators?: FilterOperator[]
}

/** Generic filter state — one key per FilterField, value shape depends on type. */
export type FilterState = Record<string, unknown>

// ── Common-field factories ────────────────────────────────────────────────────
// Ready-made FilterField configs for fields that appear on many calendars.
// Each factory accepts an optional overrides object so callers can tweak
// key / label / options / predicate without rewriting the whole definition.
//
// Usage:
//   import { DEFAULT_FILTER_SCHEMA, statusField, priorityField } from 'works-calendar';
//   const mySchema = [...DEFAULT_FILTER_SCHEMA, statusField(), priorityField()];

/**
 * Filter by event status (confirmed / tentative / cancelled).
 * Reads item.status, falling back to 'confirmed' when absent.
 */
export function statusField(overrides: Partial<FilterField> = {}): FilterField {
  return {
    key:   'status',
    label: 'Status',
    type:  'select',
    options: [
      { label: 'Confirmed', value: 'confirmed' },
      { label: 'Tentative', value: 'tentative' },
      { label: 'Cancelled', value: 'cancelled' },
    ],
    operators: defaultOperatorsForType('select'),
    predicate: (item: any, value: any) =>
      (item.status ?? 'confirmed') === value,
    ...overrides,
  }
}

/**
 * Filter by priority level.
 * Reads item.priority or item.meta.priority.
 * Default options: low / medium / high / critical (colour-coded).
 */
export function priorityField(overrides: Partial<FilterField> = {}): FilterField {
  return {
    key:   'priority',
    label: 'Priority',
    type:  'select',
    options: [
      { label: 'Low',      value: 'low',      color: '#10b981' },
      { label: 'Medium',   value: 'medium',   color: '#f59e0b' },
      { label: 'High',     value: 'high',     color: '#ef4444' },
      { label: 'Critical', value: 'critical', color: '#7c3aed' },
    ],
    operators: defaultOperatorsForType('select'),
    predicate: (item: any, value: any) =>
      ((item as any).priority ?? (item as any).meta?.priority) === value,
    ...overrides,
  }
}

/**
 * Filter by owner / assignee (multi-select, options derived from events).
 * Reads item.owner → item.meta.owner → item.meta.assignee in that order.
 */
export function ownerField(overrides: Partial<FilterField> = {}): FilterField {
  return {
    key:   'owner',
    label: 'Owner',
    type:  'multi-select',
    operators: defaultOperatorsForType('multi-select'),
    predicate: (item: any, value: any) => {
      const owner = item.owner ?? item.meta?.owner ?? item.meta?.assignee
      return value instanceof Set
        ? value.has(owner)
        : (value as string[]).includes(owner)
    },
    getOptions: (items: any[]) => {
      const seen = new Set<string>()
      items.forEach(e => {
        const o = e.owner ?? e.meta?.owner ?? e.meta?.assignee
        if (o) seen.add(String(o))
      })
      return [...seen].sort().map(o => ({ label: o, value: o }))
    },
    ...overrides,
  }
}

/**
 * Filter by tags (multi-select, options derived from events).
 * An event matches if any of its tags is in the active filter set.
 * Reads item.tags or item.meta.tags — expected to be string[].
 */
export function tagsField(overrides: Partial<FilterField> = {}): FilterField {
  return {
    key:   'tags',
    label: 'Tag',
    type:  'multi-select',
    operators: defaultOperatorsForType('multi-select'),
    predicate: (item: any, value: any) => {
      const itemTags: string[] = item.tags ?? item.meta?.tags ?? []
      const active = value instanceof Set ? value : new Set(value as string[])
      return itemTags.some((t: string) => active.has(t))
    },
    getOptions: (items: any[]) => {
      const seen = new Set<string>()
      items.forEach(e => {
        const tags: string[] = e.tags ?? e.meta?.tags ?? []
        tags.forEach((t: string) => { if (t) seen.add(t) })
      })
      return [...seen].sort().map(t => ({ label: t, value: t }))
    },
    ...overrides,
  }
}

/**
 * Filter by any single-value meta field (select).
 * Pass the meta key name as the first argument — e.g. metaSelectField('department').
 */
export function metaSelectField(
  metaKey: string,
  overrides: Partial<FilterField> = {},
): FilterField {
  return {
    key:   metaKey,
    label: metaKey.charAt(0).toUpperCase() + metaKey.slice(1),
    type:  'select',
    operators: defaultOperatorsForType('select'),
    predicate: (item: any, value: any) =>
      (item.meta?.[metaKey] ?? item[metaKey]) === value,
    getOptions: (items: any[]) => {
      const seen = new Set<string>()
      items.forEach(e => {
        const v = e.meta?.[metaKey] ?? e[metaKey]
        if (v != null) seen.add(String(v))
      })
      return [...seen].sort().map(v => ({ label: v, value: v }))
    },
    ...overrides,
  }
}

// ── Default schema ────────────────────────────────────────────────────────────
// Mirrors the previously hardcoded filter pipeline so legacy behaviour is
// preserved automatically. Predicates bridge the plural filter keys
// (categories, resources, sources) to the singular event properties
// (category, resource, _sourceId).

/**
 * Resolve a resource id (e.g. "emp-sarah") to a human-readable label
 * (e.g. "Sarah Chen") using the merged employees + assets lookup.
 * Falls back to the raw id when no match is found.
 */
export type ResourceResolver = (id: string | number | null | undefined) => string

type ResolverInput = {
  employees?: Array<{ id: string | number; name?: string; label?: string }> | null
  assets?: Array<{ id: string | number; label?: string; name?: string }> | null
}

export function makeResourceResolver({ employees, assets }: ResolverInput = {}): ResourceResolver {
  const lookup = new Map<string, string>()
  for (const e of employees ?? []) {
    if (e && e.id != null) {
      const key = String(e.id)
      const label = (e as any).name ?? e.label ?? key
      lookup.set(key, label)
    }
  }
  // Assets register only when the id isn't already claimed by an employee.
  for (const a of assets ?? []) {
    if (a && a.id != null) {
      const key = String(a.id)
      if (lookup.has(key)) continue
      const label = a.label ?? (a as any).name ?? key
      lookup.set(key, label)
    }
  }
  return (id) => {
    if (id == null) return ''
    const key = String(id)
    return lookup.get(key) ?? key
  }
}

/**
 * Build a default schema that resolves resource ids to human-readable
 * labels using the supplied employees/assets directory. Preserves the
 * shape of DEFAULT_FILTER_SCHEMA — callers that don't need label
 * resolution can keep using the static export.
 */
export function buildDefaultFilterSchema(input: ResolverInput = {}): FilterField[] {
  const resolve = makeResourceResolver(input)
  return [
    {
      key:       'categories',
      label:     'Category',
      type:      'multi-select',
      operators: defaultOperatorsForType('multi-select'),
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
      key:       'resources',
      label:     'Resource',
      type:      'multi-select',
      operators: defaultOperatorsForType('multi-select'),
      predicate: (item: any, value: any) =>
        value instanceof Set
          ? value.has(item.resource)
          : (value as string[]).includes(item.resource),
      getOptions: (items: any[]) => {
        const seen = new Set<string>()
        items.forEach(e => { if (e.resource) seen.add(e.resource) })
        return [...seen]
          .map(r => ({ label: resolve(r), value: r }))
          .sort((a, b) => a.label.localeCompare(b.label))
      },
    },
    {
      key:       'sources',
      label:     'Source',
      type:      'multi-select',
      operators: defaultOperatorsForType('multi-select'),
      predicate: (item: any, value: any) =>
        !item._sourceId ||
        (value instanceof Set
          ? value.has(item._sourceId)
          : (value as string[]).includes(item._sourceId)),
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
      key:       'dateRange',
      label:     'Date',
      type:      'date-range',
      operators: defaultOperatorsForType('date-range'),
    },
    {
      key:         'search',
      label:       'Search',
      type:        'text',
      placeholder: 'Search events…',
      operators:   defaultOperatorsForType('text'),
    },
  ]
}

export const DEFAULT_FILTER_SCHEMA: FilterField[] = [
  {
    key:       'categories',
    label:     'Category',
    type:      'multi-select',
    operators: defaultOperatorsForType('multi-select'),
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
    key:       'resources',
    label:     'Resource',
    type:      'multi-select',
    operators: defaultOperatorsForType('multi-select'),
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
    key:       'sources',
    label:     'Source',
    type:      'multi-select',
    operators: defaultOperatorsForType('multi-select'),
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
    key:       'dateRange',
    label:     'Date',
    type:      'date-range',
    operators: defaultOperatorsForType('date-range'),
  },
  {
    key:         'search',
    label:       'Search',
    type:        'text',
    placeholder: 'Search events…',
    operators:   defaultOperatorsForType('text'),
  },
]

// ─── View-scoped schema shim ─────────────────────────────────────────────────
//
// Wraps a schema so that per-tab option lists pick up seed options in addition
// to values derived from scoped events. The Schedule tab seeds its canonical
// categories (base/on-call/shift/PTO/availability); other tabs pass through
// unchanged. Options actually FILTERED by applyFilters still use the raw
// schema, so legacy saved views with non-seed values keep working.
import { getViewScope } from '../core/viewScope'

export function viewScopedSchema(schema: FilterField[], view: string): FilterField[] {
  const scope = getViewScope(view)
  const seeds = scope.seedCategoryOptions ?? []
  if (seeds.length === 0) return schema
  const seedLower = seeds.map(s => s.toLowerCase())
  return schema.map(field => {
    if (field.key !== 'categories') return field
    const baseGetOptions = field.getOptions
    return {
      ...field,
      getOptions: (items: any[]) => {
        const derived = field.options ?? (baseGetOptions ? baseGetOptions(items) : [])
        const seen = new Set(derived.map(o => String(o.value).toLowerCase()))
        const out = derived.slice()
        seeds.forEach((v, i) => {
          if (!seen.has(seedLower[i])) out.push({ value: v, label: v })
        })
        return out
      },
    }
  })
}

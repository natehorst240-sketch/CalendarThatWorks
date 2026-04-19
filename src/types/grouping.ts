import type { NormalizedEvent } from './events.ts'

// ── GroupConfig ────────────────────────────────────────────────────────────────

/**
 * Describes one grouping dimension. Pass a string shorthand (field name) or
 * a full GroupConfig object. Arrays of either are also accepted by
 * useNormalizedConfig for multi-level grouping.
 */
export type GroupConfig = {
  /** Event field to group by. Checked on event directly, then on event.meta. */
  field: string
  /** Human-readable label for this grouping dimension (e.g. "Location"). */
  label?: string
  /**
   * Surface groups that contain no events after filtering.
   * Default: true (empty groups are shown with a 0-count header).
   */
  showEmpty?: boolean
  /**
   * Custom key extractor. Return null/'' to place the event in (Ungrouped).
   * Default: reads event[field] then event.meta[field].
   */
  getKey?: (event: NormalizedEvent) => string | null
  /**
   * Custom display label for a resolved group key.
   * Default: the key string itself.
   */
  getLabel?: (key: string, events: NormalizedEvent[]) => string
}

// ── GroupResult ────────────────────────────────────────────────────────────────

/**
 * A node in the grouping tree returned by useGroupingEngine.
 * Leaf nodes have children === [] and events contains the actual events.
 * Branch nodes (multi-level) have events === [] and children contains
 * the next nesting level.
 */
export type GroupResult = {
  /** Raw group key value (e.g. "ICU", "Night"). */
  key: string
  /** Display-ready label (may differ from key via GroupConfig.getLabel). */
  label: string
  /** Field name this grouping level targets. */
  field: string
  /** Nesting depth: 0 = top-level, 1 = second level, 2 = third level. */
  depth: number
  /**
   * Events directly owned by this group.
   * Empty for branch nodes in multi-level grouping.
   */
  events: NormalizedEvent[]
  /**
   * Child GroupResults for multi-level nesting.
   * Empty for leaf nodes (single-level grouping or deepest level).
   */
  children: GroupResult[]
}

// ── SortConfig ─────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc'

/**
 * One sort criterion. sortEvents() accepts an ordered array of SortConfig;
 * each is applied as a tiebreaker when the previous field compares equal.
 */
export type SortConfig = {
  /** Event field to sort by. Checked on event directly, then on event.meta. */
  field: string
  direction: SortDirection
  /**
   * Custom value extractor for non-standard fields.
   * Default: reads event[field] then event.meta[field].
   */
  getValue?: (event: NormalizedEvent) => unknown
}

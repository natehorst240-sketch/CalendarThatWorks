import { useMemo } from 'react'
import type { GroupConfig } from '../types/grouping.ts'

/** All accepted forms for the groupBy prop. */
export type GroupByInput =
  | string
  | GroupConfig
  | Array<string | GroupConfig>
  | null
  | undefined

/**
 * Normalise any groupBy input form to a GroupConfig[].
 *
 * Accepted forms:
 *   "location"                       → [{ field: "location" }]
 *   ["location", "shift"]            → [{ field: "location" }, { field: "shift" }]
 *   { field: "location", label: … }  → [{ field: "location", label: … }]
 *   [{ field: "location" }, …]       → as-is
 *   null / undefined                 → []
 *
 * Hard cap: no more than 3 levels (per architectural constraint).
 */
export function normalizeGroupConfig(input: GroupByInput): GroupConfig[] {
  if (!input) return []

  let configs: GroupConfig[]

  if (typeof input === 'string') {
    configs = [{ field: input }]
  } else if (Array.isArray(input)) {
    configs = input.map(item =>
      typeof item === 'string' ? { field: item } : item,
    )
  } else {
    configs = [input as GroupConfig]
  }

  // Enforce the 3-level cap defined in the architectural rules.
  if (configs.length > 3) {
    console.warn(
      `[WorksCalendar] groupBy supports at most 3 levels; truncating from ${configs.length}.`,
    )
    configs = configs.slice(0, 3)
  }

  return configs
}

/**
 * React hook wrapper: memoises the normalised config so referential equality
 * is stable when the caller provides an inline string.
 *
 * Note: callers that pass inline arrays or objects on every render should
 * memoize the value themselves to avoid unnecessary re-groupings.
 */
export function useNormalizedConfig(groupBy: GroupByInput): GroupConfig[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => normalizeGroupConfig(groupBy), [
    typeof groupBy === 'string' ? groupBy : JSON.stringify(groupBy),
  ])
}

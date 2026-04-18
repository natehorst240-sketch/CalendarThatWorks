import { useState, useMemo, useCallback } from 'react'
import type { NormalizedEvent } from '../index.d.ts'
import type { GroupConfig, GroupResult } from '../types/grouping.ts'
import { sortGroupKeys } from '../core/sortEngine.ts'
import {
  normalizeGroupConfig,
  useNormalizedConfig,
  type GroupByInput,
} from './useNormalizedConfig.ts'

// ── Internal helpers ───────────────────────────────────────────────────────────

function extractKey(event: NormalizedEvent, config: GroupConfig): string {
  if (config.getKey) {
    const k = config.getKey(event)
    return k !== null && k !== undefined && k !== '' ? k : '(Ungrouped)'
  }
  const direct = (event as unknown as Record<string, unknown>)[config.field]
  if (direct !== null && direct !== undefined && direct !== '')
    return String(direct)
  const meta = (event.meta as Record<string, unknown> | undefined)?.[config.field]
  if (meta !== null && meta !== undefined && meta !== '') return String(meta)
  return '(Ungrouped)'
}

/**
 * Build a GroupResult tree recursively.
 *
 * @param events  - Events to group at this level
 * @param configs - Remaining GroupConfig array (head = current level)
 * @param depth   - Current nesting depth (0 = top-level)
 * @param path    - Slash-joined key path used for collapse state keying
 */
function buildGroups(
  events: NormalizedEvent[],
  configs: GroupConfig[],
  depth: number,
  path: string,
): GroupResult[] {
  if (!configs.length || !events.length) return []

  const [config, ...rest] = configs

  // Bucket events by their key for this level
  const buckets = new Map<string, NormalizedEvent[]>()
  for (const event of events) {
    const key = extractKey(event, config)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(event)
  }

  const sortedKeys = sortGroupKeys([...buckets.keys()])

  return sortedKeys.map(key => {
    const bucketEvents = buckets.get(key)!
    const childPath = path ? `${path}/${key}` : key
    const label = config.getLabel
      ? config.getLabel(key, bucketEvents)
      : key

    const hasChildren = rest.length > 0

    return {
      key,
      label,
      field: config.field,
      depth,
      // Leaf nodes own the events; branch nodes pass them to children
      events: hasChildren ? [] : bucketEvents,
      children: hasChildren
        ? buildGroups(bucketEvents, rest, depth + 1, childPath)
        : [],
    }
  })
}

/** Collect all group paths in a tree for collapseAll. */
function collectAllPaths(groups: GroupResult[], prefix: string): string[] {
  return groups.flatMap(g => {
    const p = prefix ? `${prefix}/${g.key}` : g.key
    return [p, ...collectAllPaths(g.children, p)]
  })
}

/**
 * Pure, hook-free group tree builder. Callers that need grouping in a loop
 * (e.g. per-day buckets in AgendaView) use this instead of the hook.
 */
export function buildGroupTree(
  events: NormalizedEvent[],
  groupBy: GroupByInput,
): GroupResult[] {
  const configs = normalizeGroupConfig(groupBy)
  if (!configs.length) return []
  return buildGroups(events, configs, 0, '')
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type UseGroupingEngineOptions = {
  events: NormalizedEvent[]
  groupBy: GroupByInput
}

export type UseGroupingEngineResult = {
  /** Grouped tree. Empty array when groupBy is unset. */
  groups: GroupResult[]
  /**
   * Events not covered by any grouping.
   * Populated only when groupBy is null/undefined.
   */
  ungrouped: NormalizedEvent[]
  /** Set of group-path strings that are currently collapsed. */
  collapsedGroups: Set<string>
  /** Toggle collapsed state for a group identified by its path. */
  toggleGroup: (path: string) => void
  /** Expand all groups. */
  expandAll: () => void
  /** Collapse all groups. */
  collapseAll: () => void
  /** True when at least one grouping level is configured. */
  isGrouped: boolean
}

/**
 * Event-level grouping engine (Sprint 3 implementation).
 *
 * Accepts the full GroupByInput shorthand (string | string[] | GroupConfig[])
 * and returns a GroupResult tree plus collapse/expand controls.
 *
 * When groupBy is unset the hook is a pass-through: groups is [] and ungrouped
 * holds all events, so rendering code can rely on a single code path.
 *
 * Named useGroupingEngine to coexist with the row-based useGrouping (JS),
 * which is retained only for external consumers of the package API; all
 * bundled views (Agenda, Assets, Timeline) now route through buildGroupTree.
 */
export function useGroupingEngine(
  options: UseGroupingEngineOptions,
): UseGroupingEngineResult {
  const { events, groupBy } = options
  const configs = useNormalizedConfig(groupBy)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  )

  const groups = useMemo<GroupResult[]>(() => {
    if (!configs.length) return []
    return buildGroups(events, configs, 0, '')
  }, [events, configs])

  const allPaths = useMemo(() => collectAllPaths(groups, ''), [groups])

  const toggleGroup = useCallback((path: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandAll = useCallback(() => setCollapsedGroups(new Set()), [])

  const collapseAll = useCallback(
    () => setCollapsedGroups(new Set(allPaths)),
    [allPaths],
  )

  return {
    groups,
    ungrouped: configs.length ? [] : events,
    collapsedGroups,
    toggleGroup,
    expandAll,
    collapseAll,
    isGrouped: configs.length > 0,
  }
}

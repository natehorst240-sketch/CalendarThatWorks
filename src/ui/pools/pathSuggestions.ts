/**
 * Path-suggestion helper for the v2 advanced rules editor (#386).
 *
 * Walks every resource's top-level fields + `meta` tree and emits
 * the dotted paths the engine's `evaluateQuery` actually understands
 * (`id`, `name`, `tenantId`, `meta.capabilities.refrigerated`, …).
 * The set is alphabetized and deduped so a `<datalist>` rendered
 * from it stays stable across resource shuffles.
 *
 * Pure / sync. Hosts pass the same `resources` registry they pass
 * to the resolver; the editor pipes the result into a datalist for
 * progressive typing assistance.
 */
import type { EngineResource } from 'works-calendar-engine'

const TOP_LEVEL_KEYS: readonly string[] = [
  'id', 'name', 'tenantId', 'capacity', 'color', 'timezone',
]

/** Hard cap on traversal depth so a recursive `meta` blob can't OOM. */
const MAX_DEPTH = 5

/** Hard cap on the suggestion set so a giant registry doesn't pin the DOM. */
const MAX_SUGGESTIONS = 200

export function derivePathSuggestions(
  resources: ReadonlyMap<string, EngineResource> | readonly EngineResource[] | undefined,
): readonly string[] {
  if (!resources) return []
  const list = resources instanceof Map
    ? Array.from(resources.values())
    : (resources as readonly EngineResource[])

  const seen = new Set<string>(TOP_LEVEL_KEYS)
  for (const r of list) {
    if (r.meta) walkInto(r.meta as Record<string, unknown>, 'meta', 0, seen)
    if (seen.size >= MAX_SUGGESTIONS) break
  }
  return Array.from(seen).sort()
}

function walkInto(
  obj: Record<string, unknown>,
  prefix: string,
  depth: number,
  out: Set<string>,
): void {
  if (depth >= MAX_DEPTH || out.size >= MAX_SUGGESTIONS) return
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}.${key}`
    out.add(path)
    if (out.size >= MAX_SUGGESTIONS) return
    // Recurse into plain objects only — arrays and primitives are
    // leaves from the query DSL's perspective.
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
    ) {
      walkInto(value as Record<string, unknown>, path, depth + 1, out)
    }
  }
}

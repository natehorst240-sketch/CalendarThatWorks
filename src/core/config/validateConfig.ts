/**
 * `validateConfig` — cross-section integrity for `CalendarConfig`
 * (issue #386 wizard slice).
 *
 * `parseConfig` from #440 validates each section's *shape* and drops
 * malformed entries. It deliberately does NOT cross-check references
 * between sections — those typically come from external sources, and
 * the runtime validators handle them when they fire.
 *
 * `validateConfig` is the opt-in pass that walks the references:
 *
 *   - `resource.type`         ∈ `resourceTypes[].id`
 *   - `pool.memberIds[*]`     ∈ `resources[].id`
 *   - `requirement.role`      ∈ `roles[].id`
 *   - `requirement.pool`      ∈ `pools[].id`
 *   - `event.resourceId`      ∈ `resources[].id`
 *   - `event.resourcePoolId`  ∈ `pools[].id`
 *   - duplicate ids inside any section
 *
 * Each issue carries enough context for a host to render
 * "requirement[2].requires[1]: pool 'fleet-east' not found" without
 * stitching strings together.
 *
 * Pure / sync. The wizard's review step calls this; CLIs consuming
 * config files call this; nothing else has to.
 */
import type { CalendarConfig } from './calendarConfig'

export type ConfigIssueSeverity = 'error' | 'warning'

export type ConfigIssue =
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'unknown-resource-type'
      readonly section: 'resources'
      /** Human path like `resources[3].type`. */
      readonly path: string
      readonly resourceId: string
      readonly typeId: string
    }
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'unknown-pool-member'
      readonly section: 'pools'
      readonly path: string
      readonly poolId: string
      readonly memberId: string
    }
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'unknown-requirement-role'
      readonly section: 'requirements'
      readonly path: string
      readonly eventType: string
      readonly roleId: string
    }
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'unknown-requirement-pool'
      readonly section: 'requirements'
      readonly path: string
      readonly eventType: string
      readonly poolId: string
    }
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'unknown-event-resource'
      readonly section: 'events'
      readonly path: string
      readonly eventId: string
      readonly resourceId: string
    }
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'unknown-event-pool'
      readonly section: 'events'
      readonly path: string
      readonly eventId: string
      readonly poolId: string
    }
  | {
      readonly severity: ConfigIssueSeverity
      readonly kind: 'duplicate-id'
      readonly section: 'resourceTypes' | 'roles' | 'resources' | 'pools'
      readonly path: string
      readonly id: string
    }

export interface ValidateConfigResult {
  /** True when no `error`-severity issues were found. */
  readonly ok: boolean
  /** Every issue found, in the order the walker discovered them. */
  readonly issues: readonly ConfigIssue[]
}

export function validateConfig(config: CalendarConfig): ValidateConfigResult {
  const issues: ConfigIssue[] = []

  // ── Build id sets for fast lookup ──────────────────────────────────────
  const typeIds        = new Set<string>()
  const roleIds        = new Set<string>()
  const resourceIds    = new Set<string>()
  const poolIds        = new Set<string>()

  // Duplicate-id guard per section. We collect the id sets here so a
  // duplicate in (say) `resources` doesn't quietly mask later
  // membership checks — the second entry still lives in `resources[]`
  // even if the parser kept the first.
  collectIdsWithDuplicates(config.resourceTypes, 'resourceTypes', typeIds,     issues)
  collectIdsWithDuplicates(config.roles,         'roles',         roleIds,    issues)
  collectIdsWithDuplicates(config.resources,     'resources',     resourceIds, issues)
  collectIdsWithDuplicates(config.pools,         'pools',         poolIds,    issues)

  // ── resources[].type must match a resourceType id ──────────────────────
  config.resources?.forEach((r, i) => {
    if (r.type != null && !typeIds.has(r.type)) {
      issues.push({
        severity: 'error',
        kind: 'unknown-resource-type',
        section: 'resources',
        path: `resources[${i}].type`,
        resourceId: r.id,
        typeId: r.type,
      })
    }
  })

  // ── pools[].memberIds must match resource ids ─────────────────────────
  config.pools?.forEach((p, i) => {
    p.memberIds.forEach((memberId, j) => {
      if (!resourceIds.has(memberId)) {
        issues.push({
          severity: 'error',
          kind: 'unknown-pool-member',
          section: 'pools',
          path: `pools[${i}].memberIds[${j}]`,
          poolId: p.id,
          memberId,
        })
      }
    })
  })

  // ── requirements[].requires[] role / pool refs ────────────────────────
  config.requirements?.forEach((req, i) => {
    req.requires.forEach((slot, j) => {
      if ('role' in slot) {
        if (!roleIds.has(slot.role)) {
          issues.push({
            severity: 'error',
            kind: 'unknown-requirement-role',
            section: 'requirements',
            path: `requirements[${i}].requires[${j}].role`,
            eventType: req.eventType,
            roleId: slot.role,
          })
        }
      } else if (!poolIds.has(slot.pool)) {
        issues.push({
          severity: 'error',
          kind: 'unknown-requirement-pool',
          section: 'requirements',
          path: `requirements[${i}].requires[${j}].pool`,
          eventType: req.eventType,
          poolId: slot.pool,
        })
      }
    })
  })

  // ── events[].resourceId / resourcePoolId ──────────────────────────────
  config.events?.forEach((e, i) => {
    if (e.resourceId != null && !resourceIds.has(e.resourceId)) {
      issues.push({
        severity: 'error',
        kind: 'unknown-event-resource',
        section: 'events',
        path: `events[${i}].resourceId`,
        eventId: e.id,
        resourceId: e.resourceId,
      })
    }
    if (e.resourcePoolId != null && !poolIds.has(e.resourcePoolId)) {
      issues.push({
        severity: 'error',
        kind: 'unknown-event-pool',
        section: 'events',
        path: `events[${i}].resourcePoolId`,
        eventId: e.id,
        poolId: e.resourcePoolId,
      })
    }
  })

  return { ok: !issues.some(i => i.severity === 'error'), issues }
}

// ─── Internals ─────────────────────────────────────────────────────────────

function collectIdsWithDuplicates(
  items: readonly { id: string }[] | undefined,
  section: 'resourceTypes' | 'roles' | 'resources' | 'pools',
  out: Set<string>,
  issues: ConfigIssue[],
): void {
  if (!items) return
  items.forEach((item, i) => {
    if (out.has(item.id)) {
      issues.push({
        severity: 'error',
        kind: 'duplicate-id',
        section,
        path: `${section}[${i}]`,
        id: item.id,
      })
      return
    }
    out.add(item.id)
  })
}

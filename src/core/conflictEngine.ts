/**
 * conflictEngine — owner-configurable conflict detection (ticket #134-13).
 *
 * Runs before an event write (create / edit / group-change) to surface
 * violations produced by the owner's rule set. Rules are *data*, not code:
 * they live in `config.conflicts.rules` so owners can add / tune them from
 * ConfigPanel without touching host-app JS. Host callbacks remain the
 * escape hatch for custom checks via the existing `CalendarEngine`
 * validator pipeline (`src/core/engine/validation/*`); this engine is the
 * default path.
 *
 * The module is deliberately tiny: a single `evaluateConflicts()` entry
 * point + a registry of pure rule evaluators. Every evaluator returns
 * `Violation | null`; the engine aggregates violations and computes an
 * overall severity.
 */
import type { Violation } from './engine/validation/validationTypes.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimum shape we need from an event to run conflict rules. */
export interface ConflictEvent {
  readonly id: string
  readonly start: Date | string | number
  readonly end: Date | string | number
  readonly resource?: string | null
  readonly category?: string | null
  readonly meta?: Readonly<Record<string, unknown>>
}

/** Data-driven rule configuration persisted to `config.conflicts.rules`. */
export type ConflictRule =
  | ResourceOverlapRule
  | CategoryMutexRule
  | MinRestRule

export interface ResourceOverlapRule {
  readonly id: string
  readonly type: 'resource-overlap'
  readonly severity?: 'soft' | 'hard'
  /** Skip when the proposed event's category matches any of these. */
  readonly ignoreCategories?: readonly string[]
}

export interface CategoryMutexRule {
  readonly id: string
  readonly type: 'category-mutex'
  readonly severity?: 'soft' | 'hard'
  /** Categories that MUST NOT coexist for the same resource in an overlapping window. */
  readonly categories: readonly string[]
}

export interface MinRestRule {
  readonly id: string
  readonly type: 'min-rest'
  readonly severity?: 'soft' | 'hard'
  /** Required gap (in minutes) between consecutive events on the same resource. */
  readonly minutes: number
}

export interface ConflictEvaluationResult {
  readonly violations: readonly Violation[]
  readonly severity: 'none' | 'soft' | 'hard'
  /** True when there are no hard violations — caller may proceed (with warnings). */
  readonly allowed: boolean
}

export interface EvaluateConflictsInput {
  /** The event the user is trying to write. `id` may be empty for a create. */
  readonly proposed: ConflictEvent
  /** All currently-visible events. The proposed event is removed by id. */
  readonly events: readonly ConflictEvent[]
  /** Active rule set (owner-configured). */
  readonly rules: readonly ConflictRule[]
  /** Master switch — when false, returns `VALID` without running any rule. */
  readonly enabled?: boolean
}

const VALID: ConflictEvaluationResult = {
  violations: [],
  severity: 'none',
  allowed: true,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Half-open interval overlap — touching endpoints are NOT a conflict. */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

function sameResource(a: ConflictEvent, b: ConflictEvent): boolean {
  const ra = a.resource ?? ''
  const rb = b.resource ?? ''
  return ra !== '' && ra === rb
}

// ─── Built-in rule evaluators ───────────────────────────────────────────────

function evalResourceOverlap(
  rule: ResourceOverlapRule,
  proposed: ConflictEvent,
  other: ConflictEvent,
): Violation | null {
  const ignore = new Set(rule.ignoreCategories ?? [])
  if (proposed.category && ignore.has(proposed.category)) return null
  if (!sameResource(proposed, other)) return null

  const ps = toDate(proposed.start)
  const pe = toDate(proposed.end)
  const os = toDate(other.start)
  const oe = toDate(other.end)
  if (!overlaps(ps, pe, os, oe)) return null

  return {
    rule: rule.id,
    severity: rule.severity ?? 'hard',
    message: `Conflicts with "${(other as { title?: string }).title ?? other.id}" on the same resource.`,
    conflictingEventId: other.id,
    details: { type: 'resource-overlap' },
  }
}

function evalCategoryMutex(
  rule: CategoryMutexRule,
  proposed: ConflictEvent,
  other: ConflictEvent,
): Violation | null {
  const mutex = new Set(rule.categories)
  if (mutex.size < 2) return null
  if (!proposed.category || !other.category) return null
  if (!mutex.has(proposed.category) || !mutex.has(other.category)) return null
  if (proposed.category === other.category) return null
  if (!sameResource(proposed, other)) return null

  const ps = toDate(proposed.start)
  const pe = toDate(proposed.end)
  const os = toDate(other.start)
  const oe = toDate(other.end)
  if (!overlaps(ps, pe, os, oe)) return null

  return {
    rule: rule.id,
    severity: rule.severity ?? 'hard',
    message: `Categories "${proposed.category}" and "${other.category}" cannot overlap on the same resource.`,
    conflictingEventId: other.id,
    details: { type: 'category-mutex' },
  }
}

function evalMinRest(
  rule: MinRestRule,
  proposed: ConflictEvent,
  other: ConflictEvent,
): Violation | null {
  if (!(rule.minutes > 0)) return null
  if (!sameResource(proposed, other)) return null

  const ps = toDate(proposed.start)
  const pe = toDate(proposed.end)
  const os = toDate(other.start)
  const oe = toDate(other.end)

  // Gap = time between the two intervals (if non-overlapping).
  if (overlaps(ps, pe, os, oe)) return null

  const gapMs = ps >= oe ? ps.getTime() - oe.getTime() : os.getTime() - pe.getTime()
  const requiredMs = rule.minutes * 60_000
  if (gapMs >= requiredMs) return null

  return {
    rule: rule.id,
    severity: rule.severity ?? 'soft',
    message: `Only ${Math.round(gapMs / 60_000)} min between shifts; rule requires ≥${rule.minutes}.`,
    conflictingEventId: other.id,
    details: { type: 'min-rest', gapMinutes: gapMs / 60_000 },
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run every rule against every other event and return aggregated violations.
 *
 * Complexity is O(rules × events); for the calendar's typical working set
 * (<1000 events, <10 rules) this is well under the perf budget. Rules are
 * pure and side-effect-free so the result is fully memoisable by caller.
 */
export function evaluateConflicts(input: EvaluateConflictsInput): ConflictEvaluationResult {
  const { proposed, events, rules, enabled = true } = input
  if (!enabled || rules.length === 0) return VALID

  const violations: Violation[] = []
  for (const other of events) {
    if (other.id && proposed.id && other.id === proposed.id) continue
    for (const rule of rules) {
      let v: Violation | null = null
      switch (rule.type) {
        case 'resource-overlap': v = evalResourceOverlap(rule, proposed, other); break
        case 'category-mutex':   v = evalCategoryMutex(rule, proposed, other);   break
        case 'min-rest':         v = evalMinRest(rule, proposed, other);         break
        default: break
      }
      if (v) violations.push(v)
    }
  }

  if (violations.length === 0) return VALID
  const hasHard = violations.some(v => v.severity === 'hard')
  return {
    violations,
    severity: hasHard ? 'hard' : 'soft',
    allowed: !hasHard,
  }
}

export const CONFLICT_RULE_TYPES: readonly ConflictRule['type'][] = [
  'resource-overlap',
  'category-mutex',
  'min-rest',
] as const

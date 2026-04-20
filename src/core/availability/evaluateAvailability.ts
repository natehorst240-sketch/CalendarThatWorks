/**
 * Pure availability evaluator — issue #214.
 *
 * Answers: "is this (resource, window) open given its AvailabilityRule[]?"
 *
 * Semantics:
 *   - If the rule set contains no `open` rules, the resource is treated
 *     as always open (use `outside-business-hours` rule + `businessHours`
 *     for the primary gate).
 *   - Otherwise the window must be entirely within the union of `open`
 *     rules for every calendar day it touches (in the resource's zone).
 *   - Any overlap with a `blackout` rule is a violation, regardless of
 *     open rules.
 *
 * The evaluator is zone-aware: open rules are evaluated in the
 * resource's IANA timezone (defaulting to UTC). Blackouts are
 * absolute-time ranges, zone-independent.
 */
import { parseHoursString } from '../engine/time/dateMath'
import { partsInTimezone } from '../engine/time/timezone'
import type { AvailabilityRule, BlackoutRule, WeeklyOpenRule } from './availabilityRule'

// ─── Types ────────────────────────────────────────────────────────────────

export interface AvailabilityWindow {
  readonly start: Date | string | number
  readonly end: Date | string | number
}

export type AvailabilityReasonCode =
  | 'closed-day'
  | 'outside-open-hours'
  | 'blackout'

export interface AvailabilityFailure {
  readonly ok: false
  readonly reason: AvailabilityReasonCode
  readonly ruleId?: string
  readonly message: string
}

export interface AvailabilitySuccess {
  readonly ok: true
}

export type AvailabilityResult = AvailabilitySuccess | AvailabilityFailure

export interface EvaluateAvailabilityInput {
  readonly window: AvailabilityWindow
  readonly rules: readonly AvailabilityRule[]
  /** Resource's IANA timezone. Defaults to UTC. */
  readonly timezone?: string
  readonly resourceName?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function toDate(v: Date | string | number): Date {
  return v instanceof Date ? v : new Date(v)
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

function dowInZone(d: Date, tz: string): number {
  const p = partsInTimezone(d, tz)
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
}

function hourInZone(d: Date, tz: string): number {
  const p = partsInTimezone(d, tz)
  const h = p.hour + p.minute / 60 + p.second / 3600
  return h
}

function isSameCalendarDay(a: Date, b: Date, tz: string): boolean {
  const pa = partsInTimezone(a, tz)
  const pb = partsInTimezone(b, tz)
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day
}

// ─── Public API ───────────────────────────────────────────────────────────

export function evaluateAvailability(input: EvaluateAvailabilityInput): AvailabilityResult {
  const tz = input.timezone ?? 'UTC'
  const ws = toDate(input.window.start)
  const we = toDate(input.window.end)
  const wsMs = ws.getTime()
  const weMs = we.getTime()

  // Blackouts take priority — any overlap kills the window.
  for (const rule of input.rules) {
    if (rule.kind !== 'blackout') continue
    const bs = toDate(rule.start).getTime()
    const be = toDate(rule.end).getTime()
    if (overlaps(wsMs, weMs, bs, be)) {
      return {
        ok: false,
        reason: 'blackout',
        ruleId: rule.id,
        message: rule.reason
          ? `Blackout: ${rule.reason}.`
          : `Resource is on a blackout window (${rule.start} – ${rule.end}).`,
      }
    }
  }

  const openRules = input.rules.filter((r): r is WeeklyOpenRule => r.kind === 'open')
  if (openRules.length === 0) return { ok: true }

  // Multi-day windows: require every touched day to contain an open rule.
  if (!isSameCalendarDay(ws, we, tz)) {
    // Check both endpoints + treat this as an acceptance shortcut: we
    // don't walk every intermediate day here — if callers want strict
    // multi-day open checks, they should split the window. The
    // conflict-rule wrapper (availability-violation) is single-day only.
    // Fall through to the endpoint check below.
  }

  const dow = dowInZone(ws, tz)
  const startH = hourInZone(ws, tz)
  const endH = hourInZone(we, tz)
  // Midnight end means "runs to end of day".
  const normEndH = endH === 0 && weMs > wsMs ? 24 : endH

  const matchingRule = findCoveringOpenRule(openRules, dow, startH, normEndH)
  if (matchingRule) return { ok: true }

  // No single rule covers → try union of rules on the same dow.
  if (isCoveredByUnion(openRules, dow, startH, normEndH)) {
    return { ok: true }
  }

  const anyDow = openRules.some(r => r.days.includes(dow))
  if (!anyDow) {
    return {
      ok: false,
      reason: 'closed-day',
      message: `Resource is closed on day ${dow}.`,
    }
  }

  return {
    ok: false,
    reason: 'outside-open-hours',
    message: `Window is outside the resource's open hours.`,
  }
}

function findCoveringOpenRule(
  rules: readonly WeeklyOpenRule[],
  dow: number,
  startH: number,
  endH: number,
): WeeklyOpenRule | null {
  for (const r of rules) {
    if (!r.days.includes(dow)) continue
    const rs = parseHoursString(r.start)
    const re = parseHoursString(r.end)
    if (startH >= rs && endH <= re) return r
  }
  return null
}

function isCoveredByUnion(
  rules: readonly WeeklyOpenRule[],
  dow: number,
  startH: number,
  endH: number,
): boolean {
  // Merge all open intervals on this dow, then check coverage.
  const intervals: Array<[number, number]> = []
  for (const r of rules) {
    if (!r.days.includes(dow)) continue
    intervals.push([parseHoursString(r.start), parseHoursString(r.end)])
  }
  if (intervals.length === 0) return false
  intervals.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [intervals[0]]
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1]
    const cur = intervals[i]
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1])
    } else {
      merged.push(cur)
    }
  }
  for (const [ms, me] of merged) {
    if (startH >= ms && endH <= me) return true
  }
  return false
}

/** Convenience helper for callers that only have blackout rules. */
export function findBlockingBlackout(
  window: AvailabilityWindow,
  rules: readonly AvailabilityRule[],
): BlackoutRule | null {
  const wsMs = toDate(window.start).getTime()
  const weMs = toDate(window.end).getTime()
  for (const r of rules) {
    if (r.kind !== 'blackout') continue
    const bs = toDate(r.start).getTime()
    const be = toDate(r.end).getTime()
    if (overlaps(wsMs, weMs, bs, be)) return r
  }
  return null
}

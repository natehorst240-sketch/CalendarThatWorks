/**
 * `parseConfig` — validate and coerce an unknown blob into a
 * `CalendarConfig` (issue #386 wizard slice).
 *
 * Defensive: never throws. Malformed entries within a section are
 * dropped (with a count + human-readable error trail) so a single
 * bad pool doesn't reject the whole config. Top-level shape errors
 * (wrong root type, JSON parse failure) yield an empty config plus
 * an error message.
 *
 * Pure / sync. The matching `serializeConfig` reverses the process
 * for write-out; round-trip is total for valid inputs.
 */

import type {
  CalendarConfig, ConfigLabels, ConfigResourceType, ConfigRole,
  ConfigResource, ConfigRequirement, ConfigRequirementSlot,
  ConfigSeedEvent, ConfigSettings,
} from './calendarConfig'
import type { ResourcePool, PoolStrategy, PoolType } from '../pools/resourcePoolSchema'
import type { LatLon } from '../pools/geo'

export interface ParseConfigResult {
  /** Best-effort parsed config — sections may be missing or empty. */
  readonly config: CalendarConfig
  /**
   * Human-readable error messages — one per dropped entry or
   * top-level shape problem. Empty when the input parses cleanly.
   */
  readonly errors: readonly string[]
  /** Total count of dropped entries across every section. */
  readonly dropped: number
}

const STRATEGIES: readonly PoolStrategy[] = ['first-available', 'least-loaded', 'round-robin', 'closest']
const POOL_TYPES: readonly PoolType[] = ['manual', 'query', 'hybrid']
const CONFLICT_MODES: readonly NonNullable<ConfigSettings['conflictMode']>[] = ['block', 'soft', 'off']

export function parseConfig(raw: unknown): ParseConfigResult {
  const errors: string[] = []
  let dropped = 0

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      config: {},
      errors: ['root: expected an object'],
      dropped: 0,
    }
  }

  const r = raw as Record<string, unknown>
  const out: { -readonly [K in keyof CalendarConfig]: CalendarConfig[K] } = {}

  // ── profile ───────────────────────────────────────────────────────────
  if (typeof r['profile'] === 'string') out.profile = r['profile']
  else if (r['profile'] !== undefined) {
    errors.push('profile: expected string, ignoring')
  }

  // ── labels ────────────────────────────────────────────────────────────
  if (r['labels'] !== undefined) {
    const labels = parseLabels(r['labels'], errors)
    if (labels) out.labels = labels
  }

  // ── resourceTypes / roles (same shape) ───────────────────────────────
  if (r['resourceTypes'] !== undefined) {
    const { items, dropped: d } = parseLabeledIdList(r['resourceTypes'], 'resourceTypes', errors)
    dropped += d
    out.resourceTypes = items as readonly ConfigResourceType[]
  }
  if (r['roles'] !== undefined) {
    const { items, dropped: d } = parseLabeledIdList(r['roles'], 'roles', errors)
    dropped += d
    out.roles = items as readonly ConfigRole[]
  }

  // ── resources ─────────────────────────────────────────────────────────
  if (r['resources'] !== undefined) {
    const { items, dropped: d } = parseList(r['resources'], 'resources', errors, parseResource)
    dropped += d
    out.resources = items
  }

  // ── pools ─────────────────────────────────────────────────────────────
  if (r['pools'] !== undefined) {
    const { items, dropped: d } = parseList(r['pools'], 'pools', errors, parsePool)
    dropped += d
    out.pools = items
  }

  // ── requirements ──────────────────────────────────────────────────────
  if (r['requirements'] !== undefined) {
    const { items, dropped: d } = parseList(r['requirements'], 'requirements', errors, parseRequirement)
    dropped += d
    out.requirements = items
  }

  // ── events (seed) ─────────────────────────────────────────────────────
  if (r['events'] !== undefined) {
    const { items, dropped: d } = parseList(r['events'], 'events', errors, parseSeedEvent)
    dropped += d
    out.events = items
  }

  // ── settings ──────────────────────────────────────────────────────────
  if (r['settings'] !== undefined) {
    const settings = parseSettings(r['settings'], errors)
    if (settings) out.settings = settings
  }

  return { config: out, errors, dropped }
}

// ─── Section parsers ────────────────────────────────────────────────────────

function parseLabels(raw: unknown, errors: string[]): ConfigLabels | null {
  if (!isObject(raw)) {
    errors.push('labels: expected object, ignoring')
    return null
  }
  const out: { [k: string]: string } = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value
    else errors.push(`labels.${key}: expected string, ignoring`)
  }
  return out
}

function parseLabeledIdList(
  raw: unknown,
  section: 'resourceTypes' | 'roles',
  errors: string[],
): { items: readonly { id: string; label: string }[]; dropped: number } {
  if (!Array.isArray(raw)) {
    errors.push(`${section}: expected array, ignoring`)
    return { items: [], dropped: 0 }
  }
  const items: { id: string; label: string }[] = []
  let dropped = 0
  raw.forEach((item, i) => {
    if (
      isObject(item)
      && typeof item['id'] === 'string'
      && typeof item['label'] === 'string'
    ) {
      items.push({ id: item['id'], label: item['label'] })
    } else {
      errors.push(`${section}[${i}]: expected { id: string, label: string }, dropping`)
      dropped++
    }
  })
  return { items, dropped }
}

function parseResource(raw: unknown, path: string, errors: string[]): ConfigResource | null {
  if (!isObject(raw)) {
    errors.push(`${path}: expected object, dropping`)
    return null
  }
  if (typeof raw['id'] !== 'string' || typeof raw['name'] !== 'string') {
    errors.push(`${path}: missing id or name, dropping`)
    return null
  }
  const out: { -readonly [K in keyof ConfigResource]: ConfigResource[K] } = {
    id: raw['id'], name: raw['name'],
  }
  if (typeof raw['type'] === 'string') out.type = raw['type']
  if (isObject(raw['capabilities'])) out.capabilities = raw['capabilities']
  if (isLatLon(raw['location'])) out.location = raw['location'] as LatLon
  if (isObject(raw['meta'])) out.meta = raw['meta']
  return out
}

function parsePool(raw: unknown, path: string, errors: string[]): ResourcePool | null {
  if (!isObject(raw)) {
    errors.push(`${path}: expected object, dropping`)
    return null
  }
  if (typeof raw['id'] !== 'string' || typeof raw['name'] !== 'string') {
    errors.push(`${path}: missing id or name, dropping`)
    return null
  }
  if (
    !Array.isArray(raw['memberIds'])
    || !raw['memberIds'].every((m) => typeof m === 'string')
  ) {
    errors.push(`${path}: memberIds must be string[], dropping`)
    return null
  }
  if (typeof raw['strategy'] !== 'string' || !STRATEGIES.includes(raw['strategy'] as PoolStrategy)) {
    errors.push(`${path}: invalid strategy "${String(raw['strategy'])}", dropping`)
    return null
  }
  // Resolve type + query together so we can drop any pool whose
  // declared type would crash the resolver at runtime. `query` /
  // `hybrid` types REQUIRE pool.query; accepting one without it
  // means the runtime engine throws the moment it tries to schedule
  // against the pool — which contradicts the defensive parse
  // contract (drop, don't crash).
  let poolType: PoolType | undefined
  if (raw['type'] !== undefined) {
    if (typeof raw['type'] === 'string' && POOL_TYPES.includes(raw['type'] as PoolType)) {
      poolType = raw['type'] as PoolType
    } else {
      errors.push(`${path}.type: invalid value "${String(raw['type'])}", ignoring`)
    }
  }
  let query: NonNullable<ResourcePool['query']> | undefined
  if (raw['query'] !== undefined) {
    if (isObject(raw['query'])) {
      query = raw['query'] as NonNullable<ResourcePool['query']>
    } else {
      errors.push(`${path}.query: expected object, ignoring`)
    }
  }
  if ((poolType === 'query' || poolType === 'hybrid') && !query) {
    errors.push(`${path}: type "${poolType}" requires a query, dropping`)
    return null
  }
  const out: { -readonly [K in keyof ResourcePool]: ResourcePool[K] } = {
    id: raw['id'],
    name: raw['name'],
    memberIds: raw['memberIds'] as string[],
    strategy: raw['strategy'] as PoolStrategy,
  }
  if (poolType) out.type  = poolType
  if (query)    out.query = query
  if (typeof raw['rrCursor'] === 'number')  out.rrCursor = raw['rrCursor']
  if (typeof raw['disabled'] === 'boolean') out.disabled = raw['disabled']
  return out
}

function parseRequirement(raw: unknown, path: string, errors: string[]): ConfigRequirement | null {
  if (!isObject(raw)) {
    errors.push(`${path}: expected object, dropping`)
    return null
  }
  if (typeof raw['eventType'] !== 'string') {
    errors.push(`${path}: missing eventType, dropping`)
    return null
  }
  if (!Array.isArray(raw['requires'])) {
    errors.push(`${path}: requires must be an array, dropping`)
    return null
  }
  const requires: ConfigRequirementSlot[] = []
  let slotsDropped = 0
  raw['requires'].forEach((slot, i) => {
    if (isObject(slot) && typeof slot['count'] === 'number' && slot['count'] >= 0) {
      // Severity is opt-in; an unknown value is logged + ignored,
      // and the slot stays valid (treated as the default 'hard').
      // We never reject the whole slot just for a typo'd severity.
      let severity: 'hard' | 'soft' | undefined
      if (slot['severity'] !== undefined) {
        if (slot['severity'] === 'hard' || slot['severity'] === 'soft') {
          severity = slot['severity']
        } else {
          errors.push(`${path}.requires[${i}].severity: invalid value "${String(slot['severity'])}", ignoring`)
        }
      }
      if (typeof slot['role'] === 'string') {
        requires.push(severity
          ? { role: slot['role'], count: slot['count'], severity }
          : { role: slot['role'], count: slot['count'] })
        return
      }
      if (typeof slot['pool'] === 'string') {
        requires.push(severity
          ? { pool: slot['pool'], count: slot['count'], severity }
          : { pool: slot['pool'], count: slot['count'] })
        return
      }
    }
    errors.push(`${path}.requires[${i}]: expected { role|pool, count }, dropping`)
    slotsDropped++
  })
  if (requires.length === 0 && raw['requires'].length > 0 && slotsDropped > 0) {
    // Every slot was malformed — drop the whole requirement so the
    // host's "this event needs a driver" rule doesn't silently
    // become "this event has no requirements".
    return null
  }
  return { eventType: raw['eventType'], requires }
}

function parseSeedEvent(raw: unknown, path: string, errors: string[]): ConfigSeedEvent | null {
  if (!isObject(raw)) {
    errors.push(`${path}: expected object, dropping`)
    return null
  }
  if (
    typeof raw['id'] !== 'string'
    || typeof raw['title'] !== 'string'
    || typeof raw['start'] !== 'string'
    || typeof raw['end'] !== 'string'
  ) {
    errors.push(`${path}: missing id / title / start / end (all strings), dropping`)
    return null
  }
  const out: { -readonly [K in keyof ConfigSeedEvent]: ConfigSeedEvent[K] } = {
    id: raw['id'], title: raw['title'], start: raw['start'], end: raw['end'],
  }
  if (typeof raw['eventType']      === 'string') out.eventType = raw['eventType']
  if (typeof raw['resourceId']     === 'string') out.resourceId = raw['resourceId']
  if (typeof raw['resourcePoolId'] === 'string') out.resourcePoolId = raw['resourcePoolId']
  if (isObject(raw['meta']))                     out.meta = raw['meta']
  return out
}

function parseSettings(raw: unknown, errors: string[]): ConfigSettings | null {
  if (!isObject(raw)) {
    errors.push('settings: expected object, ignoring')
    return null
  }
  const out: { -readonly [K in keyof ConfigSettings]: ConfigSettings[K] } = {}
  if (raw['conflictMode'] !== undefined) {
    if (
      typeof raw['conflictMode'] === 'string'
      && CONFLICT_MODES.includes(raw['conflictMode'] as NonNullable<ConfigSettings['conflictMode']>)
    ) {
      out.conflictMode = raw['conflictMode'] as NonNullable<ConfigSettings['conflictMode']>
    } else {
      errors.push(`settings.conflictMode: invalid value "${String(raw['conflictMode'])}", ignoring`)
    }
  }
  if (typeof raw['timezone'] === 'string') out.timezone = raw['timezone']
  return out
}

// ─── Internals ──────────────────────────────────────────────────────────────

function parseList<T>(
  raw: unknown,
  section: string,
  errors: string[],
  parseItem: (item: unknown, path: string, errors: string[]) => T | null,
): { items: readonly T[]; dropped: number } {
  if (!Array.isArray(raw)) {
    errors.push(`${section}: expected array, ignoring`)
    return { items: [], dropped: 0 }
  }
  const items: T[] = []
  let dropped = 0
  raw.forEach((item, i) => {
    const parsed = parseItem(item, `${section}[${i}]`, errors)
    if (parsed) items.push(parsed)
    else dropped++
  })
  return { items, dropped }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

function isLatLon(v: unknown): boolean {
  if (!isObject(v)) return false
  return Number.isFinite(v['lat']) && Number.isFinite(v['lon'])
}

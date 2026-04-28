/**
 * Industry profile presets for `CalendarConfig` (issue #386 wizard).
 *
 * Tiny data layer — each preset ships labels, a baseline
 * `resourceTypes` catalog, a baseline `roles` catalog, and (when
 * useful) a starter pool. Hosts pick a profile in the wizard's
 * first step; `applyProfilePreset` merges the preset into the
 * user's working config without overwriting any field they've
 * already touched.
 *
 * Pure / sync. The presets are static data structures, not
 * functions, so they're cheap to import from a wizard component
 * tree without any runtime cost.
 *
 * Out of scope for this slice (each warrants its own follow-up):
 *   - Industry-specific capability catalogs (numeric ranges,
 *     boolean chips). The presets only seed the basics; the
 *     `PoolBuilder` already auto-derives capabilities from the
 *     live registry.
 *   - i18n. Labels here are English-only for v1.
 *
 * Sample data: each preset may carry a `sample` payload (resources
 * + pools) the wizard can pour into the working config so users
 * can poke around a populated registry instead of starting blank.
 * Opt-in: hosts call `getProfileSampleData(profileId)`; the wizard
 * surfaces a "Load sample data" button on the Resources step.
 */
import type {
  CalendarConfig, ConfigResource,
} from './calendarConfig'
import type { ResourcePool } from '../pools/resourcePoolSchema'

/** Stable id under which a preset is registered. */
export type ProfileId = 'trucking' | 'aviation' | 'scheduling' | 'custom'

export interface ProfilePreset {
  readonly id: ProfileId
  readonly label: string
  readonly description: string
  /**
   * The actual preset payload — every section is optional so a
   * preset can ship just labels (e.g. the `custom` preset) or a
   * full starter kit. `applyProfilePreset` merges this into the
   * user's working config.
   */
  readonly config: Partial<CalendarConfig>
  /**
   * Optional starter data — concrete resources and pools the user
   * can pour into their working config to play with a populated
   * registry. Opt-in via `getProfileSampleData(id)`; the wizard
   * exposes a "Load sample data" button rather than auto-applying.
   */
  readonly sample?: {
    readonly resources: readonly ConfigResource[]
    readonly pools: readonly ResourcePool[]
  }
}

export const PROFILE_PRESETS: Readonly<Record<ProfileId, ProfilePreset>> = {
  trucking: {
    id: 'trucking',
    label: 'Trucking',
    description: 'Loads, drivers, trucks, and trailers. Defaults that suit fleet dispatch.',
    config: {
      profile: 'trucking',
      labels: {
        resource: 'Truck',
        event:    'Load',
        location: 'Depot',
      },
      resourceTypes: [
        { id: 'vehicle', label: 'Truck' },
        { id: 'trailer', label: 'Trailer' },
        { id: 'person',  label: 'Driver' },
      ],
      roles: [
        { id: 'driver',     label: 'Driver' },
        { id: 'dispatcher', label: 'Dispatcher' },
      ],
      settings: { conflictMode: 'block' },
    },
    sample: {
      resources: [
        { id: 't1', name: 'Truck 1', type: 'vehicle',
          capabilities: { refrigerated: true, capacity_lbs: 80000 },
          location: { lat: 40.76, lon: -111.89 } },
        { id: 't2', name: 'Truck 2', type: 'vehicle',
          capabilities: { refrigerated: false, capacity_lbs: 60000 },
          location: { lat: 40.76, lon: -111.89 } },
        { id: 'd1', name: 'Alice',   type: 'person',
          meta: { roles: ['driver'] } },
        { id: 'd2', name: 'Bob',     type: 'person',
          meta: { roles: ['driver', 'dispatcher'] } },
      ],
      pools: [
        { id: 'fleet-reefer', name: 'Reefer fleet',
          type: 'query', strategy: 'first-available',
          memberIds: [],
          query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true } },
        { id: 'drivers', name: 'Drivers',
          type: 'manual', strategy: 'least-loaded',
          memberIds: ['d1', 'd2'] },
      ],
    },
  },

  aviation: {
    id: 'aviation',
    label: 'Aviation',
    description: 'Aircraft, pilots, charter flights. Fits charter / part-91 / fractional ops.',
    config: {
      profile: 'aviation',
      labels: {
        resource: 'Aircraft',
        event:    'Flight',
        location: 'Airport',
      },
      resourceTypes: [
        { id: 'aircraft', label: 'Aircraft' },
        { id: 'pilot',    label: 'Pilot' },
      ],
      roles: [
        { id: 'pilot-in-command', label: 'Pilot in Command' },
        { id: 'second-in-command', label: 'Second in Command' },
        { id: 'dispatcher',        label: 'Dispatcher' },
      ],
      settings: { conflictMode: 'block' },
    },
    sample: {
      resources: [
        { id: 'n123ab', name: 'King Air 350', type: 'aircraft',
          capabilities: { seats: 9, range_nm: 1800, pressurized: true } },
        { id: 'n456cd', name: 'Cessna 172',   type: 'aircraft',
          capabilities: { seats: 4, range_nm: 700,  pressurized: false } },
        { id: 'p1', name: 'Pat (Capt)', type: 'pilot',
          meta: { roles: ['pilot-in-command'] } },
        { id: 'p2', name: 'Sam (FO)',   type: 'pilot',
          meta: { roles: ['second-in-command'] } },
      ],
      pools: [
        { id: 'long-haul', name: 'Long-haul aircraft',
          type: 'query', strategy: 'first-available',
          memberIds: [],
          query: { op: 'gte', path: 'meta.capabilities.range_nm', value: 1500 } },
        { id: 'pilots', name: 'Pilots',
          type: 'manual', strategy: 'least-loaded',
          memberIds: ['p1', 'p2'] },
      ],
    },
  },

  scheduling: {
    id: 'scheduling',
    label: 'Scheduling',
    description: 'Rooms, equipment, and people. The general-purpose preset for shared resources.',
    config: {
      profile: 'scheduling',
      labels: {
        resource: 'Room',
        event:    'Booking',
        location: 'Building',
      },
      resourceTypes: [
        { id: 'room',      label: 'Room' },
        { id: 'equipment', label: 'Equipment' },
        { id: 'person',    label: 'Person' },
      ],
      roles: [
        { id: 'organizer', label: 'Organizer' },
        { id: 'attendee',  label: 'Attendee' },
      ],
      settings: { conflictMode: 'block' },
    },
    sample: {
      resources: [
        { id: 'rm-101', name: 'Conference 101', type: 'room',
          capabilities: { capacity: 12, has_av: true } },
        { id: 'rm-201', name: 'Boardroom',      type: 'room',
          capabilities: { capacity: 24, has_av: true } },
        { id: 'proj-1', name: 'Projector cart', type: 'equipment',
          capabilities: { has_av: true } },
      ],
      pools: [
        { id: 'av-rooms', name: 'Rooms with A/V',
          type: 'query', strategy: 'first-available',
          memberIds: [],
          query: { op: 'eq', path: 'meta.capabilities.has_av', value: true } },
      ],
    },
  },

  custom: {
    id: 'custom',
    label: 'Custom',
    description: 'Start from a blank config. Use when no preset fits or for full control.',
    config: {
      profile: 'custom',
    },
  },
}

/**
 * Convenience for the wizard's profile picker — returns the preset
 * descriptors in a stable order. Hosts can also iterate
 * `Object.values(PROFILE_PRESETS)` directly; this helper exists so
 * the wizard's first step doesn't need to know the underlying map
 * shape.
 */
export function listProfilePresets(): readonly ProfilePreset[] {
  return [
    PROFILE_PRESETS.trucking,
    PROFILE_PRESETS.aviation,
    PROFILE_PRESETS.scheduling,
    PROFILE_PRESETS.custom,
  ]
}

/**
 * Merge a preset into a working config. The user's existing fields
 * always win — applying a preset *adds* sections the user hasn't
 * touched, it never overwrites in-progress edits.
 *
 * Catalog merging (resourceTypes, roles): the preset's entries are
 * appended after the user's, with duplicate ids dropped. This
 * makes "I already added a custom role; switching to the trucking
 * preset shouldn't lose it" the natural outcome.
 *
 * Label merging: per-key — preset fills the keys the user hasn't set.
 *
 * Pure: returns a new config; never mutates inputs.
 */
export function applyProfilePreset(
  profileId: ProfileId,
  base: Readonly<CalendarConfig> = {},
): CalendarConfig {
  const preset = PROFILE_PRESETS[profileId]
  if (!preset) return { ...base }

  const merged: { -readonly [K in keyof CalendarConfig]: CalendarConfig[K] } = { ...base }
  // profile: presets always win — switching profiles should update
  // this field even if the base already had a different value.
  if (preset.config.profile !== undefined) merged.profile = preset.config.profile

  // labels: per-key, base wins; preset fills the gaps.
  if (preset.config.labels || base.labels) {
    merged.labels = { ...preset.config.labels, ...base.labels }
  }

  // catalog sections: base first (so its ordering is preserved),
  // preset entries appended for any id not already present. Skip
  // assignment when both sides are undefined so the saved object
  // doesn't carry an explicit `undefined` field (exactOptionalProperties).
  const types = mergeById(base.resourceTypes, preset.config.resourceTypes)
  if (types) merged.resourceTypes = types
  const roles = mergeById(base.roles, preset.config.roles)
  if (roles) merged.roles = roles

  // settings: per-key, base wins.
  if (preset.config.settings || base.settings) {
    merged.settings = { ...preset.config.settings, ...base.settings }
  }

  // Sections we don't touch (resources, pools, requirements,
  // events) — the user owns them; presets only seed catalog data.
  return cleanUndefined(merged)
}

/**
 * Read-only accessor for a profile's sample payload. Returns
 * `null` when the profile has no sample data (e.g. `custom`).
 * Always hands back a fresh object so callers can mutate freely.
 */
export function getProfileSampleData(
  profileId: ProfileId,
): { resources: readonly ConfigResource[]; pools: readonly ResourcePool[] } | null {
  const sample = PROFILE_PRESETS[profileId]?.sample
  if (!sample) return null
  return {
    resources: [...sample.resources],
    pools: [...sample.pools],
  }
}

/**
 * Merge a profile's sample data into a working config. Pours in
 * new resources and pools, skipping any whose `id` already exists
 * (the user's edits always win). Pure: returns a new config.
 */
export function applyProfileSampleData(
  profileId: ProfileId,
  base: Readonly<CalendarConfig>,
): CalendarConfig {
  const sample = getProfileSampleData(profileId)
  if (!sample) return { ...base }
  const existingResIds = new Set((base.resources ?? []).map(r => r.id))
  const newResources = sample.resources.filter(r => !existingResIds.has(r.id))
  const existingPoolIds = new Set((base.pools ?? []).map(p => p.id))
  const newPools = sample.pools.filter(p => !existingPoolIds.has(p.id))
  const out: { -readonly [K in keyof CalendarConfig]: CalendarConfig[K] } = { ...base }
  if (newResources.length > 0) {
    out.resources = [...(base.resources ?? []), ...newResources]
  }
  if (newPools.length > 0) {
    out.pools = [...(base.pools ?? []), ...newPools]
  }
  return out
}

// ─── Internals ──────────────────────────────────────────────────────────────

function mergeById<T extends { id: string }>(
  base: readonly T[] | undefined,
  preset: readonly T[] | undefined,
): readonly T[] | undefined {
  // Always emit a fresh array — the preset map is shipped as
  // module-level static data, so handing back its reference would
  // let callers mutate a shared default in place. (The merge path
  // below already produces a new array; the early-return shortcuts
  // were the leaks Codex flagged on #446.)
  if (!base && !preset) return undefined
  if (!preset) return [...base!]
  if (!base)   return [...preset]
  const seen = new Set(base.map(x => x.id))
  const additions = preset.filter(x => !seen.has(x.id))
  return additions.length > 0 ? [...base, ...additions] : [...base]
}

function cleanUndefined(o: { [k: string]: unknown }): CalendarConfig {
  const out: { [k: string]: unknown } = {}
  for (const k of Object.keys(o)) {
    if (o[k] !== undefined) out[k] = o[k]
  }
  return out as CalendarConfig
}

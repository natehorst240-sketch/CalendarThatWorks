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
 *   - Sample resources / events. Presets seed metadata only;
 *     concrete resources stay the host's job.
 *   - i18n. Labels here are English-only for v1.
 */
import type { CalendarConfig } from './calendarConfig'

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

// ─── Internals ──────────────────────────────────────────────────────────────

function mergeById<T extends { id: string }>(
  base: readonly T[] | undefined,
  preset: readonly T[] | undefined,
): readonly T[] | undefined {
  if (!base && !preset) return undefined
  if (!preset) return base
  if (!base)   return preset
  const seen = new Set(base.map(x => x.id))
  const additions = preset.filter(x => !seen.has(x.id))
  return additions.length > 0 ? [...base, ...additions] : base
}

function cleanUndefined(o: { [k: string]: unknown }): CalendarConfig {
  const out: { [k: string]: unknown } = {}
  for (const k of Object.keys(o)) {
    if (o[k] !== undefined) out[k] = o[k]
  }
  return out as CalendarConfig
}

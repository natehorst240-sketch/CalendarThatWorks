/**
 * `CalendarConfig` — the standard top-level config.json structure
 * proposed in the issue thread (issue #386 wizard slice).
 *
 * One object describes everything a host needs to bootstrap a
 * WorksCalendar instance: label overrides, resource / role
 * catalogs, the resource registry, pools, requirement templates,
 * seed events, and top-level settings. Hosts can hand-author it,
 * generate it via the eventual setup wizard, or round-trip it
 * through `parseConfig` / `serializeConfig`.
 *
 * This module is *only* the data structure. The runtime engine
 * doesn't yet consume `requirements` (that's a separate follow-up);
 * the type lives here so the wizard's output can round-trip without
 * loss when that consumer lands.
 *
 * Every section is optional so a partial config (e.g. just
 * `{ resources: [...] }`) is valid — the wizard generates section
 * stubs as it walks the user through setup.
 */

import type { ResourcePool } from '../pools/resourcePoolSchema'
import type { LatLon } from '../pools/geo'

export interface CalendarConfig {
  /**
   * Industry profile preset hint — informational only. Used by the
   * wizard / demos to apply default labels and capability lists.
   * The engine doesn't enforce or validate the value.
   */
  readonly profile?: string
  /** UI label overrides — what to call resources / events / etc. */
  readonly labels?: ConfigLabels
  /** Resource type catalog (e.g. "vehicle", "person"). */
  readonly resourceTypes?: readonly ConfigResourceType[]
  /** Role catalog (e.g. "driver", "dispatcher"). */
  readonly roles?: readonly ConfigRole[]
  /** Resource registry — typed wrapper around the runtime shape. */
  readonly resources?: readonly ConfigResource[]
  /** Pool definitions — same shape as the runtime `ResourcePool`. */
  readonly pools?: readonly ResourcePool[]
  /** Requirement templates (event type → roles / pools needed). */
  readonly requirements?: readonly ConfigRequirement[]
  /** Seed events (initial fixtures for demos / config-driven setup). */
  readonly events?: readonly ConfigSeedEvent[]
  /** Top-level settings. */
  readonly settings?: ConfigSettings
}

export interface ConfigLabels {
  /** What to call a resource (e.g. "Truck", "Aircraft", "Room"). */
  readonly resource?: string
  /** What to call an event (e.g. "Load", "Charter", "Booking"). */
  readonly event?: string
  /** What to call a location (e.g. "Depot", "Origin"). */
  readonly location?: string
  /** Free-form additional label overrides. */
  readonly [k: string]: string | undefined
}

export interface ConfigResourceType {
  readonly id: string
  readonly label: string
}

export interface ConfigRole {
  readonly id: string
  readonly label: string
}

/**
 * The wizard / config-driven shape for a resource. Strict-typed
 * `type`, `capabilities`, and `location` map to the runtime
 * `EngineResource.meta.*` convention used by the v2 query engine.
 */
export interface ConfigResource {
  readonly id: string
  readonly name: string
  /** FK into `ConfigResourceType.id`. */
  readonly type?: string
  /** Boolean / numeric / string capability flags. */
  readonly capabilities?: Readonly<Record<string, unknown>>
  /** lat/lon convention used by the v2 distance ops. */
  readonly location?: LatLon
  /** Free-form additional metadata. Merged into the runtime `meta`. */
  readonly meta?: Readonly<Record<string, unknown>>
}

export interface ConfigRequirement {
  /** Matches against the `eventType` of a runtime event. */
  readonly eventType: string
  readonly requires: readonly ConfigRequirementSlot[]
}

/**
 * `hard` (default): unmet → `satisfied: false`, blocks submit
 * gating when wired. `soft`: unmet → still in `missing[]` with the
 * severity tag, but `satisfied` ignores it. Lets a template say
 * "this load *prefers* a co-driver" without rejecting the booking
 * when no co-driver is available.
 */
export type ConfigRequirementSeverity = 'hard' | 'soft'

export type ConfigRequirementSlot =
  | { readonly role: string; readonly count: number; readonly severity?: ConfigRequirementSeverity }
  | { readonly pool: string; readonly count: number; readonly severity?: ConfigRequirementSeverity }

export interface ConfigSeedEvent {
  readonly id: string
  readonly title: string
  /** ISO 8601 timestamp. Stored as a string for JSON round-trip. */
  readonly start: string
  readonly end: string
  readonly eventType?: string
  /** Optional concrete resource pin — interchangeable with `resourcePoolId`. */
  readonly resourceId?: string
  readonly resourcePoolId?: string
  readonly meta?: Readonly<Record<string, unknown>>
}

export interface ConfigSettings {
  /**
   * How to handle hard-conflict resolutions on submit.
   *  - `block` — reject (default; matches the runtime engine today).
   *  - `soft`  — flag but allow.
   *  - `off`   — skip the check entirely.
   * The runtime engine doesn't yet consume this field; it's
   * round-tripped so the wizard's output isn't lossy.
   */
  readonly conflictMode?: 'block' | 'soft' | 'off'
  /** IANA timezone identifier (e.g. "America/Denver"). */
  readonly timezone?: string
}

/**
 * resolveLabels — single source of truth for the label abstraction
 * layer (sprint #424 wk5).
 *
 * Views call this once with the host's `CalendarConfig` (or a partial
 * legacy config object) and get a fully-defaulted label dict back.
 * The output is the only thing UI code should read; it lets every
 * surface render with profile-aware labels (Truck / Aircraft /
 * Equipment) without re-implementing the fallback ladder.
 *
 * Resolution order, per key:
 *   1. `config.labels[key]` — explicit override from the config block.
 *   2. Profile preset default (computed from `config.profile`).
 *   3. Built-in fallback (generic word).
 *
 * Pure / sync. Returns a new object so callers can mutate freely.
 */
import type { CalendarConfig } from './calendarConfig';
import { PROFILE_PRESETS, type ProfileId } from './profilePresets';

/**
 * The keys the label layer guarantees. Hosts may add their own custom
 * labels under `labels[k]` and they ride through unchanged, but the
 * canonical four are filled with profile-aware defaults.
 */
export interface ResolvedLabels {
  /** What to call a single resource ("Truck", "Aircraft", "Room"). */
  resource: string;
  /** Pluralized resource label, e.g. "Trucks". */
  resources: string;
  /** What to call a single event ("Load", "Mission", "Booking"). */
  event: string;
  /** Pluralized event label. */
  events: string;
  /** What to call a location ("Depot", "Base", "Yard"). */
  location: string;
  /** Pluralized location label. */
  locations: string;
  /** Free-form additional labels passed through verbatim. */
  [k: string]: string;
}

const FALLBACK = {
  resource: 'Resource',
  event:    'Event',
  location: 'Location',
} as const;

function pluralize(word: string): string {
  if (!word) return word;
  // Tiny English pluralizer — covers the every-day cases the four
  // canonical labels ride through. Complex words (oxen, alumni) need
  // an explicit `labels.resources`/`labels.events` override.
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word))     return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function presetLabels(profile: string | undefined): Partial<Record<string, string>> {
  if (!profile) return {};
  const preset = PROFILE_PRESETS[profile as ProfileId];
  return preset?.config.labels ?? {};
}

export function resolveLabels(
  config: { profile?: string | undefined; labels?: Partial<Record<string, string>> | undefined } | null | undefined,
): ResolvedLabels {
  const profile = config?.profile;
  const overrides = (config?.labels ?? {}) as Partial<Record<string, string>>;
  const presets = presetLabels(profile);

  const resource = overrides['resource'] ?? presets['resource'] ?? FALLBACK.resource;
  const event    = overrides['event']    ?? presets['event']    ?? FALLBACK.event;
  const location = overrides['location'] ?? presets['location'] ?? FALLBACK.location;

  const resources = overrides['resources'] ?? pluralize(resource);
  const events    = overrides['events']    ?? pluralize(event);
  const locations = overrides['locations'] ?? pluralize(location);

  // Carry through any extra keys the host set (preset extras as well,
  // host wins) so consumers that read `labels.aircraft` or similar
  // free-form keys still find them.
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(presets)) {
    if (typeof v === 'string') extras[k] = v;
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === 'string') extras[k] = v;
  }

  return {
    ...extras,
    resource, resources,
    event, events,
    location, locations,
  };
}

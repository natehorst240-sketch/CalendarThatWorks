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
 * Coercion: owner config is loaded from raw JSON (`loadConfig` does no
 * runtime type validation), so any of these values may arrive as
 * non-strings (numbers, nulls, objects). Every input runs through
 * `coerceLabel` which trims and discards anything that isn't a
 * non-empty string — the fallback ladder takes over instead, and UI
 * code can call `.toLowerCase()` on the result without crashing the
 * toolbar on a stray `labels.event: 42`.
 *
 * Pure / sync. Returns a new object so callers can mutate freely.
 */
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

/**
 * Narrow an arbitrary value to a usable label string. Returns null for
 * anything that isn't a non-empty trimmed string so the resolver
 * falls through to its next ladder rung instead of binding a number /
 * boolean / object to a label slot.
 */
function coerceLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pluralize(word: string): string {
  if (!word) return word;
  // Tiny English pluralizer — covers the every-day cases the four
  // canonical labels ride through. Complex words (oxen, alumni) need
  // an explicit `labels.resources`/`labels.events` override.
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word))     return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

function presetLabels(profile: unknown): Partial<Record<string, string>> {
  if (typeof profile !== 'string') return {};
  const preset = PROFILE_PRESETS[profile as ProfileId];
  return preset?.config.labels ?? {};
}

export function resolveLabels(
  config: { profile?: unknown; labels?: unknown } | null | undefined,
): ResolvedLabels {
  // Defensive narrowing — config is allowed to be `unknown`-shaped at
  // the boundary because hosts hand us raw JSON. Anything that isn't
  // a plain object falls through to fallbacks.
  const rawLabels = (config && typeof config === 'object' && 'labels' in config)
    ? (config as { labels?: unknown }).labels
    : undefined;
  const overrides: Record<string, unknown> = rawLabels && typeof rawLabels === 'object'
    ? rawLabels as Record<string, unknown>
    : {};
  const presets = presetLabels((config as { profile?: unknown } | null | undefined)?.profile);

  const resource = coerceLabel(overrides['resource']) ?? coerceLabel(presets['resource']) ?? FALLBACK.resource;
  const event    = coerceLabel(overrides['event'])    ?? coerceLabel(presets['event'])    ?? FALLBACK.event;
  const location = coerceLabel(overrides['location']) ?? coerceLabel(presets['location']) ?? FALLBACK.location;

  const resources = coerceLabel(overrides['resources']) ?? pluralize(resource);
  const events    = coerceLabel(overrides['events'])    ?? pluralize(event);
  const locations = coerceLabel(overrides['locations']) ?? pluralize(location);

  // Carry through any extra keys the host set (preset extras as well,
  // host wins) so consumers that read `labels.aircraft` or similar
  // free-form keys still find them. Non-string values are dropped at
  // the same boundary so consumers never see a stray number/null.
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(presets)) {
    const coerced = coerceLabel(v);
    if (coerced) extras[k] = coerced;
  }
  for (const [k, v] of Object.entries(overrides)) {
    const coerced = coerceLabel(v);
    if (coerced) extras[k] = coerced;
  }

  return {
    ...extras,
    resource, resources,
    event, events,
    location, locations,
  };
}

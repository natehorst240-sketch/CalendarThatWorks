/**
 * `serializeConfig` — pure converter from `CalendarConfig` to a
 * JSON-safe plain object (issue #386 wizard slice).
 *
 * The matching `parseConfig` reverses the process. Round-trip is
 * lossless for every field defined in `calendarConfig.ts`. Callers
 * stringify the result themselves so they can pick formatting:
 *
 *   const text = JSON.stringify(serializeConfig(config), null, 2)
 *
 * Sections that are absent from the input are omitted from the
 * output — a pristine `{}` config produces `{}`, not a noisy stub
 * with empty arrays for every section.
 */

import type {
  CalendarConfig, ConfigLabels, ConfigResource, ConfigRequirement,
  ConfigSeedEvent, ConfigSettings, ConfigResourceType, ConfigRole,
} from './calendarConfig'
import type { ResourcePool } from '../pools/resourcePoolSchema'

export function serializeConfig(config: CalendarConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (config.profile        !== undefined) out['profile'] = config.profile
  if (config.labels         !== undefined) out['labels'] = serializeLabels(config.labels)
  if (config.resourceTypes  !== undefined) out['resourceTypes'] = config.resourceTypes.map(serializeIdLabel)
  if (config.roles          !== undefined) out['roles'] = config.roles.map(serializeIdLabel)
  if (config.resources      !== undefined) out['resources'] = config.resources.map(serializeResource)
  if (config.pools          !== undefined) out['pools'] = config.pools.map(serializePool)
  if (config.requirements   !== undefined) out['requirements'] = config.requirements.map(serializeRequirement)
  if (config.events         !== undefined) out['events'] = config.events.map(serializeSeedEvent)
  if (config.settings       !== undefined) out['settings'] = serializeSettings(config.settings)
  return out
}

// ─── Section serializers ───────────────────────────────────────────────────

function serializeLabels(labels: ConfigLabels): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(labels)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function serializeIdLabel(item: ConfigResourceType | ConfigRole): Record<string, unknown> {
  return { id: item.id, label: item.label }
}

function serializeResource(r: ConfigResource): Record<string, unknown> {
  const out: Record<string, unknown> = { id: r.id, name: r.name }
  if (r.type         !== undefined) out['type']         = r.type
  if (r.capabilities !== undefined) out['capabilities'] = r.capabilities
  if (r.location     !== undefined) out['location']     = { lat: r.location.lat, lon: r.location.lon }
  if (r.meta         !== undefined) out['meta']         = r.meta
  return out
}

function serializePool(p: ResourcePool): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id, name: p.name, memberIds: [...p.memberIds], strategy: p.strategy,
  }
  if (p.type     !== undefined) out['type']     = p.type
  if (p.query    !== undefined) out['query']    = p.query
  if (p.rrCursor !== undefined) out['rrCursor'] = p.rrCursor
  if (p.disabled !== undefined) out['disabled'] = p.disabled
  return out
}

function serializeRequirement(r: ConfigRequirement): Record<string, unknown> {
  return {
    eventType: r.eventType,
    requires: r.requires.map((slot) => {
      const base = 'role' in slot
        ? { role: slot.role, count: slot.count }
        : { pool: slot.pool, count: slot.count }
      // Only emit severity when the slot specified one — preserves
      // the "default hard, omit when implicit" round-trip contract.
      return slot.severity ? { ...base, severity: slot.severity } : base
    }),
  }
}

function serializeSeedEvent(e: ConfigSeedEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: e.id, title: e.title, start: e.start, end: e.end,
  }
  if (e.eventType      !== undefined) out['eventType']      = e.eventType
  if (e.resourceId     !== undefined) out['resourceId']     = e.resourceId
  if (e.resourcePoolId !== undefined) out['resourcePoolId'] = e.resourcePoolId
  if (e.meta           !== undefined) out['meta']           = e.meta
  return out
}

function serializeSettings(s: ConfigSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (s.conflictMode !== undefined) out['conflictMode'] = s.conflictMode
  if (s.timezone     !== undefined) out['timezone']     = s.timezone
  return out
}

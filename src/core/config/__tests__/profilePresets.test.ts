/**
 * Profile preset tests (#386 wizard).
 */
import { describe, it, expect } from 'vitest'
import {
  PROFILE_PRESETS, applyProfilePreset, listProfilePresets,
  getProfileSampleData, applyProfileSampleData,
} from '../profilePresets'
import type { CalendarConfig } from '../calendarConfig'

describe('PROFILE_PRESETS — shape', () => {
  it('ships every registered preset with stable ids and labels', () => {
    expect(Object.keys(PROFILE_PRESETS).sort())
      .toEqual(['air_medical', 'aviation', 'custom', 'equipment_rental', 'scheduling', 'trucking'])
    for (const preset of Object.values(PROFILE_PRESETS)) {
      expect(preset.id).toBeTruthy()
      expect(preset.label).toBeTruthy()
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('listProfilePresets returns the same set in a stable order', () => {
    const ids = listProfilePresets().map(p => p.id)
    expect(ids).toEqual([
      'trucking', 'aviation', 'air_medical', 'equipment_rental', 'scheduling', 'custom',
    ])
  })

  it('every preset carries a `profile` field that matches its id', () => {
    for (const preset of Object.values(PROFILE_PRESETS)) {
      expect(preset.config.profile).toBe(preset.id)
    }
  })
})

describe('applyProfilePreset — fresh start', () => {
  it('seeds a brand-new config from the trucking preset', () => {
    const out = applyProfilePreset('trucking')
    expect(out.profile).toBe('trucking')
    expect(out.labels?.resource).toBe('Truck')
    expect(out.resourceTypes?.map(t => t.id)).toEqual(['vehicle', 'trailer', 'person'])
    expect(out.roles?.map(r => r.id)).toEqual(['driver', 'dispatcher'])
  })

  it('aviation seeds aircraft + pilot + dispatcher roles', () => {
    const out = applyProfilePreset('aviation')
    expect(out.labels?.resource).toBe('Aircraft')
    expect(out.resourceTypes?.map(t => t.id)).toEqual(['aircraft', 'pilot'])
    expect(out.roles?.map(r => r.id))
      .toEqual(['pilot-in-command', 'second-in-command', 'dispatcher'])
  })

  it('scheduling preset uses Room labels + organizer/attendee roles', () => {
    const out = applyProfilePreset('scheduling')
    expect(out.labels?.resource).toBe('Room')
    expect(out.labels?.event).toBe('Booking')
    expect(out.roles?.map(r => r.id)).toEqual(['organizer', 'attendee'])
  })

  it('custom preset returns a near-empty config (just the profile id)', () => {
    const out = applyProfilePreset('custom')
    expect(out).toEqual({ profile: 'custom' })
  })
})

describe('applyProfilePreset — merging into an existing config', () => {
  it('keeps user-supplied label keys; preset fills only the gaps', () => {
    const base: CalendarConfig = {
      labels: { resource: 'Rig', event: 'Run' },
    }
    const out = applyProfilePreset('trucking', base)
    expect(out.labels?.resource).toBe('Rig')   // user wins
    expect(out.labels?.event).toBe('Run')      // user wins
    expect(out.labels?.location).toBe('Depot') // preset fills
  })

  it('appends preset catalog entries without dropping the user\'s existing ones', () => {
    const base: CalendarConfig = {
      roles: [{ id: 'safety-officer', label: 'Safety Officer' }],
    }
    const out = applyProfilePreset('trucking', base)
    expect(out.roles!.map(r => r.id))
      .toEqual(['safety-officer', 'driver', 'dispatcher'])
  })

  it('skips preset entries whose ids already exist in the base', () => {
    const base: CalendarConfig = {
      // User already added a "driver" role with their own label.
      roles: [{ id: 'driver', label: 'Truck Driver' }],
    }
    const out = applyProfilePreset('trucking', base)
    const driver = out.roles!.find(r => r.id === 'driver')!
    expect(driver.label).toBe('Truck Driver')   // user's label preserved
    expect(out.roles!.length).toBe(2)            // preset's dispatcher appended
  })

  it('preserves user-owned sections the preset does not touch', () => {
    const base: CalendarConfig = {
      resources: [{ id: 't1', name: 'Truck 1' }],
      pools: [{ id: 'fleet', name: 'Fleet', memberIds: [], strategy: 'first-available' }],
    }
    const out = applyProfilePreset('trucking', base)
    expect(out.resources).toBe(base.resources)   // same reference, not rewritten
    expect(out.pools).toBe(base.pools)
  })

  it('user-supplied profile is overwritten when a different preset is applied', () => {
    const base: CalendarConfig = { profile: 'trucking' }
    const out = applyProfilePreset('aviation', base)
    expect(out.profile).toBe('aviation')
  })

  it('per-key settings merge: base wins where set, preset fills gaps', () => {
    const base: CalendarConfig = { settings: { timezone: 'America/Denver' } }
    const out = applyProfilePreset('trucking', base)
    expect(out.settings).toEqual({
      timezone: 'America/Denver',
      conflictMode: 'block',
    })
  })

  it('does not mutate the input config', () => {
    const base: CalendarConfig = { roles: [{ id: 'x', label: 'X' }] }
    const before = JSON.parse(JSON.stringify(base))
    applyProfilePreset('trucking', base)
    expect(base).toEqual(before)
  })
})

describe('applyProfilePreset — defensive', () => {
  it('does not share array references with the static PROFILE_PRESETS map (#386 P1)', () => {
    // Hand-out preset-backed catalogs would let downstream mutations
    // corrupt the module-level default. Apply twice; mutate the first
    // result; the second should be unaffected.
    const first = applyProfilePreset('trucking');
    (first.roles as Array<{ id: string; label: string }>).push({ id: 'rogue', label: 'Rogue' })

    const second = applyProfilePreset('trucking')
    expect(second.roles!.map(r => r.id)).not.toContain('rogue')
    // And the static preset itself is untouched.
    expect(PROFILE_PRESETS.trucking.config.roles!.map(r => r.id)).toEqual(['driver', 'dispatcher'])
  })

  it('returns a copy of the base when the profile id is unknown', () => {
    // Cast through unknown — types prevent this at compile-time but
    // hosts can still pass a string from a URL / JSON file at runtime.
    const out = applyProfilePreset('nonexistent' as unknown as 'trucking', { profile: 'kept' })
    expect(out).toEqual({ profile: 'kept' })
  })

  it('omits empty sections rather than emitting noisy stubs', () => {
    const out = applyProfilePreset('custom')
    // `custom` ships only `profile`; no labels / catalogs should appear.
    expect(Object.keys(out)).toEqual(['profile'])
  })
})

describe('getProfileSampleData (#451)', () => {
  it('returns null for the custom preset (no sample data)', () => {
    expect(getProfileSampleData('custom')).toBeNull()
  })

  it('returns a fresh copy for trucking with at least one resource and one pool', () => {
    const sample = getProfileSampleData('trucking')!
    expect(sample.resources.length).toBeGreaterThan(0)
    expect(sample.pools.length).toBeGreaterThan(0)
    // Mutating the returned arrays must not bleed into the next caller.
    ;(sample.resources as unknown as unknown[]).pop()
    expect(getProfileSampleData('trucking')!.resources.length).toBeGreaterThan(0)
  })

  it('deep-clones the payload so mutating a nested object stays local', () => {
    // Codex flagged that shallow [...arr] still aliased the static
    // preset entries — editing `.name` would leak across sessions.
    const first = getProfileSampleData('trucking')!
    const original = first.resources[0]!.name
    ;(first.resources[0] as { name: string }).name = 'mutated by caller'
    // Capability bag is nested two levels deep; mutating it must
    // also stay local to this caller's copy.
    const caps = (first.resources[0] as { capabilities?: Record<string, unknown> }).capabilities
    if (caps) caps['injected'] = true
    const second = getProfileSampleData('trucking')!
    expect(second.resources[0]!.name).toBe(original)
    expect((second.resources[0] as { capabilities?: Record<string, unknown> }).capabilities?.['injected']).toBeUndefined()
  })

  it('aviation + scheduling also ship sample data', () => {
    expect(getProfileSampleData('aviation')!.resources.length).toBeGreaterThan(0)
    expect(getProfileSampleData('scheduling')!.resources.length).toBeGreaterThan(0)
  })
})

describe('applyProfileSampleData (#451)', () => {
  it('seeds resources + pools when the working config is empty', () => {
    const out = applyProfileSampleData('trucking', {})
    expect(out.resources?.length).toBeGreaterThan(0)
    expect(out.pools?.length).toBeGreaterThan(0)
  })

  it('skips ids that already exist in the working config', () => {
    const sample = getProfileSampleData('trucking')!
    const firstId = sample.resources[0]!.id
    const base: CalendarConfig = {
      resources: [{ id: firstId, name: 'I was here first' }],
    }
    const out = applyProfileSampleData('trucking', base)
    // The original entry survives; only the non-conflicting samples are appended.
    expect(out.resources?.[0]).toEqual({ id: firstId, name: 'I was here first' })
    expect(out.resources?.length).toBe(sample.resources.length)
  })

  it('no-ops cleanly for the custom preset', () => {
    const base: CalendarConfig = { profile: 'custom' }
    const out = applyProfileSampleData('custom', base)
    expect(out).toEqual({ profile: 'custom' })
  })

  it('preserves user-set fields the sample doesn\'t touch', () => {
    const base: CalendarConfig = {
      profile: 'trucking',
      labels: { resource: 'My Truck' },
    }
    const out = applyProfileSampleData('trucking', base)
    expect(out.labels?.resource).toBe('My Truck')
    expect(out.profile).toBe('trucking')
  })
})

/* ── Multi-industry presets (sprint #424 wk5) ──────────────────────────── */

describe('air_medical preset', () => {
  it('seeds aircraft + flight crew resource types and EMS roles', () => {
    const out = applyProfilePreset('air_medical')
    expect(out.profile).toBe('air_medical')
    expect(out.labels?.resource).toBe('Aircraft')
    expect(out.labels?.event).toBe('Mission')
    expect(out.resourceTypes?.map(t => t.id)).toContain('paramedic')
    expect(out.resourceTypes?.map(t => t.id)).toContain('nurse')
    expect(out.roles?.map(r => r.id)).toEqual(expect.arrayContaining([
      'pilot-in-command', 'flight-paramedic', 'flight-nurse',
    ]))
  })

  it('ships a default mission requirement template on the preset', () => {
    // applyProfilePreset intentionally doesn't merge `requirements`
    // into the user's working config (the user owns templates) — but
    // the preset itself ships them so demos / config-driven hosts can
    // pull them via PROFILE_PRESETS directly.
    const template = PROFILE_PRESETS.air_medical.config.requirements?.find(r => r.eventType === 'mission')
    expect(template).toBeDefined()
    const slotRoles = template!.requires
      .map(s => 'role' in s ? s.role : null)
      .filter((r): r is string => r !== null)
    expect(slotRoles).toEqual(expect.arrayContaining([
      'pilot-in-command', 'flight-paramedic', 'flight-nurse',
    ]))
  })

  it('ships sample crew tagged with the matching role ids', () => {
    const sample = getProfileSampleData('air_medical')
    expect(sample).not.toBeNull()
    const roles = sample!.resources.flatMap(r => (r.meta?.['roles'] as string[] | undefined) ?? [])
    expect(roles).toEqual(expect.arrayContaining([
      'pilot-in-command', 'flight-paramedic', 'flight-nurse',
    ]))
  })
})

describe('equipment_rental preset', () => {
  it('seeds equipment + delivery resource types and yard roles', () => {
    const out = applyProfilePreset('equipment_rental')
    expect(out.profile).toBe('equipment_rental')
    expect(out.labels?.resource).toBe('Equipment')
    expect(out.labels?.event).toBe('Rental')
    expect(out.labels?.location).toBe('Yard')
    expect(out.resourceTypes?.map(t => t.id)).toEqual(expect.arrayContaining([
      'equipment', 'vehicle', 'person',
    ]))
    expect(out.roles?.map(r => r.id)).toEqual(expect.arrayContaining([
      'attendant', 'driver', 'dispatcher',
    ]))
  })

  it('treats the attendant requirement as soft so off-hours rentals still go out', () => {
    const template = PROFILE_PRESETS.equipment_rental.config.requirements?.find(r => r.eventType === 'rental')
    expect(template?.requires.every(s => s.severity === 'soft')).toBe(true)
  })
})

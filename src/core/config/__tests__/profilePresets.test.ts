/**
 * Profile preset tests (#386 wizard).
 */
import { describe, it, expect } from 'vitest'
import { PROFILE_PRESETS, applyProfilePreset, listProfilePresets } from '../profilePresets'
import type { CalendarConfig } from '../calendarConfig'

describe('PROFILE_PRESETS — shape', () => {
  it('ships exactly four presets with stable ids and labels', () => {
    expect(Object.keys(PROFILE_PRESETS).sort())
      .toEqual(['aviation', 'custom', 'scheduling', 'trucking'])
    for (const preset of Object.values(PROFILE_PRESETS)) {
      expect(preset.id).toBeTruthy()
      expect(preset.label).toBeTruthy()
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('listProfilePresets returns the same set in a stable order', () => {
    const ids = listProfilePresets().map(p => p.id)
    expect(ids).toEqual(['trucking', 'aviation', 'scheduling', 'custom'])
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

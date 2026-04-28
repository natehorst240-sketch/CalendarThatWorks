// @vitest-environment happy-dom
/**
 * ConfigWizard — guided CalendarConfig editor (#386 capstone).
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import React from 'react'

import ConfigWizard from '../ConfigWizard'
import type { CalendarConfig } from '../../../core/config/calendarConfig'
import { applyProfilePreset } from '../../../core/config/profilePresets'

describe('ConfigWizard — default config (#465)', () => {
  it('uses defaultCalendarConfig() when no initialConfig is passed (Finish enabled on clean state)', () => {
    // With `initialConfig ?? {}` the wizard started with a bare object;
    // sections like `roles` and `resources` were undefined until touched.
    // With `defaultCalendarConfig()` every section is present and empty,
    // so validateConfig sees no dangling references and Finish stays enabled.
    const onComplete = vi.fn()
    render(<ConfigWizard onComplete={onComplete} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    const finish = screen.getByRole('button', { name: 'Finish' })
    expect(finish).toBeEnabled()
    fireEvent.click(finish)
    // The completed config should have all sections present (not undefined).
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources).toBeDefined()
    expect(saved.roles).toBeDefined()
    expect(saved.pools).toBeDefined()
  })
})

describe('ConfigWizard — shell', () => {
  it('renders all five steps in the breadcrumbs', () => {
    render(<ConfigWizard onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /1.+Profile/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2.+Types & roles/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3.+Resources/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /4.+Pools/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /5.+Review/ })).toBeInTheDocument()
  })

  it('starts on the Profile step (Back disabled, Next active)', () => {
    render(<ConfigWizard onComplete={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('Cancel and the close button both fire onCancel', () => {
    const onCancel = vi.fn()
    render(<ConfigWizard onComplete={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close wizard' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('clicking a breadcrumb jumps directly to that step', () => {
    render(<ConfigWizard onComplete={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
  })
})

describe('ConfigWizard — Profile step', () => {
  it('seeds the config when a preset is picked', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard onComplete={onComplete} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Trucking/ }))
    // Jump to review and finish to see the resulting config.
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.profile).toBe('trucking')
    expect(saved.labels?.resource).toBe('Truck')
    expect(saved.roles?.map(r => r.id)).toEqual(['driver', 'dispatcher'])
  })
})

describe('ConfigWizard — Catalogs step', () => {
  it('lets users add and remove resourceTypes / roles', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard onComplete={onComplete} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /2.+Types & roles/ }))

    fireEvent.click(screen.getByRole('button', { name: '+ Add resource type' }))
    fireEvent.change(screen.getByLabelText('Resource types 1 id'),    { target: { value: 'vehicle' } })
    fireEvent.change(screen.getByLabelText('Resource types 1 label'), { target: { value: 'Truck' } })

    fireEvent.click(screen.getByRole('button', { name: '+ Add role' }))
    fireEvent.change(screen.getByLabelText('Roles 1 id'),    { target: { value: 'driver' } })
    fireEvent.change(screen.getByLabelText('Roles 1 label'), { target: { value: 'Driver' } })

    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resourceTypes).toEqual([{ id: 'vehicle', label: 'Truck' }])
    expect(saved.roles).toEqual([{ id: 'driver', label: 'Driver' }])
  })
})

describe('ConfigWizard — Resources step', () => {
  it('captures id / name / type / location for each resource', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{ resourceTypes: [{ id: 'vehicle', label: 'Truck' }] }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add resource' }))

    fireEvent.change(screen.getByLabelText('Resource 1 id'),   { target: { value: 't1' } })
    fireEvent.change(screen.getByLabelText('Resource 1 name'), { target: { value: 'Truck 101' } })
    fireEvent.change(screen.getByLabelText('Resource 1 type'), { target: { value: 'vehicle' } })
    fireEvent.change(screen.getByLabelText('Resource 1 latitude'),  { target: { value: '40.76' } })
    fireEvent.change(screen.getByLabelText('Resource 1 longitude'), { target: { value: '-111.89' } })

    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources).toEqual([{
      id: 't1', name: 'Truck 101', type: 'vehicle',
      location: { lat: 40.76, lon: -111.89 },
    }])
  })

  it('does not commit a half-typed coordinate (#386 P2)', () => {
    // Typing only the latitude must not fabricate a longitude:0 in
    // the saved config — that would drop the resource off the
    // coast of Africa for distance-pool math.
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{ resources: [{ id: 't1', name: 'Truck' }] }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.change(screen.getByLabelText('Resource 1 latitude'), { target: { value: '40.76' } })
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources![0]!.location).toBeUndefined()
  })

  it('commits the coordinate only when both lat and lon are typed (#386 P2)', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{ resources: [{ id: 't1', name: 'Truck' }] }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.change(screen.getByLabelText('Resource 1 latitude'),  { target: { value: '40.76' } })
    fireEvent.change(screen.getByLabelText('Resource 1 longitude'), { target: { value: '-111.89' } })
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources![0]!.location).toEqual({ lat: 40.76, lon: -111.89 })
  })

  it('clears the coordinate when both fields are emptied', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{ resources: [{ id: 't1', name: 'Truck', location: { lat: 40, lon: -111 } }] }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.change(screen.getByLabelText('Resource 1 latitude'),  { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Resource 1 longitude'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources![0]!.location).toBeUndefined()
  })

  it('removes a resource when × is clicked', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{
        resources: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }],
      }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove resource 1' }))
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources?.map(r => r.id)).toEqual(['t2'])
  })
})

describe('ConfigWizard — Pools step', () => {
  it('lists existing pools as cards and lets users delete them', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{
        resources: [{ id: 't1', name: 'T1' }],
        pools: [
          { id: 'fleet-east', name: 'East Fleet', memberIds: ['t1'], strategy: 'first-available' },
          { id: 'fleet-west', name: 'West Fleet', memberIds: [],     strategy: 'first-available' },
        ],
      }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /4.+Pools/ }))
    expect(screen.getAllByRole('article').length).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete pool West Fleet' }))
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.pools?.map(p => p.id)).toEqual(['fleet-east'])
  })

  it('Escape inside the PoolBuilder modal does not cancel the wizard (#386 P1)', () => {
    // Both shells use a focus trap that listens for Escape. Without
    // gating, a single Escape inside PoolBuilder fires both
    // `onCancel` callbacks and drops the wizard's draft. The wizard
    // disables its outer trap while the inner modal is mounted.
    const onCancel = vi.fn()
    render(<ConfigWizard
      initialConfig={{ resources: [{ id: 't1', name: 'T1' }] }}
      onComplete={vi.fn()} onCancel={onCancel}
    />)
    fireEvent.click(screen.getByRole('button', { name: /4.+Pools/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add pool' }))
    // PoolBuilder mounts a `dialog` named "Create pool".
    const builder = screen.getByRole('dialog', { name: 'Create pool' })
    fireEvent.keyDown(builder, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})

describe('ConfigWizard — Review step', () => {
  it('shows OK when there are no validation issues', () => {
    render(<ConfigWizard
      initialConfig={{ profile: 'custom' }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    expect(within(screen.getByTestId('wizard-validation')).getByText('OK')).toBeInTheDocument()
  })

  it('surfaces validateConfig issues with their paths', () => {
    render(<ConfigWizard
      initialConfig={{
        // requirement.role doesn't exist in roles[] — validateConfig will flag it.
        requirements: [{ eventType: 'load', requires: [{ role: 'ghost', count: 1 }] }],
      }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    const validation = screen.getByTestId('wizard-validation')
    expect(within(validation).getByText('1 issue')).toBeInTheDocument()
    expect(within(validation).getByText('requirements[0].requires[0].role')).toBeInTheDocument()
  })

  it('renders the serialized config as JSON', () => {
    render(<ConfigWizard
      initialConfig={{ profile: 'aviation' }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    expect(screen.getByTestId('wizard-json').textContent).toContain('"profile": "aviation"')
  })

  it('Finish button hands the final config to onComplete', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{ profile: 'scheduling' }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onComplete).toHaveBeenCalledWith({ profile: 'scheduling' })
  })
})

describe('ConfigWizard — Finish gating (#460)', () => {
  it('disables Finish when validation fails', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{
        // role-slot template references a role that's not in roles[].
        requirements: [{ eventType: 'load', requires: [{ role: 'ghost', count: 1 }] }],
      }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    const finish = screen.getByRole('button', { name: 'Finish' })
    expect(finish).toBeDisabled()
    fireEvent.click(finish)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows a hint linking the disabled Finish to the validation block', () => {
    render(<ConfigWizard
      initialConfig={{
        requirements: [{ eventType: 'load', requires: [{ role: 'ghost', count: 1 }] }],
      }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    expect(screen.getByText(/Fix these issues to enable Finish/)).toBeInTheDocument()
  })

  it('Finish stays enabled (and submits) when validation is clean', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{ profile: 'custom' }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    const finish = screen.getByRole('button', { name: 'Finish' })
    expect(finish).toBeEnabled()
    fireEvent.click(finish)
    expect(onComplete).toHaveBeenCalled()
  })
})

describe('ConfigWizard — coordinate drafts keyed by row id (#460)', () => {
  it('a partial-typed coord follows its row when a sibling above is deleted', () => {
    // Index-keyed drafts (the pre-fix behavior) lost the typed
    // value because deleting row 2 shifted row 3 to index 2 but
    // the draft stayed pinned at index 3.
    render(<ConfigWizard
      initialConfig={{
        resources: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
      }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    // Type into the third row's lat (lon stays empty — the pair
    // doesn't commit, so the draft only lives in the local map).
    fireEvent.change(screen.getByLabelText('Resource 3 latitude'), { target: { value: '99' } })
    // Delete the middle row.
    fireEvent.click(screen.getByRole('button', { name: 'Remove resource 2' }))
    // The c row is now Resource 2; its typed lat must still show.
    expect(screen.getByLabelText('Resource 2 latitude')).toHaveValue(99)
  })

  it('a deleted row\'s partial draft does not leak onto a freshly-added row', () => {
    render(<ConfigWizard
      initialConfig={{
        resources: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    // Half-type a coord on row 1, delete row 1, add a new row at
    // the end. The new row at the same index must start empty
    // rather than inheriting row 1's orphan draft.
    fireEvent.change(screen.getByLabelText('Resource 1 latitude'), { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove resource 1' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add resource' }))
    // After the delete + add, two rows survive: original b at #1
    // and a fresh blank at #2. The blank must show no typed lat.
    expect(screen.getByLabelText('Resource 2 latitude')).toHaveValue(null)
  })
})

describe('ConfigWizard — sample data button (#451)', () => {
  it('hides the button for the custom profile (no sample data)', () => {
    const { unmount } = render(<ConfigWizard
      initialConfig={{ profile: 'custom' }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    expect(screen.queryByRole('button', { name: /Load sample data/ })).toBeNull()
    unmount()
  })

  it('shows the button when the chosen profile ships sample data', () => {
    render(<ConfigWizard
      initialConfig={{ profile: 'trucking' }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    expect(screen.getByRole('button', { name: /Load sample data/ })).toBeInTheDocument()
  })

  it('clicking Load sample data populates resources + pools', () => {
    const onComplete = vi.fn()
    // Apply the preset first so the sample data's `type` and role
    // references resolve cleanly — Finish gating (#460) refuses
    // configs that fail validateConfig.
    render(<ConfigWizard
      initialConfig={applyProfilePreset('trucking', {})}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.click(screen.getByRole('button', { name: /Load sample data/ }))
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect((saved.resources?.length ?? 0)).toBeGreaterThan(0)
    expect((saved.pools?.length ?? 0)).toBeGreaterThan(0)
  })
})

describe('ConfigWizard — role chip picker (#451)', () => {
  it('renders one chip per configured role beneath each resource', () => {
    render(<ConfigWizard
      initialConfig={{
        roles: [{ id: 'driver', label: 'Driver' }, { id: 'dispatcher', label: 'Dispatcher' }],
        resources: [{ id: 't1', name: 'Truck' }],
      }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    const group = screen.getByRole('group', { name: 'Resource 1 roles' })
    expect(within(group).getByRole('button', { name: 'Driver' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Dispatcher' })).toBeInTheDocument()
  })

  it('toggling a chip writes to meta.roles and persists through Finish', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{
        roles: [{ id: 'driver', label: 'Driver' }],
        resources: [{ id: 't1', name: 'Truck' }],
      }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Driver' }))
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources?.[0]?.meta).toEqual({ roles: ['driver'] })
  })

  it('toggling off a previously-set role drops it (and clears meta when empty)', () => {
    const onComplete = vi.fn()
    render(<ConfigWizard
      initialConfig={{
        roles: [{ id: 'driver', label: 'Driver' }],
        resources: [{ id: 't1', name: 'Truck', meta: { roles: ['driver'] } }],
      }}
      onComplete={onComplete} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /3.+Resources/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Driver' }))
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    const saved = onComplete.mock.calls[0]![0] as CalendarConfig
    expect(saved.resources?.[0]?.meta).toBeUndefined()
  })
})

describe('ConfigWizard — JSON download (#451)', () => {
  it('renders a Download config.json button on the Review step', () => {
    render(<ConfigWizard
      initialConfig={{ profile: 'custom' }}
      onComplete={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    expect(screen.getByRole('button', { name: 'Download config.json' })).toBeInTheDocument()
  })

  it('clicking the button creates an object URL and triggers an anchor click', async () => {
    const createSpy = vi.fn(() => 'blob:mock')
    const revokeSpy = vi.fn()
    const originalURL = global.URL
    // happy-dom ships URL but not always createObjectURL — patch both.
    const PatchedURL: typeof URL = Object.assign(function () {}, originalURL, {
      createObjectURL: createSpy,
      revokeObjectURL: revokeSpy,
    }) as unknown as typeof URL
    Object.defineProperty(global, 'URL', { value: PatchedURL, writable: true, configurable: true })
    vi.useFakeTimers()
    try {
      render(<ConfigWizard
        initialConfig={{ profile: 'aviation' }}
        onComplete={vi.fn()} onCancel={vi.fn()}
      />)
      fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Download config.json' }))
      expect(createSpy).toHaveBeenCalled()
      // #460: revoke is now deferred via setTimeout(_, 0) so older
      // browsers can resolve the blob before the URL goes away.
      expect(revokeSpy).not.toHaveBeenCalled()
      vi.runAllTimers()
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock')
    } finally {
      vi.useRealTimers()
      Object.defineProperty(global, 'URL', { value: originalURL, writable: true, configurable: true })
    }
  })
})

describe('ConfigWizard — initialConfig editing', () => {
  it('round-trips a fully populated config without losing fields', () => {
    const initial: CalendarConfig = {
      profile: 'trucking',
      labels: { resource: 'Truck', event: 'Load', location: 'Depot' },
      resourceTypes: [{ id: 'vehicle', label: 'Truck' }],
      roles: [{ id: 'driver', label: 'Driver' }],
      resources: [{ id: 't1', name: 'Truck 1', type: 'vehicle' }],
      pools: [{ id: 'fleet', name: 'Fleet', memberIds: ['t1'], strategy: 'first-available' }],
      settings: { conflictMode: 'block', timezone: 'America/Denver' },
    }
    const onComplete = vi.fn()
    render(<ConfigWizard initialConfig={initial} onComplete={onComplete} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /5.+Review/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onComplete).toHaveBeenCalledWith(initial)
  })
})

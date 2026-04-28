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

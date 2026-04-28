// @vitest-environment happy-dom
/**
 * PoolBuilder — guided create/edit modal (#386 UI).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import React from 'react'

import PoolBuilder from '../PoolBuilder'
import type { ResourcePool } from '../../../core/pools/resourcePoolSchema'
import type { EngineResource } from '../../../core/engine/schema/resourceSchema'

const r = (id: string, meta: Record<string, unknown> = {}): EngineResource =>
  ({ id, name: id.toUpperCase(), meta } as EngineResource)

const fleet: readonly EngineResource[] = [
  r('t1', { capabilities: { refrigerated: true,  heavy_haul: false }, location: { lat: 40.7608, lon: -111.8910 } }),
  r('t2', { capabilities: { refrigerated: true,  heavy_haul: true  }, location: { lat: 39.7392, lon: -104.9903 } }),
  r('t3', { capabilities: { refrigerated: false, heavy_haul: true  }, location: { lat: 37.6189, lon: -122.3750 } }),
]

describe('PoolBuilder — open / close', () => {
  it('renders the dialog with a "Create pool" header when pool is null', () => {
    render(<PoolBuilder pool={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Create pool' })).toBeInTheDocument()
  })

  it('renders an "Edit pool: <name>" header when editing', () => {
    render(<PoolBuilder
      pool={{ id: 'p', name: 'Drivers', memberIds: ['t1'], strategy: 'first-available' }}
      onSave={vi.fn()} onCancel={vi.fn()}
    />)
    expect(screen.getByRole('dialog', { name: 'Edit pool: Drivers' })).toBeInTheDocument()
  })

  it('Cancel and the close button both fire onCancel', () => {
    const onCancel = vi.fn()
    render(<PoolBuilder pool={null} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close pool builder' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})

describe('PoolBuilder — manual pool', () => {
  it('saves a manual pool with selected members', () => {
    const onSave = vi.fn()
    render(<PoolBuilder pool={null} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'West Fleet' } })
    fireEvent.click(screen.getByLabelText('T1'))
    fireEvent.click(screen.getByLabelText('T2'))
    fireEvent.click(screen.getByRole('button', { name: 'Create pool' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.name).toBe('West Fleet')
    expect(saved.type).toBe('manual')
    expect([...saved.memberIds].sort()).toEqual(['t1', 't2'])
    expect(saved.strategy).toBe('first-available')
  })

  it('disables Save until name + at least one member are set', () => {
    render(<PoolBuilder pool={null} resources={fleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    const save = screen.getByRole('button', { name: 'Create pool' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'X' } })
    expect(save).toBeDisabled()

    fireEvent.click(screen.getByLabelText('T1'))
    expect(save).toBeEnabled()
  })
})

describe('PoolBuilder — query pool', () => {
  it('emits an `eq` clause per selected capability and an `and` wrapper when there are multiple', () => {
    const onSave = vi.fn()
    render(<PoolBuilder pool={null} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'Reefers' } })
    // Switch to query type.
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    // Capability chips: one chip per derived capability.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refrigerated' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Heavy Haul' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create pool' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.type).toBe('query')
    expect(saved.memberIds).toEqual([])
    expect(saved.query).toEqual({
      op: 'and',
      clauses: [
        { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        { op: 'eq', path: 'meta.capabilities.heavy_haul',   value: true },
      ],
    })
  })

  it('emits a single `within` clause (no AND wrapper) when only a radius is set', () => {
    const onSave = vi.fn()
    render(<PoolBuilder pool={null} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'Nearby' } })
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    fireEvent.change(screen.getByLabelText(/Radius in miles/), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create pool' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'within',
      path: 'meta.location',
      from: { kind: 'proposed' },
      miles: 50,
    })
  })

  it('blocks Save when "closest" is picked without a radius clause', () => {
    render(<PoolBuilder pool={null} resources={fleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'X' } })
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refrigerated' }))
    fireEvent.change(screen.getByLabelText('Selection strategy'), { target: { value: 'closest' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Closest to event')
    expect(screen.getByRole('button', { name: 'Create pool' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Radius in miles/), { target: { value: '50' } })
    expect(screen.getByRole('button', { name: 'Create pool' })).toBeEnabled()
  })

  it('renders a live "Matches N · M excluded" preview that tracks the query', () => {
    render(<PoolBuilder pool={null} resources={fleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'Reefers' } })
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refrigerated' }))
    const preview = screen.getByLabelText('Live match preview')
    // 2 of 3 trucks are refrigerated.
    expect(preview).toHaveTextContent('2 matches')
    expect(preview).toHaveTextContent('1 excluded')
  })
})

describe('PoolBuilder — editing existing pools', () => {
  it('seeds capability chips and radius from an existing query pool', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Existing', type: 'query', memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'eq',     path: 'meta.capabilities.refrigerated', value: true },
          { op: 'within', path: 'meta.location', from: { kind: 'proposed' }, miles: 75 },
        ],
      },
      strategy: 'closest',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Refrigerated' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText(/Radius in miles/)).toHaveValue(75)
  })

  it('preserves id and disabled flag when saving edits', () => {
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'preserved-id', name: 'Old',
      memberIds: ['t1'], strategy: 'first-available', disabled: true,
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.id).toBe('preserved-id')
    expect(saved.disabled).toBe(true)
    expect(saved.name).toBe('Renamed')
  })
})

describe('PoolBuilder — preserves advanced clauses through edits (#386 P1)', () => {
  // The form only models capability-eq(true) and a proposed-mode
  // miles `within`. Anything else (gte, or, not, non-capability eq,
  // a literal-point within) must round-trip unchanged so a user
  // editing the friendly fields doesn't silently drop the host's
  // advanced rules.

  it('preserves a gte clause AND-merged with the user\'s edits', () => {
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'Reefers', type: 'query', memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },
          { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000 },
        ],
      },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)

    // The form acknowledges the preserved gte but lets the user
    // edit the recognized refrigerated chip.
    expect(screen.getByTestId('pool-builder-preserved')).toHaveTextContent(/1 additional rule/)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'and',
      clauses: [
        { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },
        { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000 },
      ],
    })
  })

  it('preserves an `or` root by AND-wrapping the user\'s additions', () => {
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'EitherWay', type: 'query', memberIds: [],
      query: {
        op: 'or',
        clauses: [
          { op: 'eq', path: 'type', value: 'vehicle' },
          { op: 'eq', path: 'type', value: 'aircraft' },
        ],
      },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)

    // The whole `or` is preserved; capability chips start empty.
    expect(screen.getByTestId('pool-builder-preserved')).toHaveTextContent(/1 additional rule/)
    expect(screen.getByRole('checkbox', { name: 'Refrigerated' })).toHaveAttribute('aria-checked', 'false')

    // User adds a refrigerated chip.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refrigerated' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'and',
      clauses: [
        { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        // The original `or` is preserved verbatim alongside the new chip.
        {
          op: 'or',
          clauses: [
            { op: 'eq', path: 'type', value: 'vehicle' },
            { op: 'eq', path: 'type', value: 'aircraft' },
          ],
        },
      ],
    })
  })

  it('preserves a `not` clause and a literal-point `within` (which the form can\'t model)', () => {
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'Mixed', type: 'query', memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
          { op: 'not', clause: { op: 'eq', path: 'tenantId', value: 'banned' } },
          // Literal-point within is a different shape from the
          // form's proposed-mode within — must be preserved.
          { op: 'within', path: 'meta.location', from: { kind: 'point', lat: 40, lon: -111 }, miles: 100 },
        ],
      },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)
    expect(screen.getByTestId('pool-builder-preserved')).toHaveTextContent(/2 additional rules/)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    // Recognized clause + both preserved clauses survive, in order.
    expect(saved.query).toEqual({
      op: 'and',
      clauses: [
        { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },
        { op: 'not', clause: { op: 'eq', path: 'tenantId', value: 'banned' } },
        { op: 'within', path: 'meta.location', from: { kind: 'point', lat: 40, lon: -111 }, miles: 100 },
      ],
    })
  })

  it('omits the preserved-clause notice when nothing was preserved', () => {
    render(<PoolBuilder
      pool={{
        id: 'p', name: 'Simple', type: 'query', memberIds: [],
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'first-available',
      }}
      resources={fleet} onSave={vi.fn()} onCancel={vi.fn()}
    />)
    expect(screen.queryByTestId('pool-builder-preserved')).toBeNull()
  })

  it('lets the user save with only preserved rules (no UI clauses configured)', () => {
    // A pool whose query is entirely advanced — the user opens it,
    // doesn't change anything, and can still hit Save without being
    // forced to add a recognized clause.
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'AdvancedOnly', type: 'query', memberIds: [],
      query: { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000 },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000,
    })
  })
})

describe('PoolBuilder — capability discovery', () => {
  it('uses the host-provided catalog when one is passed', () => {
    render(<PoolBuilder
      pool={null}
      resources={fleet}
      capabilityCatalog={[{ id: 'cdl', label: 'Driver CDL' }]}
      onSave={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    expect(screen.getByRole('checkbox', { name: 'Driver CDL' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Refrigerated' })).toBeNull()
  })
})

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

describe('PoolBuilder — hybrid preview count (#460)', () => {
  it('counts excluded against the curated member list, not the entire registry', () => {
    // Hybrid pool curating t1 + t3 with a "refrigerated" query.
    // Only t1 passes the query (t3 is non-refrigerated).
    // Old (wrong) count: resources.length(3) - matched(1) = 2
    // New (correct) count: memberIds.length(2) - matched(1) = 1
    const pool: ResourcePool = {
      id: 'p', name: 'Curated reefers',
      type: 'hybrid', memberIds: ['t1', 't3'],
      query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    const preview = screen.getByLabelText('Live match preview')
    expect(preview).toHaveTextContent('1 match')
    expect(preview).toHaveTextContent('1 excluded')
    expect(preview).not.toHaveTextContent('2 excluded')
  })

  it('shows zero excluded when every curated member passes the query', () => {
    // Curated list is t1 + t2; both refrigerated; query passes both.
    // Old count: resources.length(3) - 2 = 1 ("excluded" was misleading)
    // New count: memberIds.length(2) - 2 = 0 (nothing curated got dropped)
    const pool: ResourcePool = {
      id: 'p', name: 'All-pass hybrid',
      type: 'hybrid', memberIds: ['t1', 't2'],
      query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    const preview = screen.getByLabelText('Live match preview')
    expect(preview).toHaveTextContent('2 matches')
    expect(preview).not.toHaveTextContent('excluded')
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

  it('preserves a non-recognized clause AND-merged with the user\'s edits', () => {
    // gte on a *capability* path is now recognized as a numeric
    // range. Use a comparator on a non-capability path to verify
    // the preserved-bucket round-trip.
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'Reefers', type: 'query', memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },
          { op: 'gte', path: 'meta.priority', value: 5 },
        ],
      },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)

    // Advanced section opens automatically when there's a preserved clause.
    expect(screen.getByTestId('pool-builder-advanced')).toHaveAttribute('open')
    expect(screen.getByTestId('pool-builder-advanced')).toHaveTextContent('(1)')
    expect(screen.getByTestId('advanced-rule-summary-0')).toHaveTextContent('priority ≥ 5')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'and',
      clauses: [
        { op: 'eq',  path: 'meta.capabilities.refrigerated', value: true },
        { op: 'gte', path: 'meta.priority', value: 5 },
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
    // Advanced section opens automatically when there's a preserved clause.
    expect(screen.getByTestId('pool-builder-advanced')).toHaveAttribute('open')
    expect(screen.getByTestId('pool-builder-advanced')).toHaveTextContent('(1)')
    expect(screen.getByRole('checkbox', { name: 'Refrigerated' })).toHaveAttribute('aria-checked', 'false')
    // The preserved `or` is shown as a single advanced row, summarized as "any of …".
    expect(screen.getByTestId('advanced-rule-summary-0')).toHaveTextContent('any of:')

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
    expect(screen.getByTestId('pool-builder-advanced')).toHaveTextContent('(2)')
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

  it('keeps the advanced section collapsed when nothing was preserved', () => {
    render(<PoolBuilder
      pool={{
        id: 'p', name: 'Simple', type: 'query', memberIds: [],
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'first-available',
      }}
      resources={fleet} onSave={vi.fn()} onCancel={vi.fn()}
    />)
    const advanced = screen.getByTestId('pool-builder-advanced')
    expect(advanced).not.toHaveAttribute('open')
    expect(advanced).not.toHaveTextContent('(1)')
  })

  it('lets users add a brand-new advanced rule via the embedded editor', () => {
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'NewRule', type: 'query', memberIds: [],
      // Start with a recognized rule so save is enabled by the simple form.
      query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={fleet} onSave={onSave} onCancel={vi.fn()} />)

    // Open advanced section, add a new rule, configure it as gte.
    fireEvent.click(screen.getByText(/^Advanced rules/))
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    fireEvent.change(screen.getByLabelText('Operation'),  { target: { value: 'gte' } })
    fireEvent.change(screen.getByLabelText('Field path'), { target: { value: 'meta.capabilities.capacity_lbs' } })
    fireEvent.change(screen.getByLabelText('Value'),      { target: { value: '80000' } })
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

describe('PoolBuilder — numeric range pickers (#386 polish)', () => {
  // Fleet with a numeric capability so the auto-derive picks it up.
  const numericFleet: readonly EngineResource[] = [
    r('t1', { capabilities: { refrigerated: true,  capacity_lbs: 80000 } }),
    r('t2', { capabilities: { refrigerated: false, capacity_lbs: 60000 } }),
  ]

  it('discovers numeric capabilities and emits gte / lte clauses on save', () => {
    const onSave = vi.fn()
    render(<PoolBuilder pool={null} resources={numericFleet} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'Heavy Reefers' } })
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    fireEvent.change(screen.getByLabelText('Capacity Lbs minimum'), { target: { value: '70000' } })
    fireEvent.change(screen.getByLabelText('Capacity Lbs maximum'), { target: { value: '90000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create pool' }))

    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'and',
      clauses: [
        { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 70000 },
        { op: 'lte', path: 'meta.capabilities.capacity_lbs', value: 90000 },
      ],
    })
  })

  it('emits a single clause when only one bound is set', () => {
    const onSave = vi.fn()
    render(<PoolBuilder pool={null} resources={numericFleet} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Pool name'), { target: { value: 'AtLeast' } })
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    fireEvent.change(screen.getByLabelText('Capacity Lbs minimum'), { target: { value: '80000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create pool' }))
    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000,
    })
  })

  it('seeds min and max from an existing pool query when editing', () => {
    const pool: ResourcePool = {
      id: 'p', name: 'Existing', type: 'query', memberIds: [],
      query: {
        op: 'and',
        clauses: [
          { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 70000 },
          { op: 'lte', path: 'meta.capabilities.capacity_lbs', value: 90000 },
        ],
      },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={numericFleet} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('Capacity Lbs minimum')).toHaveValue(70000)
    expect(screen.getByLabelText('Capacity Lbs maximum')).toHaveValue(90000)
    // The advanced section stays collapsed because both bounds are
    // recognized — they don't fall into the preserved bucket.
    expect(screen.getByTestId('pool-builder-advanced')).not.toHaveAttribute('open')
  })

  it('clearing both bounds drops the range entirely on save', () => {
    const onSave = vi.fn()
    const pool: ResourcePool = {
      id: 'p', name: 'OnlyRange', type: 'query', memberIds: [],
      query: { op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 70000 },
      strategy: 'first-available',
    }
    render(<PoolBuilder pool={pool} resources={numericFleet} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refrigerated' }))
    fireEvent.change(screen.getByLabelText('Capacity Lbs minimum'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const saved = onSave.mock.calls[0]![0] as ResourcePool
    expect(saved.query).toEqual({
      op: 'eq', path: 'meta.capabilities.refrigerated', value: true,
    })
  })

  it('honors a host-supplied numericCapabilityCatalog (no auto-derivation)', () => {
    render(<PoolBuilder
      pool={null}
      resources={numericFleet}
      numericCapabilityCatalog={[{ id: 'capacity_lbs', label: 'Total weight' }]}
      onSave={vi.fn()} onCancel={vi.fn()}
    />)
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    expect(screen.getByLabelText('Total weight minimum')).toBeInTheDocument()
  })

  it('skips the section when no numeric capabilities exist', () => {
    const booleanOnly = [r('t1', { capabilities: { refrigerated: true } })]
    render(<PoolBuilder pool={null} resources={booleanOnly} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Match resources by their attributes/))
    expect(screen.queryByText('Numeric ranges')).toBeNull()
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

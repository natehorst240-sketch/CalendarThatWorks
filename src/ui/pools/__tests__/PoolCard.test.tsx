// @vitest-environment happy-dom
/**
 * PoolCard — read-only summary card with optional live stats (#386 UI).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import React from 'react'

import PoolCard from '../PoolCard'
import type { ResourcePool } from '../../../core/pools/resourcePoolSchema'
import type { EngineResource } from '../../../core/engine/schema/resourceSchema'

const r = (id: string, meta: Record<string, unknown> = {}): EngineResource =>
  ({ id, name: id.toUpperCase(), meta } as EngineResource)

describe('PoolCard — header', () => {
  it('renders the pool name + type chip', () => {
    render(<PoolCard pool={{
      id: 'p', name: 'West Fleet',
      memberIds: ['a', 'b'], strategy: 'first-available',
    }} />)
    expect(screen.getByRole('article', { name: 'Pool: West Fleet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'West Fleet' })).toBeInTheDocument()
    expect(screen.getByText('Manual pool')).toBeInTheDocument()
  })

  it('marks disabled pools with a chip and a `data-disabled` attribute', () => {
    render(<PoolCard pool={{
      id: 'p', name: 'Retired', memberIds: [], strategy: 'first-available', disabled: true,
    }} />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    const card = screen.getByRole('article', { name: 'Pool: Retired' })
    expect(card).toHaveAttribute('data-disabled', 'true')
  })
})

describe('PoolCard — actions', () => {
  it('renders the Edit button only when onEdit is provided', () => {
    const { rerender } = render(<PoolCard pool={{
      id: 'p', name: 'X', memberIds: ['a'], strategy: 'first-available',
    }} />)
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()

    const onEdit = vi.fn()
    rerender(<PoolCard pool={{
      id: 'p', name: 'X', memberIds: ['a'], strategy: 'first-available',
    }} onEdit={onEdit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('toggle button announces the right action via aria-label', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<PoolCard pool={{
      id: 'p', name: 'X', memberIds: ['a'], strategy: 'first-available',
    }} onToggleDisabled={onToggle} />)
    expect(screen.getByRole('button', { name: 'Disable pool X' })).toBeInTheDocument()

    rerender(<PoolCard pool={{
      id: 'p', name: 'X', memberIds: ['a'], strategy: 'first-available', disabled: true,
    }} onToggleDisabled={onToggle} />)
    expect(screen.getByRole('button', { name: 'Enable pool X' })).toBeInTheDocument()
  })
})

describe('PoolCard — live stats', () => {
  const reefers = [
    r('t1', { capabilities: { refrigerated: true } }),
    r('t2', { capabilities: { refrigerated: true } }),
    r('t3', { capabilities: { refrigerated: false } }),
  ]

  it('omits stats when no resources are passed', () => {
    render(<PoolCard pool={{
      id: 'p', name: 'X', memberIds: ['t1'], strategy: 'first-available',
    }} />)
    expect(screen.queryByTestId('pool-card-stats')).toBeNull()
  })

  it('counts manual-pool members against the live registry', () => {
    render(<PoolCard
      pool={{ id: 'p', name: 'Curated', memberIds: ['t1', 'gone'], strategy: 'first-available' }}
      resources={reefers}
    />)
    const stats = screen.getByTestId('pool-card-stats')
    expect(stats).toHaveTextContent('1')
    expect(stats).toHaveTextContent('1 excluded')
  })

  it('runs the query for query pools and renders matched / excluded counts', () => {
    render(<PoolCard
      pool={{
        id: 'p', name: 'Reefers', type: 'query', memberIds: [],
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'first-available',
      }}
      resources={reefers}
    />)
    const stats = screen.getByTestId('pool-card-stats')
    expect(stats).toHaveAttribute('aria-label', '2 matched, 1 excluded')
  })

  it('intersects memberIds with query results for hybrid pools', () => {
    render(<PoolCard
      pool={{
        id: 'p', name: 'OurReefers', type: 'hybrid',
        memberIds: ['t2', 't3'],   // t3 doesn't match the query
        query: { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
        strategy: 'first-available',
      }}
      resources={reefers}
    />)
    const stats = screen.getByTestId('pool-card-stats')
    expect(stats).toHaveTextContent('1')
  })
})

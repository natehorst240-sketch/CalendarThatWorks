// @vitest-environment happy-dom
/**
 * ClauseEditor — recursive editor for any ResourceQuery node (#386 L3).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import React, { useState } from 'react'

import ClauseEditor from '../ClauseEditor'
import type { ResourceQuery } from '../../../core/pools/poolQuerySchema'

/**
 * Wrapper that turns the controlled component into something we can
 * inspect at the end of a test ("after these interactions, what does
 * the clause look like?").
 */
function Harness({ initial }: { initial: ResourceQuery }) {
  const [clause, setClause] = useState<ResourceQuery>(initial)
  return (
    <div>
      <ClauseEditor clause={clause} onChange={setClause} />
      <pre data-testid="clause-state">{JSON.stringify(clause)}</pre>
    </div>
  )
}

const stateOf = () => JSON.parse(screen.getByTestId('clause-state').textContent ?? '{}')

describe('ClauseEditor — op switching reshapes the clause', () => {
  it('preserves path when switching between leaf comparators', () => {
    render(<Harness initial={{ op: 'eq', path: 'capabilities.refrigerated', value: true }} />)
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'gte' } })
    expect(stateOf()).toEqual({ op: 'gte', path: 'capabilities.refrigerated', value: 0 })
  })

  it('seeds within with sensible defaults (proposed event, miles, 50)', () => {
    render(<Harness initial={{ op: 'eq', path: '', value: '' }} />)
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'within' } })
    expect(stateOf()).toEqual({
      op: 'within',
      path: 'meta.location',
      from: { kind: 'proposed' },
      miles: 50,
    })
  })
})

describe('ClauseEditor — leaf bodies', () => {
  it('eq with a boolean value renders the true/false picker', () => {
    render(<Harness initial={{ op: 'eq', path: 'capabilities.refrigerated', value: true }} />)
    expect(screen.getByLabelText('Value')).toHaveValue('true')
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'false' } })
    expect(stateOf().value).toBe(false)
  })

  it('eq with a numeric value uses the number input', () => {
    render(<Harness initial={{ op: 'eq', path: 'capacity', value: 80 }} />)
    expect(screen.getByLabelText('Value')).toHaveValue(80)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '100' } })
    expect(stateOf().value).toBe(100)
  })

  it('switching value type from string to number coerces to 0', () => {
    render(<Harness initial={{ op: 'eq', path: 'name', value: 'truck' }} />)
    fireEvent.change(screen.getByLabelText('Value type'), { target: { value: 'number' } })
    expect(stateOf().value).toBe(0)
  })

  it('numeric comparators (gte) render a single number input + path', () => {
    render(<Harness initial={{ op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 80000 }} />)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '100000' } })
    expect(stateOf()).toEqual({
      op: 'gte', path: 'meta.capabilities.capacity_lbs', value: 100000,
    })
  })

  it('in clause parses a comma list, coercing numbers and booleans', () => {
    render(<Harness initial={{ op: 'in', path: 'type', values: [] }} />)
    fireEvent.change(screen.getByLabelText('Values (comma-separated)'), {
      target: { value: 'vehicle, aircraft, 5, true' },
    })
    expect(stateOf().values).toEqual(['vehicle', 'aircraft', 5, true])
  })

  it('within with fixed point renders lat / lon inputs', () => {
    render(<Harness initial={{
      op: 'within', path: 'meta.location',
      from: { kind: 'point', lat: 40, lon: -111 }, miles: 50,
    }} />)
    fireEvent.change(screen.getByLabelText('Latitude'),  { target: { value: '40.76' } })
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-111.89' } })
    expect(stateOf().from).toEqual({ kind: 'point', lat: 40.76, lon: -111.89 })
  })

  it('within unit picker swaps miles/km exclusively', () => {
    render(<Harness initial={{
      op: 'within', path: 'meta.location', from: { kind: 'proposed' }, miles: 50,
    }} />)
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'km' } })
    const s = stateOf()
    expect(s.km).toBe(50)
    expect(s.miles).toBeUndefined()
  })

  it('within reference-point picker swaps proposed ↔ point', () => {
    render(<Harness initial={{
      op: 'within', path: 'meta.location', from: { kind: 'proposed' }, miles: 50,
    }} />)
    fireEvent.change(screen.getByLabelText('Reference point'), { target: { value: 'point' } })
    expect(stateOf().from).toEqual({ kind: 'point', lat: 0, lon: 0 })
  })
})

describe('ClauseEditor — composite (and / or)', () => {
  it('Add sub-rule appends a default eq clause', () => {
    render(<Harness initial={{ op: 'and', clauses: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add sub-rule' }))
    expect(stateOf().clauses).toEqual([{ op: 'eq', path: '', value: '' }])
  })

  it('Remove drops the chosen child by index', () => {
    render(<Harness initial={{
      op: 'and',
      clauses: [
        { op: 'eq', path: 'a', value: 1 },
        { op: 'eq', path: 'b', value: 2 },
      ],
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove sub-rule 1' }))
    expect(stateOf().clauses).toEqual([{ op: 'eq', path: 'b', value: 2 }])
  })

  it('mutates a child clause without losing siblings', () => {
    render(<Harness initial={{
      op: 'and',
      clauses: [
        { op: 'eq', path: 'a', value: 1 },
        { op: 'eq', path: 'b', value: 2 },
      ],
    }} />)
    // First child's path input.
    const pathInputs = screen.getAllByLabelText('Field path')
    fireEvent.change(pathInputs[0]!, { target: { value: 'changed' } })
    expect(stateOf().clauses[0]).toEqual({ op: 'eq', path: 'changed', value: 1 })
    expect(stateOf().clauses[1]).toEqual({ op: 'eq', path: 'b', value: 2 })
  })

  it('blocks adding sub-rules past the depth cap', () => {
    // Build a chain whose innermost composite is at depth 5 — its
    // Add button must be disabled because the next child would land
    // at depth 6, past the cap.
    const deep: ResourceQuery = {
      op: 'and', clauses: [{           // depth 0
        op: 'and', clauses: [{         // depth 1
          op: 'and', clauses: [{       // depth 2
            op: 'and', clauses: [{     // depth 3
              op: 'and', clauses: [{   // depth 4
                op: 'and', clauses: [], // depth 5 — at cap
              }],
            }],
          }],
        }],
      }],
    }
    render(<Harness initial={deep} />)
    const addButtons = screen.getAllByRole('button', { name: '+ Add sub-rule' })
    // Innermost button comes first in document order (depth-first
    // rendering with the parent's button after its children's). It
    // sits at the depth cap and must refuse a 7th level.
    expect(addButtons[0]).toBeDisabled()
    // Shallower ones stay enabled.
    expect(addButtons[addButtons.length - 1]).toBeEnabled()
  })
})

describe('ClauseEditor — composite reordering (#386 polish)', () => {
  it('Up / Down buttons swap the targeted child with its neighbor', () => {
    render(<Harness initial={{
      op: 'and',
      clauses: [
        { op: 'eq', path: 'a', value: 1 },
        { op: 'eq', path: 'b', value: 2 },
        { op: 'eq', path: 'c', value: 3 },
      ],
    }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move sub-rule 2 up' }))
    expect(stateOf().clauses.map((c: any) => c.path)).toEqual(['b', 'a', 'c'])
    fireEvent.click(screen.getByRole('button', { name: 'Move sub-rule 2 down' }))
    expect(stateOf().clauses.map((c: any) => c.path)).toEqual(['b', 'c', 'a'])
  })

  it('disables Up on the first child and Down on the last (no oscillation)', () => {
    render(<Harness initial={{
      op: 'and',
      clauses: [
        { op: 'eq', path: 'a', value: 1 },
        { op: 'eq', path: 'b', value: 2 },
      ],
    }} />)
    expect(screen.getByRole('button', { name: 'Move sub-rule 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move sub-rule 2 down' })).toBeDisabled()
  })
})

describe('ClauseEditor — path autocomplete (#386 polish)', () => {
  function HarnessWithSuggestions() {
    const [c, setC] = useState<ResourceQuery>({ op: 'eq', path: '', value: '' })
    return (
      <ClauseEditor
        clause={c}
        onChange={setC}
        pathSuggestions={['meta.capabilities.refrigerated', 'meta.capabilities.heavy_haul', 'meta.location']}
      />
    )
  }

  it('renders a datalist of suggestions and wires the path input to it', () => {
    const { container } = render(<HarnessWithSuggestions />)
    const list = container.querySelector('datalist')
    expect(list).not.toBeNull()
    expect(list!.querySelectorAll('option')).toHaveLength(3)
    const pathInput = screen.getByLabelText('Field path')
    expect(pathInput).toHaveAttribute('list', list!.id)
  })

  it('omits the datalist when no suggestions are provided', () => {
    const { container } = render(<Harness initial={{ op: 'eq', path: '', value: '' }} />)
    expect(container.querySelector('datalist')).toBeNull()
  })

  it('routes nested path inputs through the root datalist (#386 P2)', () => {
    // Path autocomplete previously broke for nested rules: each
    // ClauseEditor generated its own datalistId via useId() but
    // the <datalist> only rendered at depth 0, so nested path
    // inputs referenced a non-existent element. Verify every
    // path input across the tree resolves to the SAME datalist
    // id — which means the root one — and that exactly one
    // datalist is in the DOM.
    function NestedHarness() {
      const [c, setC] = useState<ResourceQuery>({
        op: 'and',
        clauses: [
          { op: 'eq', path: 'meta.capabilities.refrigerated', value: true },
          { op: 'not', clause: { op: 'eq', path: 'tenantId', value: 'banned' } },
        ],
      })
      return (
        <ClauseEditor
          clause={c}
          onChange={setC}
          pathSuggestions={['meta.capabilities.refrigerated', 'meta.location']}
        />
      )
    }
    const { container } = render(<NestedHarness />)
    const datalists = container.querySelectorAll('datalist')
    expect(datalists.length).toBe(1)
    const rootId = datalists[0]!.id
    const pathInputs = screen.getAllByLabelText('Field path')
    expect(pathInputs.length).toBe(2)        // composite + not-inner
    for (const input of pathInputs) {
      expect(input).toHaveAttribute('list', rootId)
    }
  })
})

describe('ClauseEditor — not', () => {
  it('renders the inner clause and propagates edits', () => {
    render(<Harness initial={{
      op: 'not',
      clause: { op: 'eq', path: 'tenantId', value: 'banned' },
    }} />)
    fireEvent.change(screen.getByLabelText('Field path'), { target: { value: 'tenant' } })
    expect(stateOf()).toEqual({
      op: 'not',
      clause: { op: 'eq', path: 'tenant', value: 'banned' },
    })
  })
})

describe('ClauseEditor — depth rails (#453)', () => {
  it('marks every composite child list with data-depth-rail="composite"', () => {
    const { container } = render(<Harness initial={{
      op: 'and',
      clauses: [
        { op: 'eq', path: 'a', value: 1 },
        { op: 'or', clauses: [
          { op: 'eq', path: 'b', value: 2 },
        ] },
      ],
    }} />)
    // Outer AND + inner OR each render their own rail.
    expect(container.querySelectorAll('[data-depth-rail="composite"]').length).toBe(2)
  })

  it('marks the NOT body with data-depth-rail="not"', () => {
    const { container } = render(<Harness initial={{
      op: 'not',
      clause: { op: 'eq', path: 'tenantId', value: 'banned' },
    }} />)
    expect(container.querySelector('[data-depth-rail="not"]')).not.toBeNull()
  })

  it('omits depth rails on plain leaf clauses', () => {
    const { container } = render(<Harness initial={{
      op: 'eq', path: 'a', value: 1,
    }} />)
    expect(container.querySelector('[data-depth-rail]')).toBeNull()
  })
})

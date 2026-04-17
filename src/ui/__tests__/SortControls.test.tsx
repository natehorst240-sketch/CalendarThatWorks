import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SortControls, { type SortField } from '../SortControls.tsx'
import type { SortConfig } from '../../types/grouping.ts'

const FIELDS: SortField[] = [
  { key: 'start', label: 'Start date' },
  { key: 'title', label: 'Title' },
  { key: 'priority', label: 'Priority' },
]

describe('SortControls', () => {
  it('renders empty-state hint when value is empty', () => {
    render(<SortControls value={[]} onChange={() => {}} fields={FIELDS} />)
    expect(screen.getByText('No sort applied.')).toBeInTheDocument()
  })

  it('renders a row per sort criterion', () => {
    const value: SortConfig[] = [
      { field: 'start', direction: 'asc' },
      { field: 'priority', direction: 'desc' },
    ]
    render(<SortControls value={value} onChange={() => {}} fields={FIELDS} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('adds a new row with the first field and asc direction', () => {
    const onChange = vi.fn()
    render(<SortControls value={[]} onChange={onChange} fields={FIELDS} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Add sort criterion' }),
    )
    expect(onChange).toHaveBeenCalledWith([{ field: 'start', direction: 'asc' }])
  })

  it('disables the Add button once maxSorts is reached', () => {
    const onChange = vi.fn()
    const value: SortConfig[] = [
      { field: 'start', direction: 'asc' },
      { field: 'title', direction: 'asc' },
      { field: 'priority', direction: 'asc' },
    ]
    render(
      <SortControls
        value={value}
        onChange={onChange}
        fields={FIELDS}
        maxSorts={3}
      />,
    )
    const addBtn = screen.getByRole('button', { name: 'Add sort criterion' })
    expect(addBtn).toBeDisabled()
    fireEvent.click(addBtn)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toggles direction asc ↔ desc', () => {
    const onChange = vi.fn()
    const value: SortConfig[] = [{ field: 'start', direction: 'asc' }]
    render(
      <SortControls value={value} onChange={onChange} fields={FIELDS} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Sort Start date asc/i }))
    expect(onChange).toHaveBeenCalledWith([
      { field: 'start', direction: 'desc' },
    ])
  })

  it('updates the field via the select', () => {
    const onChange = vi.fn()
    const value: SortConfig[] = [{ field: 'start', direction: 'asc' }]
    render(
      <SortControls value={value} onChange={onChange} fields={FIELDS} />,
    )
    fireEvent.change(screen.getByLabelText('Sort field 1'), {
      target: { value: 'priority' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { field: 'priority', direction: 'asc' },
    ])
  })

  it('removes a row when the remove button is clicked', () => {
    const onChange = vi.fn()
    const value: SortConfig[] = [
      { field: 'start', direction: 'asc' },
      { field: 'title', direction: 'desc' },
    ]
    render(
      <SortControls value={value} onChange={onChange} fields={FIELDS} />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove sort by Start date' }),
    )
    expect(onChange).toHaveBeenCalledWith([
      { field: 'title', direction: 'desc' },
    ])
  })

  it('Clear button empties the list', () => {
    const onChange = vi.fn()
    const value: SortConfig[] = [
      { field: 'start', direction: 'asc' },
      { field: 'title', direction: 'desc' },
    ]
    render(
      <SortControls value={value} onChange={onChange} fields={FIELDS} />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all sort criteria' }),
    )
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('hides the Clear button when value is empty', () => {
    render(<SortControls value={[]} onChange={() => {}} fields={FIELDS} />)
    expect(
      screen.queryByRole('button', { name: 'Clear all sort criteria' }),
    ).toBeNull()
  })

  it('labels the first row "by" and subsequent rows "then"', () => {
    const value: SortConfig[] = [
      { field: 'start', direction: 'asc' },
      { field: 'title', direction: 'asc' },
      { field: 'priority', direction: 'desc' },
    ]
    render(<SortControls value={value} onChange={() => {}} fields={FIELDS} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('by')
    expect(items[1]).toHaveTextContent('then')
    expect(items[2]).toHaveTextContent('then')
  })

  it('defaults maxSorts to 3', () => {
    const onChange = vi.fn()
    const threeRows: SortConfig[] = [
      { field: 'start', direction: 'asc' },
      { field: 'title', direction: 'asc' },
      { field: 'priority', direction: 'asc' },
    ]
    render(
      <SortControls value={threeRows} onChange={onChange} fields={FIELDS} />,
    )
    expect(
      screen.getByRole('button', { name: 'Add sort criterion' }),
    ).toBeDisabled()
  })

  it('falls back to an extra option when the field is not in the schema', () => {
    const value: SortConfig[] = [{ field: 'mystery', direction: 'asc' }]
    render(<SortControls value={value} onChange={() => {}} fields={FIELDS} />)
    const select = screen.getByLabelText('Sort field 1') as HTMLSelectElement
    expect(select.value).toBe('mystery')
    expect(Array.from(select.options).map(o => o.value)).toContain('mystery')
  })

  it('disables Add when fields array is empty', () => {
    render(<SortControls value={[]} onChange={() => {}} fields={[]} />)
    expect(
      screen.getByRole('button', { name: 'Add sort criterion' }),
    ).toBeDisabled()
  })

  it('uses a custom label when provided', () => {
    render(
      <SortControls
        value={[]}
        onChange={() => {}}
        fields={FIELDS}
        label="Order events by"
      />,
    )
    expect(screen.getByText('Order events by')).toBeInTheDocument()
  })

  it('direction toggle reflects data-direction attribute', () => {
    const value: SortConfig[] = [{ field: 'start', direction: 'desc' }]
    const { container } = render(
      <SortControls value={value} onChange={() => {}} fields={FIELDS} />,
    )
    const btn = container.querySelector('[data-direction]')
    expect(btn).toHaveAttribute('data-direction', 'desc')
  })
})

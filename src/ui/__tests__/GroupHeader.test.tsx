import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GroupHeader from '../GroupHeader.tsx'

describe('GroupHeader', () => {
  it('renders label and count', () => {
    render(
      <GroupHeader
        label="ICU"
        count={7}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByText('ICU')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('invokes onToggle on click', () => {
    const onToggle = vi.fn()
    render(
      <GroupHeader
        label="ICU"
        count={3}
        depth={0}
        collapsed={false}
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByRole('treeitem'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('invokes onToggle on Enter and Space', () => {
    const onToggle = vi.fn()
    render(
      <GroupHeader
        label="ICU"
        count={3}
        depth={0}
        collapsed={false}
        onToggle={onToggle}
      />,
    )
    const header = screen.getByRole('treeitem')
    fireEvent.keyDown(header, { key: 'Enter' })
    fireEvent.keyDown(header, { key: ' ' })
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('does not toggle on unrelated keys', () => {
    const onToggle = vi.fn()
    render(
      <GroupHeader
        label="ICU"
        count={3}
        depth={0}
        collapsed={false}
        onToggle={onToggle}
      />,
    )
    fireEvent.keyDown(screen.getByRole('treeitem'), { key: 'Tab' })
    fireEvent.keyDown(screen.getByRole('treeitem'), { key: 'a' })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('reflects collapsed state in aria-expanded', () => {
    const { rerender } = render(
      <GroupHeader
        label="ICU"
        count={3}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    rerender(
      <GroupHeader
        label="ICU"
        count={3}
        depth={0}
        collapsed={true}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('sets aria-level from depth (1-based)', () => {
    const { rerender } = render(
      <GroupHeader
        label="L0"
        count={1}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-level', '1')

    rerender(
      <GroupHeader
        label="L2"
        count={1}
        depth={2}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-level', '3')
  })

  it('indents by depth', () => {
    const { rerender } = render(
      <GroupHeader
        label="x"
        count={1}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    const header = screen.getByRole('treeitem')
    expect(header.style.paddingLeft).toBe('0px')

    rerender(
      <GroupHeader
        label="x"
        count={1}
        depth={2}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    expect(header.style.paddingLeft).toBe('32px')
  })

  it('sets aria-setsize and aria-posinset when provided', () => {
    render(
      <GroupHeader
        label="ICU"
        count={3}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
        posInSet={2}
        setSize={5}
      />,
    )
    const header = screen.getByRole('treeitem')
    expect(header).toHaveAttribute('aria-posinset', '2')
    expect(header).toHaveAttribute('aria-setsize', '5')
  })

  it('builds a screen-reader label from fieldLabel + count', () => {
    render(
      <GroupHeader
        label="ICU"
        count={1}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
        fieldLabel="Department"
      />,
    )
    expect(
      screen.getByRole('treeitem', {
        name: 'Department: ICU, 1 event',
      }),
    ).toBeInTheDocument()
  })

  it('pluralises event count in the accessible label', () => {
    render(
      <GroupHeader
        label="ER"
        count={4}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
        fieldLabel="Department"
      />,
    )
    expect(
      screen.getByRole('treeitem', { name: 'Department: ER, 4 events' }),
    ).toBeInTheDocument()
  })

  it('prevents default on Space to avoid page scroll', () => {
    render(
      <GroupHeader
        label="ICU"
        count={1}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    const header = screen.getByRole('treeitem')
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })
    const prevented = !header.dispatchEvent(event)
    expect(prevented).toBe(true)
  })

  it('exposes data-collapsed attribute only when collapsed', () => {
    const { rerender } = render(
      <GroupHeader
        label="ICU"
        count={1}
        depth={0}
        collapsed={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('treeitem')).not.toHaveAttribute('data-collapsed')

    rerender(
      <GroupHeader
        label="ICU"
        count={1}
        depth={0}
        collapsed={true}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute(
      'data-collapsed',
      'true',
    )
  })
})

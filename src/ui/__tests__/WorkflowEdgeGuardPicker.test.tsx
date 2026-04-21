// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'

import {
  WorkflowEdgeGuardPicker,
  guardsForSource,
} from '../WorkflowEdgeGuardPicker'

describe('guardsForSource', () => {
  it('condition → true / false / default', () => {
    expect(guardsForSource('condition')).toEqual(['true', 'false', 'default'])
  })
  it('approval → approved / denied / default', () => {
    expect(guardsForSource('approval')).toEqual(['approved', 'denied', 'default'])
  })
  it('notify → default only', () => {
    expect(guardsForSource('notify')).toEqual(['default'])
  })
  it('terminal → empty list', () => {
    expect(guardsForSource('terminal')).toEqual([])
  })
  it('approval with SLA → includes timeout', () => {
    expect(guardsForSource('approval', { hasSla: true })).toEqual([
      'approved', 'denied', 'timeout', 'default',
    ])
  })
  it('approval without SLA → no timeout', () => {
    expect(guardsForSource('approval', { hasSla: false })).toEqual([
      'approved', 'denied', 'default',
    ])
  })
  it('hasSla only affects approval sources', () => {
    expect(guardsForSource('condition', { hasSla: true })).toEqual(['true', 'false', 'default'])
    expect(guardsForSource('notify',    { hasSla: true })).toEqual(['default'])
  })
})

describe('WorkflowEdgeGuardPicker — timeout option', () => {
  it('shows timeout button when sourceHasSla is true', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="approval"
        sourceHasSla
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-guard="timeout"]')).toBeInTheDocument()
  })

  it('hides timeout button when sourceHasSla is false', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="approval"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-guard="timeout"]')).toBeNull()
  })
})

describe('WorkflowEdgeGuardPicker — rendering', () => {
  it('renders one button per valid guard for a condition source', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="condition"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-guard="true"]')).toBeInTheDocument()
    expect(document.querySelector('[data-guard="false"]')).toBeInTheDocument()
    expect(document.querySelector('[data-guard="default"]')).toBeInTheDocument()
    expect(document.querySelector('[data-guard="approved"]')).toBeNull()
  })

  it('renders approved/denied/default for an approval source', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="approval"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-guard="approved"]')).toBeInTheDocument()
    expect(document.querySelector('[data-guard="denied"]')).toBeInTheDocument()
    expect(document.querySelector('[data-guard="default"]')).toBeInTheDocument()
    expect(document.querySelector('[data-guard="true"]')).toBeNull()
  })

  it('renders only default for a notify source', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="notify"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const buttons = document.querySelectorAll('[data-guard]')
    expect(buttons.length).toBe(1)
    expect(buttons[0].getAttribute('data-guard')).toBe('default')
  })

  it('renders nothing for a terminal source (defensive)', () => {
    const { container } = render(
      <WorkflowEdgeGuardPicker
        sourceType="terminal"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('focuses the first guard button on mount', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="approval"
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const first = document.querySelector('[data-guard="approved"]')
    expect(document.activeElement).toBe(first)
  })
})

describe('WorkflowEdgeGuardPicker — interactions', () => {
  it('clicking an option calls onPick with the chosen guard', () => {
    const onPick = vi.fn()
    render(
      <WorkflowEdgeGuardPicker
        sourceType="condition"
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(document.querySelector('[data-guard="false"]')!)
    expect(onPick).toHaveBeenCalledWith('false')
  })

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn()
    render(
      <WorkflowEdgeGuardPicker
        sourceType="condition"
        onPick={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('click outside calls onCancel', () => {
    const onCancel = vi.fn()
    render(
      <>
        <button data-testid="outside">outside</button>
        <WorkflowEdgeGuardPicker
          sourceType="condition"
          onPick={vi.fn()}
          onCancel={onCancel}
        />
      </>,
    )
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('click inside the menu does NOT dismiss', () => {
    const onCancel = vi.fn()
    render(
      <WorkflowEdgeGuardPicker
        sourceType="approval"
        onPick={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.mouseDown(document.querySelector('[data-guard="approved"]')!)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('anchors to the provided rect via fixed positioning', () => {
    render(
      <WorkflowEdgeGuardPicker
        sourceType="condition"
        anchorRect={{ left: 120, top: 40, bottom: 60, right: 180 }}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const menu = screen.getByTestId('workflow-edge-guard-picker') as HTMLElement
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.top).toBe('64px')
    expect(menu.style.left).toBe('120px')
  })
})

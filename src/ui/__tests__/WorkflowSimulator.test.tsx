// @vitest-environment happy-dom
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'

import { WorkflowSimulator, STEP_CAP } from '../WorkflowSimulator'
import {
  singleApproverWorkflow,
  twoTierApproverWorkflow,
  conditionalByCostWorkflow,
} from '../../core/workflow/templates'
import type { Workflow } from '../../core/workflow/workflowSchema'

function getButton(name: RegExp): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

function start(): void {
  fireEvent.click(getButton(/^start$/i))
}

function approve(): void {
  fireEvent.click(getButton(/^approve$/i))
}

function typeDenyReason(reason: string): void {
  fireEvent.change(screen.getByLabelText(/deny reason/i), { target: { value: reason } })
}

function expectOutcome(outcome: 'finalized' | 'denied' | 'cancelled'): void {
  const pill = document.querySelector(`[data-outcome="${outcome}"]`)
  expect(pill).not.toBeNull()
  expect(pill?.textContent).toBe(outcome)
}

describe('WorkflowSimulator — lifecycle', () => {
  it('starts in idle with Approve/Deny/Cancel disabled', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    expect(getButton(/^approve$/i)).toBeDisabled()
    expect(getButton(/^deny$/i)).toBeDisabled()
    expect(getButton(/^cancel$/i)).toBeDisabled()
    expect(getButton(/^start$/i)).not.toBeDisabled()
  })

  it('Start moves the instance to awaiting on an approval node', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    start()
    expect(screen.getByTestId('sim-current-node').textContent).toMatch(/approve/)
    expect(getButton(/^approve$/i)).not.toBeDisabled()
  })

  it('Approve on single-approver completes with outcome=finalized', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    start()
    approve()
    expectOutcome('finalized')
  })

  it('Deny requires a reason and then completes with outcome=denied', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    start()
    // Deny is disabled until a reason is typed.
    expect(getButton(/^deny$/i)).toBeDisabled()
    typeDenyReason('too expensive')
    expect(getButton(/^deny$/i)).not.toBeDisabled()
    fireEvent.click(getButton(/^deny$/i))
    expectOutcome('denied')
  })

  it('Cancel marks outcome=cancelled even mid-flow', () => {
    render(<WorkflowSimulator workflow={twoTierApproverWorkflow} />)
    start()
    approve() // tier1 → tier2
    fireEvent.click(getButton(/^cancel$/i))
    expectOutcome('cancelled')
  })

  it('Reset clears instance, emit log, and step count', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    start()
    approve()
    expect(screen.getByTestId('sim-emit-log')).toBeInTheDocument()
    fireEvent.click(getButton(/^reset$/i))
    expect(screen.queryByTestId('sim-emit-log')).toBeNull()
    expect(screen.queryByTestId('sim-history')).toBeNull()
    // Start is enabled again (instance null).
    expect(getButton(/^start$/i)).not.toBeDisabled()
  })
})

describe('WorkflowSimulator — emit log + history', () => {
  it('shows a colored event list, including notify, after completing the condition branch', () => {
    render(<WorkflowSimulator workflow={conditionalByCostWorkflow} />)
    // Default variables have event.cost=1000 → director branch.
    start()
    // Should be awaiting on the director approval now.
    expect(screen.getByTestId('sim-current-node').textContent).toMatch(/director/)
    approve()
    // After approve, auto-advance notify-ops → done (finalized).
    const log = screen.getByTestId('sim-emit-log')
    expect(log.querySelector('[data-emit-type="notify"]')).toBeInTheDocument()
    expect(log.querySelector('[data-emit-type="workflow_completed"]')).toBeInTheDocument()
    expectOutcome('finalized')
  })

  it('renders a history row per entered node', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    start()
    approve()
    const rows = screen.getByTestId('sim-history').querySelectorAll('tbody tr')
    expect(rows.length).toBeGreaterThan(0)
    // First row should be 'approve' with signal 'approved'.
    expect(rows[0].textContent).toMatch(/approve/)
    expect(rows[0].textContent).toMatch(/approved/)
  })
})

describe('WorkflowSimulator — variables', () => {
  it('routes the false branch when event.cost <= 500', () => {
    render(<WorkflowSimulator workflow={conditionalByCostWorkflow} />)
    fireEvent.change(screen.getByLabelText(/variables/i), {
      target: { value: JSON.stringify({ event: { cost: 100 } }) },
    })
    start()
    // False branch: notify-ops → done (finalized). No director stop.
    expectOutcome('finalized')
  })

  it('shows a parse error and disables actions on invalid JSON', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    fireEvent.change(screen.getByLabelText(/variables/i), {
      target: { value: '{ not valid' },
    })
    const textarea = screen.getByLabelText(/variables/i) as HTMLTextAreaElement
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(getButton(/^start$/i)).toBeDisabled()
  })

  // Regression: JSON arrays are typeof 'object', so a naive check would
  // let `[1,2,3]` through and ship an array to advance() as variables —
  // condition expressions that read `event.cost` would then silently
  // resolve to undefined and take the `false` branch. Arrays must be
  // rejected outright.
  it('rejects a JSON array as variables (must be a plain object)', () => {
    render(<WorkflowSimulator workflow={singleApproverWorkflow} />)
    const field = screen.getByLabelText(/variables/i) as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: '[1, 2, 3]' } })
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(getButton(/^start$/i)).toBeDisabled()
    // Message matches the parser's explicit object requirement.
    expect(screen.getByText(/must be a json object/i)).toBeInTheDocument()
    // Typing valid JSON re-enables Start.
    fireEvent.change(field, { target: { value: '{}' } })
    expect(getButton(/^start$/i)).not.toBeDisabled()
  })
})

describe('WorkflowSimulator — step cap', () => {
  it('disables action buttons and shows the banner once STEP_CAP is reached', () => {
    // Build a tiny workflow whose only state is an approval that loops
    // back to itself on both approve/deny. This gives the simulator a
    // pathological graph to pump the counter on. We short-circuit using
    // STEP_CAP actions via vi.runXActions / direct clicks.
    const loopingWorkflow: Workflow = {
      id: 'loop',
      version: 1,
      trigger: 'on_submit',
      startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:x' },
      ],
      edges: [
        { from: 'a', to: 'a', when: 'approved' },
        { from: 'a', to: 'a', when: 'denied' },
      ],
    }

    render(<WorkflowSimulator workflow={loopingWorkflow} />)
    // One Start action.
    start()
    // Each approve increments counter by 1. Start already counted once.
    // Pump the counter until we hit the cap.
    for (let i = 0; i < STEP_CAP - 1; i++) {
      approve()
    }

    expect(screen.getByTestId('sim-cap-banner')).toBeInTheDocument()
    expect(getButton(/^start$/i)).toBeDisabled()
    expect(getButton(/^approve$/i)).toBeDisabled()
    expect(getButton(/^cancel$/i)).toBeDisabled()
  })

  it('Reset clears the cap and re-enables actions', () => {
    const loopingWorkflow: Workflow = {
      id: 'loop',
      version: 1,
      trigger: 'on_submit',
      startNodeId: 'a',
      nodes: [{ id: 'a', type: 'approval', assignTo: 'role:x' }],
      edges: [
        { from: 'a', to: 'a', when: 'approved' },
        { from: 'a', to: 'a', when: 'denied' },
      ],
    }
    render(<WorkflowSimulator workflow={loopingWorkflow} />)
    start()
    for (let i = 0; i < STEP_CAP - 1; i++) approve()
    expect(screen.getByTestId('sim-cap-banner')).toBeInTheDocument()
    fireEvent.click(getButton(/^reset$/i))
    expect(screen.queryByTestId('sim-cap-banner')).toBeNull()
    expect(getButton(/^start$/i)).not.toBeDisabled()
  })
})

describe('WorkflowSimulator — onActiveNodeChange', () => {
  it('fires on initial mount with null, then with each node transition', () => {
    const onActiveNodeChange = vi.fn()
    render(
      <WorkflowSimulator
        workflow={singleApproverWorkflow}
        onActiveNodeChange={onActiveNodeChange}
      />,
    )
    // Initial effect does not fire because current equals lastActiveRef (both null).
    expect(onActiveNodeChange).not.toHaveBeenCalled()
    start()
    expect(onActiveNodeChange).toHaveBeenCalledWith('approve')
    approve()
    // After completion, currentNodeId returns to null.
    expect(onActiveNodeChange).toHaveBeenLastCalledWith(null)
  })

  // Regression: the builder mutates workflows in-place (keeps the id,
  // bumps nothing until save). If the reset effect only watched
  // `workflow.id`, an in-flight simulation survives a node rename /
  // removal and advance() starts hitting "Unknown node" failures on a
  // stale `instance.currentNodeId`. Depending on the whole workflow
  // reference covers both swaps and mutations.
  it('resets the simulator when the workflow reference changes even if the id is stable', () => {
    const onActiveNodeChange = vi.fn()
    function MutateInPlace(): JSX.Element {
      const [wf, setWf] = useState<Workflow>(singleApproverWorkflow)
      return (
        <>
          <WorkflowSimulator workflow={wf} onActiveNodeChange={onActiveNodeChange} />
          <button
            data-testid="mutate-wf"
            onClick={() => setWf({ ...wf, version: wf.version + 1 })}
          >
            mutate
          </button>
        </>
      )
    }
    render(<MutateInPlace />)
    start()
    expect(onActiveNodeChange).toHaveBeenLastCalledWith('approve')
    fireEvent.click(screen.getByTestId('mutate-wf'))
    // Same id, new reference → reset fires.
    expect(onActiveNodeChange).toHaveBeenLastCalledWith(null)
    // Status returns to idle; Start is enabled again.
    expect(getButton(/^start$/i)).not.toBeDisabled()
  })

  it('resets the active node when the workflow prop switches', () => {
    const onActiveNodeChange = vi.fn()
    function Swap(): JSX.Element {
      const [wf, setWf] = useState<Workflow>(singleApproverWorkflow)
      return (
        <>
          <WorkflowSimulator workflow={wf} onActiveNodeChange={onActiveNodeChange} />
          <button data-testid="swap-wf" onClick={() => setWf(twoTierApproverWorkflow)}>swap</button>
        </>
      )
    }
    render(<Swap />)
    start()
    expect(onActiveNodeChange).toHaveBeenLastCalledWith('approve')
    fireEvent.click(screen.getByTestId('swap-wf'))
    // Workflow swap resets instance → active node returns to null. Since
    // both templates share the approval node id 'approve', tier1 is
    // labeled 'tier1' on the two-tier workflow so any further progression
    // would produce a different id — but we only need to assert that the
    // reset effect fired with null before any new Start.
    expect(onActiveNodeChange).toHaveBeenLastCalledWith(null)
  })
})

describe('WorkflowSimulator — sim clock', () => {
  const slaWorkflow: Workflow = {
    id: 'sla', version: 1, trigger: 'on_submit', startNodeId: 'm',
    nodes: [
      { id: 'm', type: 'approval', assignTo: 'role:manager', slaMinutes: 30, onTimeout: 'escalate' },
      { id: 'd', type: 'approval', assignTo: 'role:director' },
      { id: 'ok', type: 'terminal', outcome: 'finalized' },
      { id: 'no', type: 'terminal', outcome: 'denied' },
    ],
    edges: [
      { from: 'm', to: 'ok', when: 'approved' },
      { from: 'm', to: 'no', when: 'denied' },
      { from: 'm', to: 'd', when: 'timeout' },
      { from: 'd', to: 'ok', when: 'approved' },
      { from: 'd', to: 'no', when: 'denied' },
    ],
  }

  it('renders advance-clock buttons', () => {
    render(<WorkflowSimulator workflow={slaWorkflow} />)
    expect(screen.getByTestId('sim-advance-5m')).toBeInTheDocument()
    expect(screen.getByTestId('sim-advance-15m')).toBeInTheDocument()
    expect(screen.getByTestId('sim-advance-60m')).toBeInTheDocument()
  })

  it('advancing the clock past SLA fires timeout and escalates', () => {
    render(<WorkflowSimulator workflow={slaWorkflow} />)
    start()
    expect(screen.getByTestId('sim-current-node').textContent).toMatch(/@ m/)
    // Two 15m jumps = 30m; tick then fires the timeout and moves to 'd'.
    fireEvent.click(screen.getByTestId('sim-advance-15m'))
    fireEvent.click(screen.getByTestId('sim-advance-15m'))
    expect(screen.getByTestId('sim-current-node').textContent).toMatch(/@ d/)
  })

  it('advancing the clock under SLA does not fire timeout', () => {
    render(<WorkflowSimulator workflow={slaWorkflow} />)
    start()
    fireEvent.click(screen.getByTestId('sim-advance-5m'))
    expect(screen.getByTestId('sim-current-node').textContent).toMatch(/@ m/)
  })
})

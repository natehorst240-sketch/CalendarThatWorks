// @vitest-environment happy-dom
/**
 * useWorkflowTicker — hook specs (issue #222).
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { useWorkflowTicker } from '../useWorkflowTicker'
import { advance } from '../../core/workflow/advance'
import type { Workflow, WorkflowInstance } from '../../core/workflow/workflowSchema'

const wf: Workflow = {
  id: 'sla',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'a',
  nodes: [
    { id: 'a', type: 'approval', assignTo: 'role:m', slaMinutes: 10, onTimeout: 'escalate' },
    { id: 'b', type: 'approval', assignTo: 'role:d' },
    { id: 'ok', type: 'terminal', outcome: 'finalized' },
    { id: 'no', type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'a', to: 'ok', when: 'approved' },
    { from: 'a', to: 'no', when: 'denied' },
    { from: 'a', to: 'b', when: 'timeout' },
    { from: 'b', to: 'ok', when: 'approved' },
    { from: 'b', to: 'no', when: 'denied' },
  ],
}

function startAt(iso: string): WorkflowInstance {
  const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: iso })
  if (!r.ok) throw new Error('start')
  return r.instance
}

describe('useWorkflowTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-20T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires onTimeout immediately when SLA has already elapsed on mount', () => {
    const instance = startAt('2026-04-20T09:00:00.000Z') // 60m ago; SLA is 10m.
    vi.setSystemTime(new Date('2026-04-20T10:30:00.000Z'))
    const onTimeout = vi.fn()
    renderHook(() => useWorkflowTicker({ workflow: wf, instance, onTimeout }))
    expect(onTimeout).toHaveBeenCalledTimes(1)
    const [result] = onTimeout.mock.calls[0]
    expect(result.ok).toBe(true)
    expect(result.instance.currentNodeId).toBe('b')
  })

  it('does not fire when SLA has not elapsed', () => {
    const instance = startAt('2026-04-20T09:59:00.000Z') // 1m ago; SLA is 10m.
    const onTimeout = vi.fn()
    renderHook(() => useWorkflowTicker({ workflow: wf, instance, onTimeout }))
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('fires once an interval tick pushes the elapsed time past the SLA', () => {
    const instance = startAt('2026-04-20T09:55:00.000Z') // 5m ago
    const onTimeout = vi.fn()
    renderHook(() => useWorkflowTicker({ workflow: wf, instance, onTimeout, intervalMs: 1000 }))
    expect(onTimeout).not.toHaveBeenCalled()
    // Jump wall-clock past the SLA and let one interval elapse.
    act(() => {
      vi.setSystemTime(new Date('2026-04-20T10:06:00.000Z'))
      vi.advanceTimersByTime(1000)
    })
    expect(onTimeout).toHaveBeenCalled()
  })

  it('is idle when instance is null', () => {
    const onTimeout = vi.fn()
    renderHook(() => useWorkflowTicker({ workflow: wf, instance: null, onTimeout }))
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('does not run when enabled=false', () => {
    const instance = startAt('2026-04-20T09:00:00.000Z')
    vi.setSystemTime(new Date('2026-04-20T10:30:00.000Z'))
    const onTimeout = vi.fn()
    renderHook(() =>
      useWorkflowTicker({ workflow: wf, instance, onTimeout, enabled: false }),
    )
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('forwards variables to tick so condition auto-advance can resolve', () => {
    // Manager approval (5m SLA) → on timeout routes into a condition
    // node that requires `event.cost`. Without variables the auto-
    // advance fails; with them it resolves.
    const condWf: Workflow = {
      id: 'sla-cond', version: 1, trigger: 'on_submit', startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:m', slaMinutes: 5, onTimeout: 'escalate' },
        { id: 'cost', type: 'condition', expr: 'event.cost > 500' },
        { id: 'ok', type: 'terminal', outcome: 'finalized' },
        { id: 'no', type: 'terminal', outcome: 'denied' },
      ],
      edges: [
        { from: 'a', to: 'ok', when: 'approved' },
        { from: 'a', to: 'no', when: 'denied' },
        { from: 'a', to: 'cost', when: 'timeout' },
        { from: 'cost', to: 'no', when: 'true' },
        { from: 'cost', to: 'ok', when: 'false' },
      ],
    }
    const start = advance({ workflow: condWf, instance: null, action: { type: 'start' }, at: '2026-04-20T09:00:00.000Z' })
    if (!start.ok) throw new Error('start')
    vi.setSystemTime(new Date('2026-04-20T10:00:00.000Z'))
    const onTimeout = vi.fn()
    renderHook(() =>
      useWorkflowTicker({
        workflow: condWf,
        instance: start.instance,
        onTimeout,
        variables: { event: { cost: 1000 } },
      }),
    )
    expect(onTimeout).toHaveBeenCalledTimes(1)
    const [result] = onTimeout.mock.calls[0]
    expect(result.ok).toBe(true)
    expect(result.instance.outcome).toBe('denied')
  })

  it('dedupes: fires at most once per SLA boundary while instance is stable', () => {
    const instance = startAt('2026-04-20T09:00:00.000Z')
    vi.setSystemTime(new Date('2026-04-20T10:30:00.000Z'))
    const onTimeout = vi.fn()
    renderHook(() =>
      useWorkflowTicker({ workflow: wf, instance, onTimeout, intervalMs: 1000 }),
    )
    expect(onTimeout).toHaveBeenCalledTimes(1)
    // Host hasn't persisted yet — the instance prop is still the same.
    // Subsequent interval ticks must not re-fire the callback.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('re-arms after the instance prop changes to a new SLA boundary', () => {
    const first = startAt('2026-04-20T09:00:00.000Z')
    vi.setSystemTime(new Date('2026-04-20T10:30:00.000Z'))
    const onTimeout = vi.fn()
    const { rerender } = renderHook(
      ({ instance }: { instance: WorkflowInstance }) =>
        useWorkflowTicker({ workflow: wf, instance, onTimeout, intervalMs: 1000 }),
      { initialProps: { instance: first } },
    )
    expect(onTimeout).toHaveBeenCalledTimes(1)

    // Simulate host persisting: advance into the escalated node 'b'
    // (also has no SLA — tick should now do nothing regardless).
    const escalated = onTimeout.mock.calls[0][0].instance! as WorkflowInstance
    rerender({ instance: escalated })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})

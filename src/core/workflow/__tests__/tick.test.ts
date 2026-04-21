/**
 * SLA timer tick — unit specs (issue #222 Phase 3).
 *
 * `tick()` is a pure timer-driven counterpart to `advance()`. It is
 * called by the host scheduler; when the active approval step has
 * exceeded its `slaMinutes`, it fires a synthetic `{ type: 'timeout' }`
 * action and returns the resulting `AdvanceResult`. Otherwise it
 * returns `null`.
 */
import { describe, it, expect } from 'vitest'
import { advance, tick } from '../advance'
import type { Workflow, WorkflowInstance } from '../workflowSchema'

const T0 = '2026-04-20T10:00:00.000Z'

function minutesAfter(iso: string, mins: number): string {
  return new Date(Date.parse(iso) + mins * 60_000).toISOString()
}

function build(onTimeout: 'escalate' | 'auto-approve' | 'auto-deny' | undefined): Workflow {
  return {
    id: 'sla',
    version: 1,
    trigger: 'on_submit',
    startNodeId: 'a',
    nodes: [
      {
        id: 'a',
        type: 'approval',
        assignTo: 'role:manager',
        slaMinutes: 30,
        ...(onTimeout ? { onTimeout } : {}),
      },
      { id: 'escalated', type: 'approval', assignTo: 'role:director' },
      { id: 'done',      type: 'terminal', outcome: 'finalized' },
      { id: 'denied',    type: 'terminal', outcome: 'denied' },
    ],
    edges: [
      { from: 'a', to: 'done',      when: 'approved' },
      { from: 'a', to: 'denied',    when: 'denied' },
      { from: 'a', to: 'escalated', when: 'timeout' },
      { from: 'escalated', to: 'done',   when: 'approved' },
      { from: 'escalated', to: 'denied', when: 'denied' },
    ],
  }
}

function start(wf: Workflow): WorkflowInstance {
  const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: T0 })
  if (!r.ok) throw new Error('precondition: start failed')
  return r.instance
}

describe('tick — SLA elapsed detection', () => {
  it('returns null before SLA has elapsed', () => {
    const wf = build('escalate')
    const inst = start(wf)
    const r = tick(wf, inst, minutesAfter(T0, 29))
    expect(r).toBeNull()
  })

  it('returns an AdvanceResult once SLA has elapsed', () => {
    const wf = build('escalate')
    const inst = start(wf)
    const r = tick(wf, inst, minutesAfter(T0, 30))
    expect(r).not.toBeNull()
    if (!r || !r.ok) throw new Error('expected ok advance')
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBe('escalated')
  })
})

describe('tick — onTimeout behaviors', () => {
  it('escalate walks the timeout edge', () => {
    const wf = build('escalate')
    const inst = start(wf)
    const r = tick(wf, inst, minutesAfter(T0, 45))
    if (!r || !r.ok) throw new Error('expected ok advance')
    expect(r.instance.currentNodeId).toBe('escalated')
    const aExit = r.instance.history.find(h => h.nodeId === 'a')
    expect(aExit?.signal).toBe('timeout')
  })

  it('auto-approve walks the approved edge', () => {
    const wf = build('auto-approve')
    const inst = start(wf)
    const r = tick(wf, inst, minutesAfter(T0, 45))
    if (!r || !r.ok) throw new Error('expected ok advance')
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
    const aExit = r.instance.history.find(h => h.nodeId === 'a')
    expect(aExit?.signal).toBe('approved')
  })

  it('auto-deny walks the denied edge', () => {
    const wf = build('auto-deny')
    const inst = start(wf)
    const r = tick(wf, inst, minutesAfter(T0, 45))
    if (!r || !r.ok) throw new Error('expected ok advance')
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('denied')
    const aExit = r.instance.history.find(h => h.nodeId === 'a')
    expect(aExit?.signal).toBe('denied')
  })

  it('defaults to escalate when onTimeout is unset', () => {
    const wf = build(undefined)
    const inst = start(wf)
    const r = tick(wf, inst, minutesAfter(T0, 45))
    if (!r || !r.ok) throw new Error('expected ok advance')
    expect(r.instance.currentNodeId).toBe('escalated')
  })
})

describe('tick — inapplicable cases return null', () => {
  it('returns null when approval has no slaMinutes', () => {
    const wf: Workflow = {
      id: 'nosla', version: 1, trigger: 'on_submit', startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:x' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
        { id: 'denied', type: 'terminal', outcome: 'denied' },
      ],
      edges: [
        { from: 'a', to: 'done',   when: 'approved' },
        { from: 'a', to: 'denied', when: 'denied' },
      ],
    }
    const inst = start(wf)
    expect(tick(wf, inst, minutesAfter(T0, 999))).toBeNull()
  })

  it('returns null when instance is completed', () => {
    const wf = build('auto-approve')
    const inst = start(wf)
    const completed = tick(wf, inst, minutesAfter(T0, 45))
    if (!completed || !completed.ok) throw new Error('precondition')
    const again = tick(wf, completed.instance, minutesAfter(T0, 60))
    expect(again).toBeNull()
  })

  it('returns null when the workflow is not awaiting', () => {
    const wf = build('escalate')
    const inst: WorkflowInstance = {
      workflowId: wf.id,
      workflowVersion: wf.version,
      status: 'running',
      currentNodeId: null,
      history: [],
    }
    expect(tick(wf, inst, minutesAfter(T0, 60))).toBeNull()
  })

  it('returns null for non-finite timestamps', () => {
    const wf = build('escalate')
    const inst = start(wf)
    expect(tick(wf, inst, 'not-a-date')).toBeNull()
  })
})

describe('tick — purity', () => {
  it('does not mutate the input instance', () => {
    const wf = build('escalate')
    const inst = start(wf)
    const snapshot: WorkflowInstance = JSON.parse(JSON.stringify(inst))
    tick(wf, inst, minutesAfter(T0, 45))
    expect(inst).toEqual(snapshot)
  })
})

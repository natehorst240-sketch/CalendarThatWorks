/**
 * Workflow interpreter — unit specs (issue #219 Phase 1).
 */
import { describe, it, expect } from 'vitest'
import { advance } from '../advance'
import type { Workflow, WorkflowInstance } from '../workflowSchema'

const AT = '2026-04-20T10:00:00.000Z'

// ─── Fixtures ─────────────────────────────────────────────────────────────

const singleApprover: Workflow = {
  id: 'single',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'a',
  nodes: [
    { id: 'a', type: 'approval', assignTo: 'role:manager' },
    { id: 'done', type: 'terminal', outcome: 'finalized' },
    { id: 'denied', type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'a', to: 'done', when: 'approved' },
    { from: 'a', to: 'denied', when: 'denied' },
  ],
}

const conditional: Workflow = {
  id: 'cond',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'c',
  nodes: [
    { id: 'c', type: 'condition', expr: 'event.cost > 500' },
    { id: 'director', type: 'approval', assignTo: 'role:director' },
    { id: 'notify', type: 'notify', channel: 'slack', template: 'ok' },
    { id: 'done', type: 'terminal', outcome: 'finalized' },
    { id: 'denied', type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'c', to: 'director', when: 'true' },
    { from: 'c', to: 'notify', when: 'false' },
    { from: 'director', to: 'notify', when: 'approved' },
    { from: 'director', to: 'denied', when: 'denied' },
    { from: 'notify', to: 'done' },
  ],
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('advance — start action', () => {
  it('enters start node and pauses at approval', () => {
    const r = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBe('a')
    expect(r.emit.map(e => e.type)).toEqual(['node_entered'])
  })

  it('rejects start on already-running instance', () => {
    const started = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const r = advance({ workflow: singleApprover, instance: started.instance, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(false)
  })
})

describe('advance — approve / deny', () => {
  it('approve walks to terminal and completes', () => {
    const s1 = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: singleApprover,
      instance: s1.instance,
      action: { type: 'approve', actor: 'alice' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
    expect(r.instance.currentNodeId).toBeNull()
    const types = r.emit.map(e => e.type)
    expect(types).toContain('node_exited')
    expect(types).toContain('workflow_completed')
  })

  it('deny routes to denied terminal', () => {
    const s1 = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: singleApprover,
      instance: s1.instance,
      action: { type: 'deny', actor: 'bob', reason: 'budget' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('denied')
    const exited = r.instance.history.find(h => h.nodeId === 'a')
    expect(exited?.signal).toBe('denied')
    expect(exited?.reason).toBe('budget')
    expect(exited?.actor).toBe('bob')
  })

  it('rejects approve when not on an approval node', () => {
    const r = advance({
      workflow: singleApprover,
      instance: null,
      action: { type: 'approve' },
      at: AT,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects approve after completion', () => {
    const s1 = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const s2 = advance({ workflow: singleApprover, instance: s1.instance, action: { type: 'approve' }, at: AT })
    if (!s2.ok) throw new Error('precondition')
    const r = advance({ workflow: singleApprover, instance: s2.instance, action: { type: 'approve' }, at: AT })
    expect(r.ok).toBe(false)
  })
})

describe('advance — cancel', () => {
  it('cancels a running instance', () => {
    const s1 = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: singleApprover,
      instance: s1.instance,
      action: { type: 'cancel', actor: 'owner', reason: 'duplicate' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('cancelled')
    expect(r.instance.currentNodeId).toBeNull()
    expect(r.emit.map(e => e.type)).toContain('workflow_completed')
  })

  it('cancel on a null instance still completes as cancelled', () => {
    const r = advance({
      workflow: singleApprover,
      instance: null,
      action: { type: 'cancel' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('cancelled')
  })
})

describe('advance — condition auto-advance', () => {
  it('cheap request (expr false) falls through notify to terminal', () => {
    const r = advance({
      workflow: conditional,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: { event: { cost: 100 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
    const types = r.emit.map(e => e.type)
    expect(types).toContain('notify')
    const notifyEvent = r.emit.find(e => e.type === 'notify')
    expect(notifyEvent && 'channel' in notifyEvent && notifyEvent.channel).toBe('slack')
  })

  it('expensive request (expr true) pauses at director approval', () => {
    const r = advance({
      workflow: conditional,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: { event: { cost: 1500 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBe('director')
  })

  it('fails the workflow when condition expression throws', () => {
    const r = advance({
      workflow: conditional,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: {}, // event.cost missing
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.instance.status).toBe('failed')
    expect(r.emit.map(e => e.type)).toContain('workflow_failed')
  })
})

describe('advance — notify emission', () => {
  it('emits notify event with channel + template then continues', () => {
    const wf: Workflow = {
      id: 'notify-only',
      version: 1,
      trigger: 'on_submit',
      startNodeId: 'n',
      nodes: [
        { id: 'n', type: 'notify', channel: 'email', template: 'hi' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [{ from: 'n', to: 'done' }],
    }
    const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const notifyEvt = r.emit.find(e => e.type === 'notify')
    expect(notifyEvt).toMatchObject({ channel: 'email', template: 'hi' })
    expect(r.instance.status).toBe('completed')
  })
})

describe('advance — failure modes', () => {
  it('fails when no edge matches the emitted signal', () => {
    const wf: Workflow = {
      id: 'dead-end',
      version: 1,
      trigger: 'on_submit',
      startNodeId: 'a',
      nodes: [{ id: 'a', type: 'approval', assignTo: 'role:x' }],
      edges: [{ from: 'a', to: 'a', when: 'approved' }], // no 'denied' edge
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: wf, instance: s1.instance, action: { type: 'deny', reason: 'x' }, at: AT })
    expect(r.ok).toBe(true) // the engine returns ok; status reflects failure
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
    expect(r.emit.map(e => e.type)).toContain('workflow_failed')
  })

  it('cycle guard trips when condition nodes loop', () => {
    const wf: Workflow = {
      id: 'loop',
      version: 1,
      trigger: 'on_submit',
      startNodeId: 'c1',
      nodes: [
        { id: 'c1', type: 'condition', expr: 'true' },
        { id: 'c2', type: 'condition', expr: 'true' },
      ],
      edges: [
        { from: 'c1', to: 'c2', when: 'true' },
        { from: 'c2', to: 'c1', when: 'true' },
      ],
    }
    const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT, variables: {} })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
    const failed = r.emit.find(e => e.type === 'workflow_failed')
    expect(failed && 'reason' in failed && failed.reason).toMatch(/step limit/i)
  })
})

describe('advance — history bookkeeping', () => {
  it('records enteredAt and exitedAt for each visited node', () => {
    const s1 = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: singleApprover,
      instance: s1.instance,
      action: { type: 'approve', actor: 'alice' },
      at: '2026-04-20T10:05:00.000Z',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const approvalEntry = r.instance.history.find(h => h.nodeId === 'a')
    expect(approvalEntry?.enteredAt).toBe(AT)
    expect(approvalEntry?.exitedAt).toBe('2026-04-20T10:05:00.000Z')
    expect(approvalEntry?.actor).toBe('alice')
    expect(approvalEntry?.signal).toBe('approved')
  })

  it('carries forward workflowId + version from the starting workflow', () => {
    const r = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.workflowId).toBe('single')
    expect(r.instance.workflowVersion).toBe(1)
  })
})

describe('advance — timeout action', () => {
  const slaEscalate: Workflow = {
    id: 'sla-escalate',
    version: 1,
    trigger: 'on_submit',
    startNodeId: 'a',
    nodes: [
      { id: 'a', type: 'approval', assignTo: 'role:manager', slaMinutes: 15, onTimeout: 'escalate' },
      { id: 'escalated', type: 'approval', assignTo: 'role:director' },
      { id: 'done', type: 'terminal', outcome: 'finalized' },
      { id: 'denied', type: 'terminal', outcome: 'denied' },
    ],
    edges: [
      { from: 'a', to: 'done', when: 'approved' },
      { from: 'a', to: 'denied', when: 'denied' },
      { from: 'a', to: 'escalated', when: 'timeout' },
      { from: 'escalated', to: 'done', when: 'approved' },
      { from: 'escalated', to: 'denied', when: 'denied' },
    ],
  }

  it('escalate routes down the timeout edge', () => {
    const s1 = advance({ workflow: slaEscalate, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: slaEscalate,
      instance: s1.instance,
      action: { type: 'timeout' },
      at: '2026-04-20T10:30:00.000Z',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.currentNodeId).toBe('escalated')
    const aExit = r.instance.history.find(h => h.nodeId === 'a')
    expect(aExit?.signal).toBe('timeout')
    expect(aExit?.reason).toMatch(/SLA timeout/)
  })

  it('auto-approve reuses the approved edge', () => {
    const wf: Workflow = {
      ...slaEscalate,
      nodes: slaEscalate.nodes.map(n =>
        n.id === 'a' && n.type === 'approval'
          ? { ...n, onTimeout: 'auto-approve' as const }
          : n,
      ),
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: wf,
      instance: s1.instance,
      action: { type: 'timeout' },
      at: '2026-04-20T10:30:00.000Z',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
  })

  it('rejects timeout when not on an awaiting approval', () => {
    const r = advance({
      workflow: slaEscalate,
      instance: null,
      action: { type: 'timeout' },
      at: AT,
    })
    expect(r.ok).toBe(false)
  })
})

describe('advance — purity', () => {
  it('does not mutate the input instance', () => {
    const s1 = advance({ workflow: singleApprover, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const snapshot: WorkflowInstance = JSON.parse(JSON.stringify(s1.instance))
    advance({ workflow: singleApprover, instance: s1.instance, action: { type: 'approve' }, at: AT })
    expect(s1.instance).toEqual(snapshot)
  })
})

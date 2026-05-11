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

  it('interpolates {{ }} tokens against variables into a message field', () => {
    const wf: Workflow = {
      id: 'notify-interp', version: 1, trigger: 'on_submit', startNodeId: 'n',
      nodes: [
        { id: 'n', type: 'notify', channel: 'slack', template: 'Hi {{ actor.name }}, cost ${{ event.cost }}' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [{ from: 'n', to: 'done' }],
    }
    const r = advance({
      workflow: wf, instance: null, action: { type: 'start' }, at: AT,
      variables: { actor: { name: 'Alice' }, event: { cost: 750 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const notifyEvt = r.emit.find(e => e.type === 'notify')
    expect(notifyEvt).toMatchObject({
      channel: 'slack',
      template: 'Hi {{ actor.name }}, cost ${{ event.cost }}',
      message: 'Hi Alice, cost $750',
    })
  })

  it('omits message when the notify node has no template', () => {
    const wf: Workflow = {
      id: 'notify-bare', version: 1, trigger: 'on_submit', startNodeId: 'n',
      nodes: [
        { id: 'n', type: 'notify', channel: 'slack' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [{ from: 'n', to: 'done' }],
    }
    const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const notifyEvt = r.emit.find(e => e.type === 'notify')
    expect(notifyEvt).not.toHaveProperty('message')
    expect(notifyEvt).not.toHaveProperty('template')
  })

  it('fails the workflow when a template references an undefined variable', () => {
    const wf: Workflow = {
      id: 'notify-bad', version: 1, trigger: 'on_submit', startNodeId: 'n',
      nodes: [
        { id: 'n', type: 'notify', channel: 'slack', template: 'Hi {{ actor.name }}' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [{ from: 'n', to: 'done' }],
    }
    const r = advance({
      workflow: wf, instance: null, action: { type: 'start' }, at: AT,
      variables: {},
    }) as { ok: false; error: string; instance: WorkflowInstance; emit: readonly unknown[] }
    expect(r.ok).toBe(false)
    expect(r.instance.status).toBe('failed')
    expect(r.error).toMatch(/actor\.name/)
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

// ─── timeout auto-deny ────────────────────────────────────────────────────────

describe('advance — timeout auto-deny', () => {
  it('auto-deny reuses the denied edge', () => {
    const wf: Workflow = {
      id: 'sla-deny', version: 1, trigger: 'on_submit', startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:x', slaMinutes: 5, onTimeout: 'auto-deny' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
        { id: 'denied', type: 'terminal', outcome: 'denied' },
      ],
      edges: [
        { from: 'a', to: 'done', when: 'approved' },
        { from: 'a', to: 'denied', when: 'denied' },
      ],
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: wf, instance: s1.instance, action: { type: 'timeout' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('denied')
  })
})

// ─── join reached outside parallel scope ──────────────────────────────────────

describe('advance — join outside parallel scope', () => {
  it('fails when autoAdvance lands on a join node outside a parallel scope', () => {
    const wf: Workflow = {
      id: 'bad-join', version: 1, trigger: 'on_submit', startNodeId: 'j',
      nodes: [
        { id: 'j', type: 'join', pairedWith: 'par-that-does-not-exist' },
      ],
      edges: [],
    }
    const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
    const failed = r.emit.find(e => e.type === 'workflow_failed')
    expect(failed && 'reason' in failed && failed.reason).toMatch(/outside a parallel scope/i)
  })
})

// ─── Parallel workflow fixtures ───────────────────────────────────────────────

const parAll: Workflow = {
  id: 'par-all', version: 1, trigger: 'on_submit', startNodeId: 'par',
  nodes: [
    { id: 'par',  type: 'parallel', mode: 'requireAll', branches: ['b1', 'b2'] },
    { id: 'b1',   type: 'approval', assignTo: 'role:mgr1' },
    { id: 'b2',   type: 'approval', assignTo: 'role:mgr2' },
    { id: 'join', type: 'join', pairedWith: 'par' },
    { id: 'done', type: 'terminal', outcome: 'finalized' },
  ],
  edges: [
    { from: 'b1',   to: 'join', when: 'branch-completed' },
    { from: 'b2',   to: 'join', when: 'branch-completed' },
    { from: 'join', to: 'done' },
  ],
}

const parAny: Workflow = {
  ...parAll,
  id: 'par-any',
  nodes: parAll.nodes.map(n =>
    n.id === 'par' ? { ...n, mode: 'requireAny' as const } : n,
  ),
}

const parN: Workflow = {
  ...parAll,
  id: 'par-n',
  nodes: parAll.nodes.map(n =>
    n.id === 'par' ? { ...n, mode: 'requireN' as const, n: 1 } : n,
  ),
}

// ─── Parallel requireAll ──────────────────────────────────────────────────────

describe('advance — parallel requireAll', () => {
  it('starts and parks both branches', () => {
    const r = advance({ workflow: parAll, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBeNull()
    const frames = r.instance.parallelFrames ?? []
    expect(frames).toHaveLength(1)
    expect(frames[0]?.branches.map(b => b.activeNodeId)).toEqual(['b1', 'b2'])
  })

  it('stays awaiting after one approval, completes after both', () => {
    const s1 = advance({ workflow: parAll, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')

    const s2 = advance({ workflow: parAll, instance: s1.instance, action: { type: 'approve', actor: 'alice', targetNodeId: 'b1' }, at: AT })
    expect(s2.ok).toBe(true)
    if (!s2.ok) return
    expect(s2.instance.status).toBe('awaiting') // b2 still pending

    const s3 = advance({ workflow: parAll, instance: s2.instance, action: { type: 'approve', actor: 'bob', targetNodeId: 'b2' }, at: AT })
    expect(s3.ok).toBe(true)
    if (!s3.ok) return
    expect(s3.instance.status).toBe('completed')
    expect(s3.instance.outcome).toBe('finalized')
    expect(s3.instance.parallelFrames ?? []).toHaveLength(0)
  })

  it('fails immediately when one branch denies (requireAll fail-fast)', () => {
    const s1 = advance({ workflow: parAll, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')

    const r = advance({ workflow: parAll, instance: s1.instance, action: { type: 'deny', reason: 'nope', targetNodeId: 'b1' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
    const failed = r.emit.find(e => e.type === 'workflow_failed')
    expect(failed && 'reason' in failed && failed.reason).toMatch(/quorum/i)
  })

  it('returns error when targetNodeId is not pending', () => {
    const s1 = advance({ workflow: parAll, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: parAll, instance: s1.instance, action: { type: 'approve', targetNodeId: 'nonexistent' }, at: AT })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toMatch(/no pending branch/)
  })

  it('returns error when two branches are pending and no targetNodeId supplied', () => {
    const s1 = advance({ workflow: parAll, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    // Both branches pending, no targetNodeId → ambiguous
    const r = advance({ workflow: parAll, instance: s1.instance, action: { type: 'approve' }, at: AT })
    expect(r.ok).toBe(false)
    expect('error' in r && r.error).toMatch(/branches awaiting/)
  })

  it('cancels a running parallel, closing open branch entries', () => {
    const s1 = advance({ workflow: parAll, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: parAll, instance: s1.instance, action: { type: 'cancel' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('cancelled')
    expect(r.instance.parallelFrames ?? []).toHaveLength(0)
  })

  it('fails when parallel has no paired join node', () => {
    const orphan: Workflow = {
      id: 'orphan', version: 1, trigger: 'on_submit', startNodeId: 'par',
      nodes: [
        { id: 'par', type: 'parallel', mode: 'requireAll', branches: ['b1'] },
        { id: 'b1',  type: 'approval', assignTo: 'role:x' },
      ],
      edges: [{ from: 'b1', to: 'par' }],
    }
    const r = advance({ workflow: orphan, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
    const failed = r.emit.find(e => e.type === 'workflow_failed')
    expect(failed && 'reason' in failed && failed.reason).toMatch(/no paired join/i)
  })
})

// ─── Parallel requireAny ──────────────────────────────────────────────────────

describe('advance — parallel requireAny', () => {
  it('completes when the first branch approves', () => {
    const s1 = advance({ workflow: parAny, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: parAny, instance: s1.instance, action: { type: 'approve', targetNodeId: 'b1' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
  })

  it('fails when all branches deny (requireAny exhausted)', () => {
    const wf: Workflow = {
      ...parAny,
      id: 'par-any-deny',
      nodes: parAny.nodes.map(n =>
        n.id === 'par' ? { ...n, branches: ['b1'] } : n,
      ),
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: wf, instance: s1.instance, action: { type: 'deny', reason: 'no', targetNodeId: 'b1' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
  })
})

// ─── Parallel requireN ────────────────────────────────────────────────────────

describe('advance — parallel requireN', () => {
  it('completes when N branches approve (n=1)', () => {
    const s1 = advance({ workflow: parN, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: parN, instance: s1.instance, action: { type: 'approve', targetNodeId: 'b1' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
  })

  it('fails early when positive + remaining < required', () => {
    // 2 branches, n=2, but 1 denies → can never reach 2 positives → fail
    const wf: Workflow = {
      ...parAll,
      id: 'par-n2',
      nodes: parAll.nodes.map(n =>
        n.id === 'par' ? { ...n, mode: 'requireN' as const, n: 2 } : n,
      ),
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({ workflow: wf, instance: s1.instance, action: { type: 'deny', reason: 'no', targetNodeId: 'b1' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
  })
})

// ─── Parallel branch timeout ──────────────────────────────────────────────────

describe('advance — parallel branch timeout', () => {
  it('escalates a branch approval via timeout edge', () => {
    const wf: Workflow = {
      id: 'par-timeout', version: 1, trigger: 'on_submit', startNodeId: 'par',
      nodes: [
        { id: 'par',  type: 'parallel', mode: 'requireAll', branches: ['b1', 'b2'] },
        { id: 'b1',   type: 'approval', assignTo: 'role:x', onTimeout: 'escalate' },
        { id: 'b1e',  type: 'approval', assignTo: 'role:director' },
        { id: 'b2',   type: 'approval', assignTo: 'role:y' },
        { id: 'join', type: 'join', pairedWith: 'par' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [
        { from: 'b1',   to: 'b1e',  when: 'timeout' },
        { from: 'b1',   to: 'join',  when: 'branch-completed' },
        { from: 'b1e',  to: 'join',  when: 'branch-completed' },
        { from: 'b2',   to: 'join',  when: 'branch-completed' },
        { from: 'join', to: 'done' },
      ],
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    // Timeout b1 → escalates to b1e
    const r = advance({ workflow: wf, instance: s1.instance, action: { type: 'timeout', targetNodeId: 'b1' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    const frames = r.instance.parallelFrames ?? []
    expect(frames[0]?.branches.map(b => b.activeNodeId)).toContain('b1e')
  })
})

// ─── tick() ───────────────────────────────────────────────────────────────────

import { tick } from '../advance'

describe('tick', () => {
  const slaWf: Workflow = {
    id: 'sla-tick', version: 1, trigger: 'on_submit', startNodeId: 'a',
    nodes: [
      { id: 'a', type: 'approval', assignTo: 'role:x', slaMinutes: 60, onTimeout: 'escalate' },
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

  function started(): WorkflowInstance {
    const r = advance({ workflow: slaWf, instance: null, action: { type: 'start' }, at: AT })
    if (!r.ok) throw new Error('precondition')
    return r.instance
  }

  it('returns null when instance is not awaiting', () => {
    const r = advance({ workflow: slaWf, instance: null, action: { type: 'start' }, at: AT })
    if (!r.ok) throw new Error()
    // complete it
    const done = advance({ workflow: slaWf, instance: r.instance, action: { type: 'approve' }, at: AT })
    if (!done.ok) throw new Error()
    expect(tick(slaWf, done.instance, AT)).toBeNull()
  })

  it('returns null when the awaited node has no slaMinutes', () => {
    const noSla: Workflow = {
      ...slaWf,
      nodes: slaWf.nodes.map(n =>
        n.id === 'a' ? { ...n, slaMinutes: undefined } : n,
      ),
    }
    const inst = (() => {
      const r = advance({ workflow: noSla, instance: null, action: { type: 'start' }, at: AT })
      if (!r.ok) throw new Error()
      return r.instance
    })()
    expect(tick(noSla, inst, AT)).toBeNull()
  })

  it('returns null when SLA has not elapsed yet', () => {
    const inst = started()
    const nowIso = '2026-04-20T10:30:00.000Z' // 30 min after AT, sla=60
    expect(tick(slaWf, inst, nowIso)).toBeNull()
  })

  it('fires a timeout when SLA has elapsed', () => {
    const inst = started()
    const nowIso = '2026-04-20T12:00:00.000Z' // 120 min after AT, sla=60
    const result = tick(slaWf, inst, nowIso)
    expect(result).not.toBeNull()
    expect(result?.ok).toBe(true)
    if (!result || !result.ok) return
    expect(result.instance.currentNodeId).toBe('escalated')
  })

  it('returns null when enteredAt cannot be found in history', () => {
    const inst: WorkflowInstance = {
      workflowId: slaWf.id, workflowVersion: 1,
      status: 'awaiting', currentNodeId: 'a',
      history: [], // empty — no enteredAt
    }
    expect(tick(slaWf, inst, AT)).toBeNull()
  })

  it('returns null when nowIso is not a parseable date', () => {
    const inst = started()
    expect(tick(slaWf, inst, 'not-a-date')).toBeNull()
  })
})

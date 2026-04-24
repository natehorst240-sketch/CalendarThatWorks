/**
 * Parallel + join interpreter specs — issue #223 Phase 4.
 *
 * Covers the concurrent-awaiting contract: a `parallel` node fans out
 * into independent branches, each of which may pause at its own
 * approval; actor actions disambiguate via `targetNodeId`; the paired
 * `join` only releases once the quorum mode is satisfied — or fails
 * early when the remaining branches can no longer reach it.
 */
import { describe, it, expect } from 'vitest'
import { advance } from '../advance'
import type { Workflow, WorkflowInstance } from '../workflowSchema'

const AT = '2026-04-21T09:00:00.000Z'

function makeParallel(
  mode: 'requireAll' | 'requireAny' | 'requireN',
  n?: number,
): Workflow {
  return {
    id: 'par',
    version: 1,
    trigger: 'on_submit',
    startNodeId: 'fan',
    nodes: [
      {
        id: 'fan',
        type: 'parallel',
        branches: ['a', 'b', 'c'],
        mode,
        ...(n !== undefined ? { n } : {}),
      },
      { id: 'a', type: 'approval', assignTo: 'role:a' },
      { id: 'b', type: 'approval', assignTo: 'role:b' },
      { id: 'c', type: 'approval', assignTo: 'role:c' },
      { id: 'join', type: 'join', pairedWith: 'fan' },
      { id: 'done',   type: 'terminal', outcome: 'finalized' },
      { id: 'denied', type: 'terminal', outcome: 'denied' },
      { id: 'a-denied', type: 'terminal', outcome: 'denied' }, // never reached — denied routes via branch-completed
    ],
    edges: [
      { from: 'a', to: 'join', when: 'branch-completed' },
      { from: 'b', to: 'join', when: 'branch-completed' },
      { from: 'c', to: 'join', when: 'branch-completed' },
      { from: 'join', to: 'done' },
      // Dangling edges so `a-denied` is reachable from some path —
      // the interpreter tests below all route through branch-completed.
      { from: 'join', to: 'denied', when: 'denied' },
    ],
  }
}

describe('advance — parallel fan-out', () => {
  it('starts and pauses with every branch awaiting its approval', () => {
    const wf = makeParallel('requireAll')
    const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBeNull()
    expect(r.instance.parallelFrames).toHaveLength(1)
    const frame = r.instance.parallelFrames![0]
    expect(frame!.branches.map(b => b.activeNodeId)).toEqual(['a', 'b', 'c'])
    expect(frame!.branches.every(b => b.completedSignal === undefined)).toBe(true)
    // One node_entered per branch approval, plus one for the parallel itself.
    expect(r.emit.filter(e => e.type === 'node_entered').map(e => 'nodeId' in e && e.nodeId))
      .toEqual(['fan', 'a', 'b', 'c'])
  })

  it('rejects an approve without targetNodeId when multiple branches are pending', () => {
    const wf = makeParallel('requireAll')
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('precondition')
    const r = advance({
      workflow: wf,
      instance: s1.instance,
      action: { type: 'approve', actor: 'alice' },
      at: AT,
    }) as { ok: false; error: string; instance: WorkflowInstance; emit: readonly unknown[] }
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/branches awaiting/i)
  })
})

describe('advance — parallel requireAll', () => {
  it('waits for every branch, then releases the join to terminal', () => {
    const wf = makeParallel('requireAll')
    let inst = startParallel(wf)
    inst = expectStillAwaiting(approveBranch(wf, inst, 'a'))
    inst = expectStillAwaiting(approveBranch(wf, inst, 'b'))
    const final = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'approve', targetNodeId: 'c', actor: 'carol' },
      at: AT,
    })
    expect(final.ok).toBe(true)
    if (!final.ok) return
    expect(final.instance.status).toBe('completed')
    expect(final.instance.outcome).toBe('finalized')
    expect(final.instance.parallelFrames ?? []).toHaveLength(0)
  })

  it('fails the workflow when any branch is denied', () => {
    const wf = makeParallel('requireAll')
    let inst = startParallel(wf)
    inst = expectStillAwaiting(approveBranch(wf, inst, 'a'))
    const r = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'deny', targetNodeId: 'b', actor: 'bob', reason: 'nope' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
    expect(r.emit.find(e => e.type === 'workflow_failed')).toBeDefined()
  })
})

describe('advance — parallel requireAny', () => {
  it('short-circuits on the first approval', () => {
    const wf = makeParallel('requireAny')
    const inst = startParallel(wf)
    const r = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'approve', targetNodeId: 'b', actor: 'bob' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
  })

  it('fails only when every branch has been denied', () => {
    const wf = makeParallel('requireAny')
    let inst = startParallel(wf)
    inst = expectStillAwaiting(denyBranch(wf, inst, 'a'))
    inst = expectStillAwaiting(denyBranch(wf, inst, 'b'))
    const r = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'deny', targetNodeId: 'c', reason: 'final' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
  })
})

describe('advance — parallel requireN', () => {
  it('releases the join once N approvals land, regardless of order', () => {
    const wf = makeParallel('requireN', 2)
    let inst = startParallel(wf)
    inst = expectStillAwaiting(approveBranch(wf, inst, 'c'))
    const r = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'approve', targetNodeId: 'a', actor: 'alice' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('finalized')
  })

  it('fails early once the remaining branches cannot reach N', () => {
    const wf = makeParallel('requireN', 2)
    let inst = startParallel(wf)
    inst = expectStillAwaiting(denyBranch(wf, inst, 'a'))
    // After one denial, 2 branches remain but we still need 2 positives —
    // the next denial leaves only 1 branch which can't satisfy N=2.
    const r = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'deny', targetNodeId: 'b', reason: 'too' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('failed')
  })
})

describe('advance — parallel timeout + cancel', () => {
  it('auto-approve timeout counts a branch positive for quorum', () => {
    const wf: Workflow = {
      ...makeParallel('requireAll'),
      nodes: makeParallel('requireAll').nodes.map(n =>
        n.id === 'a' && n.type === 'approval'
          ? { ...n, slaMinutes: 60, onTimeout: 'auto-approve' as const }
          : n,
      ),
    }
    let inst = startParallel(wf)
    inst = expectStillAwaiting(advanceOk(wf, inst, { type: 'timeout', targetNodeId: 'a' }))
    inst = expectStillAwaiting(approveBranch(wf, inst, 'b'))
    const final = advanceOk(wf, inst, { type: 'approve', targetNodeId: 'c' })
    expect(final.status).toBe('completed')
    expect(final.outcome).toBe('finalized')
  })

  it('cancel closes all pending branches and completes as cancelled', () => {
    const wf = makeParallel('requireAll')
    const inst = startParallel(wf)
    const r = advance({
      workflow: wf,
      instance: inst,
      action: { type: 'cancel', actor: 'owner', reason: 'duplicate' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('completed')
    expect(r.instance.outcome).toBe('cancelled')
    expect(r.instance.parallelFrames ?? []).toHaveLength(0)
    // None of the approval history entries should be left open.
    expect(r.instance.history.every(h => h.exitedAt !== undefined)).toBe(true)
  })
})

describe('advance — parallel with notify inside a branch', () => {
  it('walks branch notify + condition nodes before pausing', () => {
    const wf: Workflow = {
      id: 'par-notify',
      version: 1,
      trigger: 'on_submit',
      startNodeId: 'fan',
      nodes: [
        { id: 'fan', type: 'parallel', branches: ['a-notify', 'b-approval'], mode: 'requireAll' },
        { id: 'a-notify', type: 'notify', channel: 'slack', template: 'branch a' },
        { id: 'b-approval', type: 'approval', assignTo: 'role:b' },
        { id: 'join', type: 'join', pairedWith: 'fan' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [
        { from: 'a-notify',   to: 'join', when: 'default' },
        { from: 'b-approval', to: 'join', when: 'branch-completed' },
        { from: 'join', to: 'done' },
      ],
    }
    const s1 = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
    expect(s1.ok).toBe(true)
    if (!s1.ok) return
    expect(s1.instance.status).toBe('awaiting')
    expect(s1.emit.some(e => e.type === 'notify')).toBe(true)
    // Branch a completed immediately (notify-only), branch b still pending.
    const frame = s1.instance.parallelFrames![0]
    expect(frame.branches[0].completedSignal!).toBe('default')
    expect(frame.branches[1].activeNodeId!).toBe('b-approval')

    const final = advanceOk(wf, s1.instance, { type: 'approve', targetNodeId: 'b-approval' })
    expect(final.status).toBe('completed')
  })
})

// ─── Helpers ──────────────────────────────────────────────────────────────

function startParallel(wf: Workflow): WorkflowInstance {
  const r = advance({ workflow: wf, instance: null, action: { type: 'start' }, at: AT })
  if (!r.ok) throw new Error('start failed')
  return r.instance
}

function approveBranch(
  wf: Workflow,
  inst: WorkflowInstance,
  targetNodeId: string,
): WorkflowInstance {
  return advanceOk(wf, inst, { type: 'approve', targetNodeId })
}

function denyBranch(
  wf: Workflow,
  inst: WorkflowInstance,
  targetNodeId: string,
): WorkflowInstance {
  return advanceOk(wf, inst, { type: 'deny', targetNodeId, reason: 'nope' })
}

function advanceOk(
  wf: Workflow,
  inst: WorkflowInstance,
  action: Parameters<typeof advance>[0]['action'],
): WorkflowInstance {
  const r = advance({ workflow: wf, instance: inst, action, at: AT })
  if (!r.ok) throw new Error(`advance failed: ${(r as { error: string }).error}`)
  return r.instance
}

function expectStillAwaiting(inst: WorkflowInstance): WorkflowInstance {
  expect(inst.status).toBe('awaiting')
  return inst
}

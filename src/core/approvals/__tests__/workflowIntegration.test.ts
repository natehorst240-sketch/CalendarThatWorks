/**
 * Workflow DSL integration — issue #219 Phase 1.
 *
 * Exercises the optional workflow advance inside `transitionApproval`.
 * The approval reducer stays backwards-compatible; wiring a workflow is
 * opt-in and drives the interpreter in lockstep.
 */
import { describe, it, expect } from 'vitest'
import { transitionApproval } from '../transitions'
import type { ApprovalStage } from '../../../types/assets'
import type { Workflow, WorkflowInstance } from '../../workflow/workflowSchema'

const AT = '2026-04-20T10:00:00.000Z'

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
    { id: 'notify', type: 'notify', channel: 'slack' },
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

describe('transitionApproval — no workflow supplied', () => {
  it('backwards-compatible: result has no workflow fields', () => {
    const r = transitionApproval(null, { action: 'submit', at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.workflowInstance).toBeUndefined()
    expect(r.emit).toBeUndefined()
  })
})

describe('transitionApproval — submit drives workflow start', () => {
  it('returns a fresh workflow instance awaiting the approval node', () => {
    const r = transitionApproval(null, {
      action: 'submit',
      actor: 'alice',
      at: AT,
      workflow: singleApprover,
      workflowInstance: null,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.stage.stage).toBe('requested')
    expect(r.workflowInstance?.status).toBe('awaiting')
    expect(r.workflowInstance?.currentNodeId).toBe('a')
    expect(r.emit?.some(e => e.type === 'node_entered')).toBe(true)
  })

  it('conditional workflow evaluates variables during start', () => {
    const r = transitionApproval(null, {
      action: 'submit',
      at: AT,
      workflow: conditional,
      workflowInstance: null,
      variables: { event: { cost: 100 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // cheap request short-circuits through notify → terminal
    expect(r.workflowInstance?.status).toBe('completed')
    expect(r.workflowInstance?.outcome).toBe('finalized')
  })

  it('propagates expression failures as WORKFLOW_FAILED', () => {
    const r = transitionApproval(null, {
      action: 'submit',
      at: AT,
      workflow: conditional,
      workflowInstance: null,
      variables: {}, // event.cost missing
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'WORKFLOW_FAILED' } })
  })
})

describe('transitionApproval — approve/deny drive the interpreter', () => {
  function freshStage(): ApprovalStage {
    return { stage: 'requested', updatedAt: AT, history: [] }
  }

  it('approve advances the workflow to a terminal when wired', () => {
    const start = transitionApproval(null, {
      action: 'submit', at: AT, workflow: singleApprover, workflowInstance: null,
    })
    if (!start.ok) throw new Error('precondition')
    const r = transitionApproval(freshStage(), {
      action: 'approve',
      actor: 'alice',
      at: AT,
      workflow: singleApprover,
      workflowInstance: start.workflowInstance,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.workflowInstance?.status).toBe('completed')
    expect(r.workflowInstance?.outcome).toBe('finalized')
  })

  it('deny drives the workflow to the denied terminal', () => {
    const start = transitionApproval(null, {
      action: 'submit', at: AT, workflow: singleApprover, workflowInstance: null,
    })
    if (!start.ok) throw new Error('precondition')
    const r = transitionApproval(freshStage(), {
      action: 'deny',
      reason: 'budget',
      at: AT,
      workflow: singleApprover,
      workflowInstance: start.workflowInstance,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.workflowInstance?.outcome).toBe('denied')
  })

  it('deny without a reason still fails via the existing guard', () => {
    const r = transitionApproval(freshStage(), {
      action: 'deny',
      at: AT,
      workflow: singleApprover,
      workflowInstance: null,
    })
    expect(r).toMatchObject({ ok: false, error: { code: 'DENY_REQUIRES_REASON' } })
  })
})

describe('transitionApproval — non-workflow actions pass through', () => {
  it('revoke with a workflow present skips the interpreter', () => {
    const completed: WorkflowInstance = {
      workflowId: 'single',
      workflowVersion: 1,
      status: 'completed',
      currentNodeId: null,
      history: [],
      outcome: 'finalized',
    }
    const finalized: ApprovalStage = { stage: 'finalized', updatedAt: AT, history: [] }
    const r = transitionApproval(finalized, {
      action: 'revoke',
      at: AT,
      workflow: singleApprover,
      workflowInstance: completed,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.stage.stage).toBe('requested')
    // interpreter was NOT run → no workflow fields on result
    expect(r.workflowInstance).toBeUndefined()
    expect(r.emit).toBeUndefined()
  })
})

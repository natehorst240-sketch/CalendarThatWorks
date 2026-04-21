/**
 * Shipped template walk-throughs — issue #219 Phase 1.
 *
 * Verifies each starter template executes end-to-end under both the
 * approve and deny paths so hosts can trust them as drop-in defaults.
 */
import { describe, it, expect } from 'vitest'
import { advance } from '../advance'
import {
  singleApproverWorkflow,
  twoTierApproverWorkflow,
  conditionalByCostWorkflow,
  slaEscalationWorkflow,
  WORKFLOW_TEMPLATES,
} from '../templates'

const AT = '2026-04-20T09:00:00.000Z'

describe('singleApproverWorkflow', () => {
  it('approve path reaches finalized', () => {
    const s = advance({ workflow: singleApproverWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s.ok) throw new Error('start failed')
    const r = advance({ workflow: singleApproverWorkflow, instance: s.instance, action: { type: 'approve', actor: 'alice' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('finalized')
  })

  it('deny path reaches denied', () => {
    const s = advance({ workflow: singleApproverWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s.ok) throw new Error('start failed')
    const r = advance({ workflow: singleApproverWorkflow, instance: s.instance, action: { type: 'deny', actor: 'alice', reason: 'no' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('denied')
  })
})

describe('twoTierApproverWorkflow', () => {
  it('tier1 approve then tier2 approve finalizes', () => {
    const s1 = advance({ workflow: twoTierApproverWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('start')
    expect(s1.instance.currentNodeId).toBe('tier1')

    const s2 = advance({ workflow: twoTierApproverWorkflow, instance: s1.instance, action: { type: 'approve', actor: 'mgr' }, at: AT })
    if (!s2.ok) throw new Error('tier1 approve')
    expect(s2.instance.currentNodeId).toBe('tier2')
    expect(s2.instance.status).toBe('awaiting')

    const s3 = advance({ workflow: twoTierApproverWorkflow, instance: s2.instance, action: { type: 'approve', actor: 'dir' }, at: AT })
    expect(s3.ok).toBe(true)
    if (!s3.ok) return
    expect(s3.instance.outcome).toBe('finalized')
  })

  it('tier1 deny short-circuits without consulting tier2', () => {
    const s1 = advance({ workflow: twoTierApproverWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('start')
    const r = advance({ workflow: twoTierApproverWorkflow, instance: s1.instance, action: { type: 'deny', reason: 'no' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('denied')
    const tier2Entry = r.instance.history.find(h => h.nodeId === 'tier2')
    expect(tier2Entry).toBeUndefined()
  })

  it('tier2 deny records denied outcome', () => {
    const s1 = advance({ workflow: twoTierApproverWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s1.ok) throw new Error('start')
    const s2 = advance({ workflow: twoTierApproverWorkflow, instance: s1.instance, action: { type: 'approve' }, at: AT })
    if (!s2.ok) throw new Error('tier1')
    const r = advance({ workflow: twoTierApproverWorkflow, instance: s2.instance, action: { type: 'deny', reason: 'budget' }, at: AT })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('denied')
  })
})

describe('conditionalByCostWorkflow', () => {
  it('cost <= 500 finalizes via notify without director', () => {
    const r = advance({
      workflow: conditionalByCostWorkflow,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: { event: { cost: 200 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('finalized')
    expect(r.emit.map(e => e.type)).toContain('notify')
    const directorEntry = r.instance.history.find(h => h.nodeId === 'director')
    expect(directorEntry).toBeUndefined()
  })

  it('cost > 500 waits on director approval', () => {
    const r = advance({
      workflow: conditionalByCostWorkflow,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: { event: { cost: 2000 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBe('director')
  })

  it('director approve then notify finalizes', () => {
    const s = advance({
      workflow: conditionalByCostWorkflow,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: { event: { cost: 2000 } },
    })
    if (!s.ok) throw new Error('start')
    const r = advance({
      workflow: conditionalByCostWorkflow,
      instance: s.instance,
      action: { type: 'approve', actor: 'dir' },
      at: AT,
      variables: { event: { cost: 2000 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('finalized')
    expect(r.emit.map(e => e.type)).toContain('notify')
  })

  it('director deny routes to denied terminal', () => {
    const s = advance({
      workflow: conditionalByCostWorkflow,
      instance: null,
      action: { type: 'start' },
      at: AT,
      variables: { event: { cost: 2000 } },
    })
    if (!s.ok) throw new Error('start')
    const r = advance({
      workflow: conditionalByCostWorkflow,
      instance: s.instance,
      action: { type: 'deny', actor: 'dir', reason: 'nope' },
      at: AT,
      variables: { event: { cost: 2000 } },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('denied')
  })
})

describe('slaEscalationWorkflow', () => {
  it('manager approve path finalizes without escalation', () => {
    const s = advance({ workflow: slaEscalationWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s.ok) throw new Error('start')
    const r = advance({
      workflow: slaEscalationWorkflow,
      instance: s.instance,
      action: { type: 'approve', actor: 'mgr' },
      at: AT,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.outcome).toBe('finalized')
  })

  it('timeout action routes to the director', () => {
    const s = advance({ workflow: slaEscalationWorkflow, instance: null, action: { type: 'start' }, at: AT })
    if (!s.ok) throw new Error('start')
    const r = advance({
      workflow: slaEscalationWorkflow,
      instance: s.instance,
      action: { type: 'timeout' },
      at: '2026-04-20T10:01:00.000Z',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.instance.status).toBe('awaiting')
    expect(r.instance.currentNodeId).toBe('director')
  })
})

describe('WORKFLOW_TEMPLATES registry', () => {
  it('includes all shipped templates in the expected order', () => {
    expect(WORKFLOW_TEMPLATES).toEqual([
      singleApproverWorkflow,
      twoTierApproverWorkflow,
      conditionalByCostWorkflow,
      slaEscalationWorkflow,
    ])
  })

  it('every template has unique node ids', () => {
    for (const wf of WORKFLOW_TEMPLATES) {
      const ids = wf.nodes.map(n => n.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('every template edge points at a defined node', () => {
    for (const wf of WORKFLOW_TEMPLATES) {
      const ids = new Set(wf.nodes.map(n => n.id))
      for (const e of wf.edges) {
        expect(ids.has(e.from)).toBe(true)
        expect(ids.has(e.to)).toBe(true)
      }
    }
  })

  it('every template start node exists', () => {
    for (const wf of WORKFLOW_TEMPLATES) {
      expect(wf.nodes.some(n => n.id === wf.startNodeId)).toBe(true)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { layoutWorkflow, snapToGrid, NODE_WIDTH, NODE_HEIGHT } from '../layout'
import {
  singleApproverWorkflow,
  twoTierApproverWorkflow,
  conditionalByCostWorkflow,
} from '../templates'
import type { Workflow, WorkflowLayout } from '../workflowSchema'

describe('layoutWorkflow — BFS-leveled', () => {
  it('places startNodeId at the top row', () => {
    const r = layoutWorkflow(singleApproverWorkflow)
    const start = r.positions[singleApproverWorkflow.startNodeId]
    for (const [id, p] of Object.entries(r.positions)) {
      if (id === singleApproverWorkflow.startNodeId) continue
      expect(p.y).toBeGreaterThanOrEqual(start.y)
    }
  })

  it('assigns every node a position', () => {
    const r = layoutWorkflow(twoTierApproverWorkflow)
    for (const n of twoTierApproverWorkflow.nodes) {
      expect(r.positions[n.id]).toBeDefined()
    }
  })

  it('produces non-empty edge paths for every edge', () => {
    const r = layoutWorkflow(conditionalByCostWorkflow)
    expect(r.edgePaths.length).toBe(conditionalByCostWorkflow.edges.length)
    for (const e of r.edgePaths) {
      expect(e.d.length).toBeGreaterThan(0)
    }
  })

  it('size + origin cover all nodes (forms a valid SVG viewBox)', () => {
    const r = layoutWorkflow(twoTierApproverWorkflow)
    for (const p of Object.values(r.positions)) {
      expect(p.x).toBeGreaterThanOrEqual(r.origin.x)
      expect(p.y).toBeGreaterThanOrEqual(r.origin.y)
      expect(p.x + NODE_WIDTH).toBeLessThanOrEqual(r.origin.x + r.size.w)
      expect(p.y + NODE_HEIGHT).toBeLessThanOrEqual(r.origin.y + r.size.h)
    }
  })
})

describe('layoutWorkflow — overrides', () => {
  it('override positions win over BFS defaults', () => {
    const overrides: WorkflowLayout = {
      workflowId: singleApproverWorkflow.id,
      workflowVersion: singleApproverWorkflow.version,
      positions: { approve: { x: 1000, y: 2000 } },
    }
    const r = layoutWorkflow(singleApproverWorkflow, overrides)
    expect(r.positions.approve).toEqual({ x: 1000, y: 2000 })
    // Other nodes fall back to BFS positions.
    expect(r.positions.done).toBeDefined()
    expect(r.positions.done.y).not.toBe(2000)
  })

  it('ignores overrides whose workflowId does not match', () => {
    const overrides: WorkflowLayout = {
      workflowId: 'some-other-workflow',
      workflowVersion: singleApproverWorkflow.version,
      positions: { approve: { x: 1000, y: 2000 } },
    }
    const r = layoutWorkflow(singleApproverWorkflow, overrides)
    expect(r.positions.approve).not.toEqual({ x: 1000, y: 2000 })
  })

  it('ignores overrides whose workflowVersion does not match', () => {
    const overrides: WorkflowLayout = {
      workflowId: singleApproverWorkflow.id,
      workflowVersion: singleApproverWorkflow.version + 1,
      positions: { approve: { x: 1000, y: 2000 } },
    }
    const r = layoutWorkflow(singleApproverWorkflow, overrides)
    expect(r.positions.approve).not.toEqual({ x: 1000, y: 2000 })
  })
})

describe('layoutWorkflow — BFS visitation-order columns', () => {
  it('columns follow BFS order, not workflow.nodes declaration order', () => {
    // Declare start LAST in `nodes`. If we used declaration order,
    // `start` would land in column 2 at rank 0 — but there is no
    // sibling at rank 0, so col must be 0.
    const wf: Workflow = {
      id: 'w', version: 1, trigger: 'on_submit', startNodeId: 'start',
      nodes: [
        { id: 'childA', type: 'approval', assignTo: 'role:x' },
        { id: 'childB', type: 'approval', assignTo: 'role:y' },
        { id: 'done',   type: 'terminal', outcome: 'finalized' },
        { id: 'denied', type: 'terminal', outcome: 'denied' },
        { id: 'start',  type: 'condition', expr: 'event.cost > 0' },
      ],
      edges: [
        { from: 'start',  to: 'childA', when: 'true' },
        { from: 'start',  to: 'childB', when: 'false' },
        { from: 'childA', to: 'done',   when: 'approved' },
        { from: 'childA', to: 'denied', when: 'denied'   },
        { from: 'childB', to: 'done',   when: 'approved' },
        { from: 'childB', to: 'denied', when: 'denied'   },
      ],
    }
    const r = layoutWorkflow(wf)
    // rank → y (start is above its children)
    expect(r.positions.start.y).toBeLessThan(r.positions.childA.y)
    expect(r.positions.start.y).toBeLessThan(r.positions.childB.y)
    // start is alone at rank 0 → col 0 (same x as the first child).
    expect(r.positions.start.x).toBe(r.positions.childA.x)
    // childA visited before childB (edge declaration order) → A < B on x.
    expect(r.positions.childA.x).toBeLessThan(r.positions.childB.x)
    // Same rank → same y.
    expect(r.positions.childA.y).toBe(r.positions.childB.y)
  })
})

describe('layoutWorkflow — bounding box', () => {
  it('origin + size cover negative-coordinate overrides', () => {
    const overrides: WorkflowLayout = {
      workflowId: singleApproverWorkflow.id,
      workflowVersion: singleApproverWorkflow.version,
      positions: { approve: { x: -200, y: -120 } },
    }
    const r = layoutWorkflow(singleApproverWorkflow, overrides)
    // origin must be at least as far left/up as the dragged node.
    expect(r.origin.x).toBeLessThanOrEqual(-200)
    expect(r.origin.y).toBeLessThanOrEqual(-120)
    // and the box must reach the dragged node's far edges.
    expect(r.origin.x + r.size.w).toBeGreaterThanOrEqual(-200 + NODE_WIDTH)
    expect(r.origin.y + r.size.h).toBeGreaterThanOrEqual(-120 + NODE_HEIGHT)
    // every node (override or BFS-default) fits inside the box.
    for (const p of Object.values(r.positions)) {
      expect(p.x).toBeGreaterThanOrEqual(r.origin.x)
      expect(p.y).toBeGreaterThanOrEqual(r.origin.y)
      expect(p.x + NODE_WIDTH).toBeLessThanOrEqual(r.origin.x + r.size.w)
      expect(p.y + NODE_HEIGHT).toBeLessThanOrEqual(r.origin.y + r.size.h)
    }
  })

  it('bounding box includes back-edge detour channel', () => {
    const wf: Workflow = {
      id: 'cycle', version: 1, trigger: 'on_submit', startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:x' },
        { id: 'b', type: 'approval', assignTo: 'role:y' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
        { id: 'denied', type: 'terminal', outcome: 'denied' },
      ],
      edges: [
        { from: 'a', to: 'b', when: 'approved' },
        { from: 'a', to: 'denied', when: 'denied' },
        { from: 'b', to: 'a', when: 'denied' },
        { from: 'b', to: 'done', when: 'approved' },
      ],
    }
    const r = layoutWorkflow(wf)
    const backEdge = r.edgePaths.find(e => e.from === 'b' && e.to === 'a')
    expect(backEdge).toBeDefined()
    // Back-edge channel sits left of every node; origin.x must be at
    // least that far left so the detour isn't clipped.
    const minNodeX = Math.min(...Object.values(r.positions).map(p => p.x))
    expect(r.origin.x).toBeLessThan(minNodeX)
  })
})

describe('layoutWorkflow — corner cases', () => {
  it('places unreachable nodes below the main graph', () => {
    const wf: Workflow = {
      ...singleApproverWorkflow,
      nodes: [
        ...singleApproverWorkflow.nodes,
        { id: 'orphan', type: 'terminal', outcome: 'cancelled' },
      ],
    }
    const r = layoutWorkflow(wf)
    const maxReachableY = Math.max(
      r.positions.approve.y,
      r.positions.done.y,
      r.positions.denied.y,
    )
    expect(r.positions.orphan.y).toBeGreaterThan(maxReachableY)
  })

  it('back-edges get a detour path (different from forward L-shape)', () => {
    // Build a trivial cycle: a → b → a
    const wf: Workflow = {
      id: 'cycle', version: 1, trigger: 'on_submit', startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:x' },
        { id: 'b', type: 'approval', assignTo: 'role:y' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
        { id: 'denied', type: 'terminal', outcome: 'denied' },
      ],
      edges: [
        { from: 'a', to: 'b', when: 'approved' },
        { from: 'a', to: 'denied', when: 'denied' },
        { from: 'b', to: 'a', when: 'denied' },
        { from: 'b', to: 'done', when: 'approved' },
      ],
    }
    const r = layoutWorkflow(wf)
    const backEdge = r.edgePaths.find(e => e.from === 'b' && e.to === 'a')
    expect(backEdge).toBeDefined()
    // Back-edge d-string includes a negative-X detour channel
    // (channelX = min(ax, bx) - 40) so it exits left of the graph.
    expect(backEdge!.d).toContain('L ')
    expect(backEdge!.d.split('L').length).toBeGreaterThanOrEqual(3)
  })

  it('self-loops render as a curve', () => {
    const wf: Workflow = {
      id: 'self', version: 1, trigger: 'on_submit', startNodeId: 'a',
      nodes: [
        { id: 'a', type: 'approval', assignTo: 'role:x' },
        { id: 'done', type: 'terminal', outcome: 'finalized' },
      ],
      edges: [
        { from: 'a', to: 'a', when: 'denied' },
        { from: 'a', to: 'done', when: 'approved' },
      ],
    }
    const r = layoutWorkflow(wf)
    const loop = r.edgePaths.find(e => e.from === 'a' && e.to === 'a')
    expect(loop?.d.startsWith('M ')).toBe(true)
    expect(loop?.d).toContain('C ')
  })
})

describe('snapToGrid', () => {
  it('rounds to the nearest 20px', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(9)).toBe(0)
    expect(snapToGrid(11)).toBe(20)
    expect(snapToGrid(100)).toBe(100)
    expect(snapToGrid(109)).toBe(100)
    expect(snapToGrid(-11)).toBe(-20)
  })
})

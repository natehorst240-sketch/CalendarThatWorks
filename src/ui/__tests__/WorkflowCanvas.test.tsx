// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'

import { WorkflowCanvas } from '../WorkflowCanvas'
import { GRID_SNAP } from '../../core/workflow/layout'
import {
  singleApproverWorkflow,
  conditionalByCostWorkflow,
} from '../../core/workflow/templates'
import type { Workflow, WorkflowLayout } from '../../core/workflow/workflowSchema'

const emptyLayout = (wf: Workflow): WorkflowLayout => ({
  workflowId: wf.id,
  workflowVersion: wf.version,
  positions: {},
})

function renderCanvas(
  wf: Workflow,
  overrides: Partial<React.ComponentProps<typeof WorkflowCanvas>> = {},
) {
  const handlers = {
    onSelectNode: vi.fn(),
    onMoveNode: vi.fn(),
    onOpenInspector: vi.fn(),
    onDeleteNode: vi.fn(),
    onCreateEdge: vi.fn(),
  }
  const utils = render(
    <WorkflowCanvas
      workflow={wf}
      layout={emptyLayout(wf)}
      selectedNodeId={null}
      {...handlers}
      {...overrides}
    />,
  )
  return { ...utils, ...handlers }
}

describe('WorkflowCanvas — rendering', () => {
  it('renders one <g> per node with a data-node-id', () => {
    renderCanvas(singleApproverWorkflow)
    for (const n of singleApproverWorkflow.nodes) {
      expect(document.querySelector(`[data-node-id="${n.id}"]`)).toBeInTheDocument()
    }
  })

  it('renders one edge path per edge with correct from/to attrs', () => {
    renderCanvas(conditionalByCostWorkflow)
    const paths = document.querySelectorAll('[data-edge-from]')
    expect(paths.length).toBe(conditionalByCostWorkflow.edges.length)
    expect(document.querySelector('[data-edge-from="check-cost"][data-edge-to="director"]'))
      .toBeInTheDocument()
  })

  it('marks the selected node with aria-pressed=true', () => {
    renderCanvas(singleApproverWorkflow, { selectedNodeId: 'approve' })
    const node = document.querySelector('[data-node-id="approve"]')
    expect(node?.getAttribute('aria-pressed')).toBe('true')
  })

  it('adds the active-node class when activeNodeId matches', () => {
    renderCanvas(singleApproverWorkflow, { activeNodeId: 'approve' })
    const node = document.querySelector('[data-node-id="approve"]')
    expect(node?.className).toMatch(/nodeActive/)
  })
})

describe('WorkflowCanvas — pointer interactions', () => {
  it('clicking a node calls onSelectNode with its id', () => {
    const { onSelectNode } = renderCanvas(singleApproverWorkflow)
    const node = document.querySelector('[data-node-id="approve"]')!
    fireEvent.pointerDown(node, { pointerId: 1, clientX: 0, clientY: 0 })
    expect(onSelectNode).toHaveBeenCalledWith('approve')
  })

  it('double-clicking a node calls onOpenInspector', () => {
    const { onOpenInspector } = renderCanvas(singleApproverWorkflow)
    const node = document.querySelector('[data-node-id="approve"]')!
    fireEvent.doubleClick(node)
    expect(onOpenInspector).toHaveBeenCalledWith('approve')
  })

  it('clicking the source handle starts edge-draw mode', () => {
    renderCanvas(singleApproverWorkflow)
    const handle = document.querySelector('[data-handle-for="approve"]')!
    fireEvent.pointerDown(handle, { pointerId: 1 })
    const live = screen.getByTestId('workflow-canvas-live')
    expect(live.textContent).toMatch(/drawing edge from approve/i)
  })

  it('clicking a target node while in edge-draw mode commits the edge', () => {
    const { onCreateEdge } = renderCanvas(singleApproverWorkflow)
    fireEvent.pointerDown(
      document.querySelector('[data-handle-for="approve"]')!,
      { pointerId: 1 },
    )
    fireEvent.pointerDown(
      document.querySelector('[data-node-id="done"]')!,
      { pointerId: 2, clientX: 0, clientY: 0 },
    )
    expect(onCreateEdge).toHaveBeenCalledWith('approve', 'done')
  })

  it('terminal nodes do NOT render a source handle', () => {
    renderCanvas(singleApproverWorkflow)
    expect(document.querySelector('[data-handle-for="done"]')).toBeNull()
    expect(document.querySelector('[data-handle-for="denied"]')).toBeNull()
  })
})

describe('WorkflowCanvas — keyboard', () => {
  it('Arrow keys nudge the selected node by GRID_SNAP', () => {
    const { onMoveNode } = renderCanvas(singleApproverWorkflow, {
      selectedNodeId: 'approve',
    })
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(onMoveNode).toHaveBeenCalledTimes(1)
    const [id, pos] = onMoveNode.mock.calls[0]
    expect(id).toBe('approve')
    // Default BFS layout puts 'approve' at (40, 40); snapped right == 60.
    expect(pos.x - 40).toBe(GRID_SNAP)
    expect(pos.y).toBe(40)
  })

  it('Enter opens the inspector for the selected node', () => {
    const { onOpenInspector } = renderCanvas(singleApproverWorkflow, {
      selectedNodeId: 'approve',
    })
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'Enter' })
    expect(onOpenInspector).toHaveBeenCalledWith('approve')
  })

  it('Delete removes the selected node', () => {
    const { onDeleteNode } = renderCanvas(singleApproverWorkflow, {
      selectedNodeId: 'approve',
    })
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'Delete' })
    expect(onDeleteNode).toHaveBeenCalledWith('approve')
  })

  it('Ctrl+E + focus-move + Enter creates an edge', () => {
    const { onCreateEdge } = renderCanvas(singleApproverWorkflow, {
      selectedNodeId: 'approve',
    })
    const svg = screen.getByTestId('workflow-canvas')
    // Start edge-draw from selected 'approve'.
    fireEvent.keyDown(svg, { key: 'e', ctrlKey: true })
    // Move focus to 'done' (Tab would do this in a browser; simulate via focus event).
    const target = document.querySelector('[data-node-id="done"]') as SVGGElement
    fireEvent.focus(target)
    // Commit with Enter.
    fireEvent.keyDown(svg, { key: 'Enter' })
    expect(onCreateEdge).toHaveBeenCalledWith('approve', 'done')
  })

  it('Escape cancels edge-draw mode', () => {
    renderCanvas(singleApproverWorkflow, { selectedNodeId: 'approve' })
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'e', ctrlKey: true })
    const live = screen.getByTestId('workflow-canvas-live')
    expect(live.textContent).toMatch(/drawing edge/i)
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(live.textContent).toMatch(/cancelled/i)
  })

  it('Escape clears selection when not in edge-draw mode', () => {
    const { onSelectNode } = renderCanvas(singleApproverWorkflow, {
      selectedNodeId: 'approve',
    })
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(onSelectNode).toHaveBeenCalledWith(null)
  })

  it('renders nodes in BFS order so native Tab order traverses the graph', () => {
    renderCanvas(conditionalByCostWorkflow)
    const nodes = [...document.querySelectorAll('[data-node-id]')].map(
      n => n.getAttribute('data-node-id'),
    )
    // BFS from 'check-cost': first the root, then rank-1 children, then rank-2, ...
    expect(nodes[0]).toBe('check-cost')
    // director + notify-ops are both rank-1 children.
    expect(nodes.slice(1, 3).sort()).toEqual(['director', 'notify-ops'])
  })
})

describe('WorkflowCanvas — edge-draw safety', () => {
  it('does not commit an edge from a node to itself', () => {
    const { onCreateEdge } = renderCanvas(singleApproverWorkflow, {
      selectedNodeId: 'approve',
    })
    fireEvent.pointerDown(
      document.querySelector('[data-handle-for="approve"]')!,
      { pointerId: 1 },
    )
    // Click the same node — should not commit.
    fireEvent.pointerDown(
      document.querySelector('[data-node-id="approve"]')!,
      { pointerId: 2, clientX: 0, clientY: 0 },
    )
    expect(onCreateEdge).not.toHaveBeenCalled()
  })
})

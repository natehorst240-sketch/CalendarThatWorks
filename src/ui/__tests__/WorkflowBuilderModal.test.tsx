// @vitest-environment happy-dom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'

import { WorkflowBuilderModal } from '../WorkflowBuilderModal'
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

function renderModal(
  workflow: Workflow = singleApproverWorkflow,
  layout: WorkflowLayout = emptyLayout(workflow),
) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <WorkflowBuilderModal
      workflow={workflow}
      layout={layout}
      onSave={onSave}
      onClose={onClose}
    />,
  )
  return { ...utils, onSave, onClose }
}

describe('WorkflowBuilderModal — shell', () => {
  it('renders as a dialog labelled by the workflow id', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: /single-approver/i })
    expect(dialog).toBeInTheDocument()
  })

  it('clicking the overlay calls onClose; clicking inside does not', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByTestId('workflow-builder-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose via the focus trap', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Close button calls onClose', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /close workflow builder/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('WorkflowBuilderModal — Save gating', () => {
  it('enables Save on a validator-clean template', () => {
    renderModal()
    expect(screen.getByTestId('wb-save')).not.toBeDisabled()
  })

  it('disables Save when the workflow has a blocking error', () => {
    // Break the workflow: startNodeId points at a missing node.
    const broken: Workflow = {
      ...singleApproverWorkflow,
      startNodeId: 'does-not-exist',
    }
    renderModal(broken)
    expect(screen.getByTestId('wb-save')).toBeDisabled()
    // The issues panel surfaces the reason.
    const issues = screen.getByTestId('wb-issues-list')
    expect(issues.querySelector('[data-code="start-node-missing"]')).toBeInTheDocument()
  })

  it('Save emits the current draft workflow + layout', () => {
    const { onSave } = renderModal()
    fireEvent.click(screen.getByTestId('wb-save'))
    expect(onSave).toHaveBeenCalledTimes(1)
    const [wf, layout] = onSave.mock.calls[0]
    expect(wf.id).toBe(singleApproverWorkflow.id)
    expect(layout.workflowId).toBe(singleApproverWorkflow.id)
  })
})

describe('WorkflowBuilderModal — selection + inspector', () => {
  it('shows an empty-state hint when nothing is selected', () => {
    renderModal()
    expect(screen.getByTestId('wb-inspector-empty')).toBeInTheDocument()
  })

  it('selecting a node renders the inspector for it', () => {
    renderModal()
    const node = document.querySelector('[data-node-id="approve"]')!
    fireEvent.pointerDown(node, { pointerId: 1, clientX: 0, clientY: 0 })
    // Inspector renders the node id in a read-only field.
    const idField = screen.getByLabelText(/node id/i) as HTMLInputElement
    expect(idField.value).toBe('approve')
  })

  it('editing a field in the inspector updates the draft workflow', () => {
    renderModal()
    fireEvent.pointerDown(
      document.querySelector('[data-node-id="approve"]')!,
      { pointerId: 1, clientX: 0, clientY: 0 },
    )
    fireEvent.change(screen.getByLabelText(/assign to/i), {
      target: { value: 'user:alice' },
    })
    // The field now carries the new value on re-render.
    const input = screen.getByLabelText(/assign to/i) as HTMLInputElement
    expect(input.value).toBe('user:alice')
  })
})

describe('WorkflowBuilderModal — simulator pane', () => {
  it('switching to the Simulator tab shows the Start button', () => {
    renderModal(conditionalByCostWorkflow)
    fireEvent.click(screen.getByRole('tab', { name: /simulator/i }))
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument()
  })
})

describe('WorkflowBuilderModal — edge creation → guard picker', () => {
  it('drawing an edge opens the guard picker filtered to approval guards', () => {
    renderModal()
    // Start edge-draw from 'approve' (approval node).
    fireEvent.pointerDown(document.querySelector('[data-handle-for="approve"]')!, { pointerId: 1 })
    // Target node 'done'.
    fireEvent.pointerDown(document.querySelector('[data-node-id="done"]')!, {
      pointerId: 2, clientX: 0, clientY: 0,
    })
    const picker = screen.getByTestId('workflow-edge-guard-picker')
    expect(picker).toBeInTheDocument()
    // Approval → approved / denied / default only.
    expect(picker.querySelector('[data-guard="approved"]')).toBeInTheDocument()
    expect(picker.querySelector('[data-guard="true"]')).toBeNull()
  })

  it('picking a guard appends the edge to the draft workflow and closes the picker', () => {
    const { onSave } = renderModal()
    fireEvent.pointerDown(document.querySelector('[data-handle-for="approve"]')!, { pointerId: 1 })
    fireEvent.pointerDown(document.querySelector('[data-node-id="done"]')!, {
      pointerId: 2, clientX: 0, clientY: 0,
    })
    // Pick 'approved'.
    fireEvent.click(document.querySelector('[data-guard="approved"]')!)
    expect(screen.queryByTestId('workflow-edge-guard-picker')).toBeNull()
    // Save and inspect the outgoing edge list.
    fireEvent.click(screen.getByTestId('wb-save'))
    const [wf] = onSave.mock.calls[0]
    const added = wf.edges.filter(
      (e: { from: string; to: string }) => e.from === 'approve' && e.to === 'done',
    )
    // Template already has approve→done (approved), so we now have 2.
    expect(added.length).toBe(2)
  })
})

describe('WorkflowBuilderModal — delete + undo', () => {
  it('Delete removes the node; Undo restores it exactly', () => {
    const { onSave } = renderModal(conditionalByCostWorkflow)
    // Select 'notify-ops' then press Delete on the canvas.
    const node = document.querySelector('[data-node-id="notify-ops"]')!
    fireEvent.pointerDown(node, { pointerId: 1, clientX: 0, clientY: 0 })
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'Delete' })
    expect(document.querySelector('[data-node-id="notify-ops"]')).toBeNull()
    // Undo button should now be enabled.
    expect(screen.getByTestId('wb-undo')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('wb-undo'))
    expect(document.querySelector('[data-node-id="notify-ops"]')).toBeInTheDocument()
    expect(screen.getByTestId('wb-undo')).toBeDisabled()
    // Save should round-trip the original shape.
    fireEvent.click(screen.getByTestId('wb-save'))
    const [wf] = onSave.mock.calls[0]
    expect(wf.nodes.length).toBe(conditionalByCostWorkflow.nodes.length)
  })

  it('any non-delete mutation clears the pending undo', () => {
    renderModal(conditionalByCostWorkflow)
    fireEvent.pointerDown(
      document.querySelector('[data-node-id="notify-ops"]')!,
      { pointerId: 1, clientX: 0, clientY: 0 },
    )
    const svg = screen.getByTestId('workflow-canvas')
    fireEvent.keyDown(svg, { key: 'Delete' })
    expect(screen.getByTestId('wb-undo')).not.toBeDisabled()
    // Select a different node and edit its label; that should drop the undo.
    fireEvent.pointerDown(
      document.querySelector('[data-node-id="director"]')!,
      { pointerId: 2, clientX: 0, clientY: 0 },
    )
    fireEvent.change(screen.getByLabelText(/^label$/i), { target: { value: 'New label' } })
    expect(screen.getByTestId('wb-undo')).toBeDisabled()
  })
})

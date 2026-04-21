/**
 * WorkflowBuilderModal — Phase 2 visual builder host.
 *
 * Wires the four Phase-2 parts together on top of a draft
 * `{workflow, layout}`:
 *
 *   - `WorkflowCanvas`        — graph editing (drag, select, edge-draw)
 *   - `WorkflowNodeInspector` — per-type forms for the selected node
 *   - `WorkflowEdgeGuardPicker` — popover after an edge is drawn
 *   - `WorkflowSimulator`     — step `advance()` against user variables
 *
 * Save semantics: caller owns persistence. The modal emits
 * `onSave(workflow, layout)` only when the validator returns no
 * `severity:'error'` issues; warnings are surfaced but do not gate.
 *
 * Undo: single-level delete undo per plan "out of scope" note
 * (`Full multi-step undo (only single-level delete undo ships)`). Every
 * delete snapshots the pre-delete `{workflow, layout}`; Undo restores
 * and clears the snapshot. Any other modification also clears the
 * snapshot so an Undo never jumps across unrelated edits.
 *
 * Focus trap: reuses `useFocusTrap` so Tab stays inside the dialog and
 * Escape calls `onClose`, matching ConfigPanel's pattern. Escape is
 * wrapped so that when the edge-guard picker is open, the first press
 * cancels the picker (the trap attaches at the capture phase on
 * `document`, so it would otherwise outrun the picker's own listener
 * and discard the pending edge together with every unsaved edit).
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { X, RotateCcw, Save } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  hasBlockingErrors,
  validateWorkflow,
  type ValidationIssue,
} from '../core/workflow/validate'
import type {
  EdgeGuard,
  Workflow,
  WorkflowEdge,
  WorkflowLayout,
  WorkflowNode,
} from '../core/workflow/workflowSchema'
import { WorkflowCanvas } from './WorkflowCanvas'
import { WorkflowNodeInspector } from './WorkflowNodeInspector'
import { WorkflowEdgeGuardPicker } from './WorkflowEdgeGuardPicker'
import { WorkflowSimulator } from './WorkflowSimulator'
import styles from './WorkflowBuilderModal.module.css'

type SidePane = 'inspector' | 'simulator'

export interface WorkflowBuilderModalProps {
  readonly workflow: Workflow
  readonly layout: WorkflowLayout
  readonly title?: string
  readonly onSave: (workflow: Workflow, layout: WorkflowLayout) => void
  readonly onClose: () => void
}

interface UndoSnapshot {
  readonly workflow: Workflow
  readonly layout: WorkflowLayout
}

export function WorkflowBuilderModal(
  props: WorkflowBuilderModalProps,
): JSX.Element {
  const { workflow: initialWorkflow, layout: initialLayout, title, onSave, onClose } = props

  const [draftWorkflow, setDraftWorkflow] = useState<Workflow>(initialWorkflow)
  const [draftLayout,   setDraftLayout]   = useState<WorkflowLayout>(initialLayout)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sidePane, setSidePane] = useState<SidePane>('inspector')
  const [pendingEdge, setPendingEdge] = useState<{ from: string; to: string } | null>(null)
  const [undoSnap, setUndoSnap] = useState<UndoSnapshot | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  // Trap's Escape wiring: cancel any open transient UI (edge-guard
  // picker) before falling back to onClose. The trap binds on
  // `document` at the capture phase, so without this layering it would
  // outrun the picker's own window-level Escape handler.
  const pendingEdgeRef = useRef(pendingEdge)
  pendingEdgeRef.current = pendingEdge
  const handleEscape = useCallback(() => {
    if (pendingEdgeRef.current) {
      setPendingEdge(null)
      return
    }
    onClose()
  }, [onClose])
  const trapRef = useFocusTrap(handleEscape)

  // Validator runs on every draft change — cheap for Phase-2-sized graphs.
  const issues = useMemo(
    () => validateWorkflow(draftWorkflow),
    [draftWorkflow],
  )
  const blocked = hasBlockingErrors(issues)
  const issuesByNode = useMemo(
    () => groupIssuesByNode(issues),
    [issues],
  )

  const selectedNode: WorkflowNode | undefined = selectedNodeId
    ? draftWorkflow.nodes.find(n => n.id === selectedNodeId)
    : undefined

  // ─── Snapshot helper: cleared on non-delete mutations ────────────────────
  const clearUndo = useCallback(() => setUndoSnap(null), [])

  // ─── Graph mutations ─────────────────────────────────────────────────────

  const handleMoveNode = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      setDraftLayout(prev => ({
        ...prev,
        positions: { ...prev.positions, [id]: pos },
      }))
      clearUndo()
    },
    [clearUndo],
  )

  const handleNodeChange = useCallback(
    (patch: Partial<WorkflowNode>) => {
      if (!selectedNodeId) return
      setDraftWorkflow(prev => ({
        ...prev,
        nodes: prev.nodes.map(n =>
          n.id === selectedNodeId
            ? ({ ...n, ...patch } as WorkflowNode)
            : n,
        ),
      }))
      clearUndo()
    },
    [selectedNodeId, clearUndo],
  )

  const handleDeleteNode = useCallback(
    (id: string) => {
      const node = draftWorkflow.nodes.find(n => n.id === id)
      if (!node) return
      setUndoSnap({ workflow: draftWorkflow, layout: draftLayout })
      setDraftWorkflow(prev => ({
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== id),
        edges: prev.edges.filter(e => e.from !== id && e.to !== id),
      }))
      setDraftLayout(prev => {
        if (!(id in prev.positions)) return prev
        const nextPositions: Record<string, { x: number; y: number }> = {}
        for (const [k, v] of Object.entries(prev.positions)) {
          if (k !== id) nextPositions[k] = v
        }
        return { ...prev, positions: nextPositions }
      })
      if (selectedNodeId === id) setSelectedNodeId(null)
    },
    [draftWorkflow, draftLayout, selectedNodeId],
  )

  const handleUndo = useCallback(() => {
    if (!undoSnap) return
    setDraftWorkflow(undoSnap.workflow)
    setDraftLayout(undoSnap.layout)
    setUndoSnap(null)
  }, [undoSnap])

  // ─── Edge creation → guard picker → commit ───────────────────────────────

  const handleCreateEdge = useCallback(
    (from: string, to: string) => setPendingEdge({ from, to }),
    [],
  )

  const commitPendingEdge = useCallback(
    (guard: EdgeGuard) => {
      if (!pendingEdge) return
      const newEdge: WorkflowEdge = guard === 'default'
        ? { from: pendingEdge.from, to: pendingEdge.to }
        : { from: pendingEdge.from, to: pendingEdge.to, when: guard }
      setDraftWorkflow(prev => ({ ...prev, edges: [...prev.edges, newEdge] }))
      setPendingEdge(null)
      clearUndo()
    },
    [pendingEdge, clearUndo],
  )

  const pendingEdgeSource: WorkflowNode | null = pendingEdge
    ? draftWorkflow.nodes.find(n => n.id === pendingEdge.from) ?? null
    : null
  const pendingEdgeSourceType = pendingEdgeSource?.type ?? null
  const pendingEdgeSourceHasSla =
    pendingEdgeSource?.type === 'approval'
    && typeof pendingEdgeSource.slaMinutes === 'number'
    && pendingEdgeSource.slaMinutes > 0

  // ─── Save ────────────────────────────────────────────────────────────────

  const saveBtnRef = useRef<HTMLButtonElement | null>(null)
  const handleSave = useCallback(() => {
    if (blocked) return
    onSave(draftWorkflow, draftLayout)
  }, [blocked, draftWorkflow, draftLayout, onSave])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      data-testid="workflow-builder-overlay"
    >
      <div
        ref={trapRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? `Workflow builder — ${draftWorkflow.id}`}
      >
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <h2 className={styles.title}>{title ?? 'Workflow builder'}</h2>
            <span className={styles.subtitle} data-testid="wb-workflow-id">
              {draftWorkflow.id} · v{draftWorkflow.version}
            </span>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={handleUndo}
              disabled={!undoSnap}
              data-testid="wb-undo"
            >
              <RotateCcw size={14} aria-hidden="true" /> Undo delete
            </button>
            <button
              type="button"
              ref={saveBtnRef}
              className={styles.primary}
              onClick={handleSave}
              disabled={blocked}
              data-testid="wb-save"
            >
              <Save size={14} aria-hidden="true" /> Save
            </button>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close workflow builder"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <div className={styles.canvasPane}>
            <WorkflowCanvas
              workflow={draftWorkflow}
              layout={draftLayout}
              selectedNodeId={selectedNodeId}
              activeNodeId={activeNodeId}
              onSelectNode={setSelectedNodeId}
              onMoveNode={handleMoveNode}
              onOpenInspector={id => {
                setSelectedNodeId(id)
                setSidePane('inspector')
              }}
              onDeleteNode={handleDeleteNode}
              onCreateEdge={handleCreateEdge}
            />
            {pendingEdge && pendingEdgeSourceType && (
              <WorkflowEdgeGuardPicker
                sourceType={pendingEdgeSourceType}
                sourceHasSla={pendingEdgeSourceHasSla}
                onPick={commitPendingEdge}
                onCancel={() => setPendingEdge(null)}
              />
            )}
          </div>

          <aside className={styles.sidePane} aria-label="Builder side panel">
            <div role="tablist" className={styles.sideTabs}>
              <button
                type="button"
                role="tab"
                aria-selected={sidePane === 'inspector'}
                className={sidePane === 'inspector' ? styles.sideTabActive : styles.sideTab}
                onClick={() => setSidePane('inspector')}
              >
                Inspector
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidePane === 'simulator'}
                className={sidePane === 'simulator' ? styles.sideTabActive : styles.sideTab}
                onClick={() => setSidePane('simulator')}
              >
                Simulator
              </button>
            </div>

            {sidePane === 'inspector' && (
              selectedNode
                ? (
                  <WorkflowNodeInspector
                    node={selectedNode}
                    onChange={handleNodeChange}
                  />
                )
                : (
                  <p className={styles.empty} data-testid="wb-inspector-empty">
                    Select a node to edit its fields.
                  </p>
                )
            )}

            {sidePane === 'simulator' && (
              <WorkflowSimulator
                workflow={draftWorkflow}
                onActiveNodeChange={setActiveNodeId}
              />
            )}

            <IssuesList issues={issues} byNode={issuesByNode} />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default WorkflowBuilderModal

// ─── Issue list ──────────────────────────────────────────────────────────

function IssuesList({
  issues,
  byNode,
}: {
  issues: readonly ValidationIssue[]
  byNode: Readonly<Record<string, readonly ValidationIssue[]>>
}): JSX.Element {
  if (issues.length === 0) {
    return (
      <p className={styles.clean} data-testid="wb-issues-clean">
        No validation issues. Ready to save.
      </p>
    )
  }
  return (
    <div className={styles.issuesBlock}>
      <h4 className={styles.issuesTitle}>Validation</h4>
      <ul className={styles.issuesList} data-testid="wb-issues-list">
        {issues.map((issue, i) => (
          <li
            key={`${issue.code}-${i}`}
            className={styles.issueItem}
            data-severity={issue.severity}
            data-code={issue.code}
          >
            <span className={styles.issueSeverity}>{issue.severity}</span>
            <span className={styles.issueMessage}>{issue.message}</span>
          </li>
        ))}
      </ul>
      {Object.keys(byNode).length > 0 && (
        <p className={styles.issuesByNodeHint}>
          {Object.keys(byNode).length} node(s) with issues — click a node on the canvas to inspect.
        </p>
      )}
    </div>
  )
}

function groupIssuesByNode(
  issues: readonly ValidationIssue[],
): Readonly<Record<string, readonly ValidationIssue[]>> {
  const acc: Record<string, ValidationIssue[]> = {}
  for (const i of issues) {
    if (!i.nodeId) continue
    if (!acc[i.nodeId]) acc[i.nodeId] = []
    acc[i.nodeId].push(i)
  }
  return acc
}

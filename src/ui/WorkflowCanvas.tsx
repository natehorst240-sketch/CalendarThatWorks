/**
 * WorkflowCanvas — hand-rolled SVG graph editor.
 *
 * Renders nodes + edges from `layoutWorkflow(workflow, layout)` and
 * surfaces pointer and keyboard interactions back up via props — the
 * parent owns `workflow`, `layout`, and selection state so Save / undo
 * in the modal can reason about them.
 *
 * Keyboard contract (see Phase 2 plan → a11y section):
 *   - Tab        : native DOM order; nodes render in BFS order so the
 *                  natural tab sequence is also graph order.
 *   - Arrow keys : nudge the selected node by `GRID_SNAP` px.
 *   - Enter      : open the inspector for the selected node, OR commit
 *                  an edge when in edge-draw mode with a different
 *                  node focused.
 *   - Delete     : remove the selected node.
 *   - Ctrl/⌘ + E : enter edge-draw mode; source = selected node.
 *   - Escape     : cancel edge-draw mode / clear selection.
 *
 * Drag: pointer events on each node group; the viewBox → client scale
 * is captured on pointerdown so concurrent CSS resizes don't poison
 * the delta. Position is committed (and snapped to the grid) on
 * pointerup, so intermediate moves don't spam the parent.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  GRID_SNAP,
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutWorkflow,
  snapToGrid,
} from '../core/workflow/layout'
import type {
  Workflow,
  WorkflowLayout,
  WorkflowNode,
} from '../core/workflow/workflowSchema'
import styles from './WorkflowCanvas.module.css'

export interface WorkflowCanvasProps {
  readonly workflow: Workflow
  readonly layout: WorkflowLayout
  readonly selectedNodeId: string | null
  /** If set, the matching node pulses — driven by the simulator. */
  readonly activeNodeId?: string | null
  readonly onSelectNode: (id: string | null) => void
  readonly onMoveNode: (id: string, pos: { x: number; y: number }) => void
  readonly onOpenInspector: (id: string) => void
  readonly onDeleteNode: (id: string) => void
  readonly onCreateEdge: (from: string, to: string) => void
}

interface DragState {
  readonly nodeId: string
  readonly pointerId: number
  readonly scaleX: number
  readonly scaleY: number
  readonly startClientX: number
  readonly startClientY: number
  readonly origin: { x: number; y: number }
  currentPos: { x: number; y: number }
}

function displayLabel(node: WorkflowNode): string {
  if (node.label) return node.label
  switch (node.type) {
    case 'approval':  return node.assignTo
    case 'condition': return node.expr
    case 'notify':    return node.channel
    case 'terminal':  return node.outcome
  }
}

/**
 * Sort nodes by (y, x). Layout assigns rank → y and col → x by BFS
 * visitation order, so this yields the same sequence as the BFS walk
 * — which is what Tab should traverse.
 */
function bfsOrderedNodes(
  nodes: readonly WorkflowNode[],
  positions: Record<string, { x: number; y: number }>,
): readonly WorkflowNode[] {
  return [...nodes].sort((a, b) => {
    const pa = positions[a.id]
    const pb = positions[b.id]
    if (!pa || !pb) return 0
    if (pa.y !== pb.y) return pa.y - pb.y
    return pa.x - pb.x
  })
}

export function WorkflowCanvas(props: WorkflowCanvasProps): JSX.Element {
  const {
    workflow,
    layout,
    selectedNodeId,
    activeNodeId,
    onSelectNode,
    onMoveNode,
    onOpenInspector,
    onDeleteNode,
    onCreateEdge,
  } = props

  const svgRef = useRef<SVGSVGElement | null>(null)
  const [pendingEdgeFrom, setPendingEdgeFrom] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [liveMessage, setLiveMessage] = useState<string>('')
  const [drag, setDrag] = useState<DragState | null>(null)

  // Recompute layout + paths on every workflow/layout change.
  const rendered = useMemo(
    () => layoutWorkflow(workflow, layout),
    [workflow, layout],
  )
  const orderedNodes = useMemo(
    () => bfsOrderedNodes(workflow.nodes, rendered.positions),
    [workflow.nodes, rendered.positions],
  )

  // Cancel any pending edge-draw when the workflow mutates under us
  // (nodes deleted, etc.) so we don't dangle a pointer at a gone node.
  useEffect(() => {
    if (pendingEdgeFrom && !workflow.nodes.some(n => n.id === pendingEdgeFrom)) {
      setPendingEdgeFrom(null)
    }
  }, [workflow, pendingEdgeFrom])

  const announce = useCallback((msg: string) => setLiveMessage(msg), [])

  const commitEdgeDrawTo = useCallback(
    (targetId: string) => {
      if (!pendingEdgeFrom) return
      if (pendingEdgeFrom === targetId) {
        announce('Cannot draw an edge to the same node')
        return
      }
      onCreateEdge(pendingEdgeFrom, targetId)
      announce(`Edge created from ${pendingEdgeFrom} to ${targetId}`)
      setPendingEdgeFrom(null)
    },
    [pendingEdgeFrom, onCreateEdge, announce],
  )

  // ─── Node pointer handlers ──────────────────────────────────────────────

  const handleNodePointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>, node: WorkflowNode) => {
      if (pendingEdgeFrom && pendingEdgeFrom !== node.id) {
        e.preventDefault()
        commitEdgeDrawTo(node.id)
        return
      }
      onSelectNode(node.id)
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const scaleX = rendered.size.w / rect.width
      const scaleY = rendered.size.h / rect.height
      const origin = rendered.positions[node.id]
      if (!origin) return
      const g = e.currentTarget
      try { g.setPointerCapture(e.pointerId) } catch { /* happy-dom no-op */ }
      setDrag({
        nodeId: node.id,
        pointerId: e.pointerId,
        scaleX,
        scaleY,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origin,
        currentPos: origin,
      })
    },
    [pendingEdgeFrom, commitEdgeDrawTo, onSelectNode, rendered.positions, rendered.size],
  )

  const handleNodePointerMove = useCallback(
    (e: ReactPointerEvent<SVGGElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const dx = (e.clientX - drag.startClientX) * drag.scaleX
      const dy = (e.clientY - drag.startClientY) * drag.scaleY
      const next = { x: drag.origin.x + dx, y: drag.origin.y + dy }
      setDrag({ ...drag, currentPos: next })
    },
    [drag],
  )

  const handleNodePointerUp = useCallback(
    (e: ReactPointerEvent<SVGGElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const g = e.currentTarget
      try { g.releasePointerCapture(e.pointerId) } catch { /* happy-dom no-op */ }
      const snapped = {
        x: snapToGrid(drag.currentPos.x),
        y: snapToGrid(drag.currentPos.y),
      }
      if (snapped.x !== drag.origin.x || snapped.y !== drag.origin.y) {
        onMoveNode(drag.nodeId, snapped)
      }
      setDrag(null)
    },
    [drag, onMoveNode],
  )

  // ─── Source-handle click → start edge-draw ──────────────────────────────

  const handleSourceHandleClick = useCallback(
    (e: ReactPointerEvent<SVGElement>, nodeId: string) => {
      e.stopPropagation()
      setPendingEdgeFrom(nodeId)
      onSelectNode(nodeId)
      announce(`Drawing edge from ${nodeId} — select a target node`)
    },
    [announce, onSelectNode],
  )

  // ─── Keyboard ───────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<SVGSVGElement>) => {
      if (e.key === 'Escape') {
        if (pendingEdgeFrom) {
          setPendingEdgeFrom(null)
          announce('Edge-draw cancelled')
          e.preventDefault()
          return
        }
        if (selectedNodeId) {
          onSelectNode(null)
          e.preventDefault()
        }
        return
      }

      if (e.key === 'Enter') {
        if (pendingEdgeFrom && focusedNodeId && focusedNodeId !== pendingEdgeFrom) {
          commitEdgeDrawTo(focusedNodeId)
          e.preventDefault()
          return
        }
        const target = focusedNodeId ?? selectedNodeId
        if (target) {
          onOpenInspector(target)
          e.preventDefault()
        }
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        onDeleteNode(selectedNodeId)
        announce(`Node ${selectedNodeId} deleted`)
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && selectedNodeId) {
        setPendingEdgeFrom(selectedNodeId)
        announce(
          `Drawing edge from ${selectedNodeId} — Tab to a target node, then Enter`,
        )
        e.preventDefault()
        return
      }

      if (selectedNodeId && e.key.startsWith('Arrow')) {
        const pos = rendered.positions[selectedNodeId]
        if (!pos) return
        let dx = 0, dy = 0
        if (e.key === 'ArrowLeft')  dx = -GRID_SNAP
        if (e.key === 'ArrowRight') dx = +GRID_SNAP
        if (e.key === 'ArrowUp')    dy = -GRID_SNAP
        if (e.key === 'ArrowDown')  dy = +GRID_SNAP
        onMoveNode(selectedNodeId, {
          x: snapToGrid(pos.x + dx),
          y: snapToGrid(pos.y + dy),
        })
        e.preventDefault()
      }
    },
    [
      pendingEdgeFrom,
      focusedNodeId,
      selectedNodeId,
      commitEdgeDrawTo,
      onOpenInspector,
      onDeleteNode,
      onMoveNode,
      rendered.positions,
      announce,
      onSelectNode,
    ],
  )

  // Clicking empty space deselects / cancels edge-draw.
  const handleBackgroundPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.target !== e.currentTarget) return
      if (pendingEdgeFrom) {
        setPendingEdgeFrom(null)
        announce('Edge-draw cancelled')
      }
      onSelectNode(null)
    },
    [onSelectNode, pendingEdgeFrom, announce],
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  const viewBox = `${rendered.origin.x} ${rendered.origin.y} ${rendered.size.w} ${rendered.size.h}`

  return (
    <div className={styles.wrap}>
      <svg
        ref={svgRef}
        className={styles.canvas}
        viewBox={viewBox}
        role="application"
        aria-label="Workflow graph editor"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handleBackgroundPointerDown}
        data-testid="workflow-canvas"
      >
        <defs>
          <marker
            id="wc-edge-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {rendered.edgePaths.map((edge, idx) => (
          <g key={`e-${idx}`} className={styles.edge} data-edge-index={idx}>
            <path
              d={edge.d}
              className={styles.edge}
              markerEnd="url(#wc-edge-arrow)"
              data-edge-from={edge.from}
              data-edge-to={edge.to}
            />
            {edge.guard && edge.guard !== 'default' ? (
              <>
                <rect
                  className={styles.edgeGuardBg}
                  x={edge.midpoint.x - 26}
                  y={edge.midpoint.y - 8}
                  width={52}
                  height={16}
                  rx={3}
                  ry={3}
                />
                <text
                  className={styles.edgeGuard}
                  x={edge.midpoint.x}
                  y={edge.midpoint.y + 4}
                  textAnchor="middle"
                >
                  {edge.guard}
                </text>
              </>
            ) : null}
          </g>
        ))}

        {orderedNodes.map(node => {
          const pos = rendered.positions[node.id]
          if (!pos) return null
          const live = drag && drag.nodeId === node.id ? drag.currentPos : pos
          const kindClass =
            node.type === 'approval'  ? styles.nodeKindApproval  :
            node.type === 'condition' ? styles.nodeKindCondition :
            node.type === 'notify'    ? styles.nodeKindNotify    :
                                        styles.nodeKindTerminal
          const classes = [
            styles.node,
            kindClass,
            selectedNodeId === node.id ? styles.nodeSelected : '',
            activeNodeId === node.id ? styles.nodeActive : '',
            pendingEdgeFrom === node.id ? styles.edgeDrawSource : '',
            drag?.nodeId === node.id ? styles.dragging : '',
          ].filter(Boolean).join(' ')

          return (
            <g
              key={node.id}
              className={classes}
              transform={`translate(${live.x} ${live.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${node.type} node ${displayLabel(node)}`}
              aria-pressed={selectedNodeId === node.id}
              data-node-id={node.id}
              onFocus={() => setFocusedNodeId(node.id)}
              onBlur={() => setFocusedNodeId(prev => (prev === node.id ? null : prev))}
              onPointerDown={e => handleNodePointerDown(e, node)}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onPointerCancel={handleNodePointerUp}
              onDoubleClick={() => onOpenInspector(node.id)}
            >
              <rect
                className={styles.nodeRect}
                x={0}
                y={0}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
                ry={6}
              />
              <text x={10} y={18} className={styles.nodeKind}>{node.type}</text>
              <text x={10} y={38} className={styles.nodeLabel}>
                {displayLabel(node).length > 22
                  ? displayLabel(node).slice(0, 21) + '…'
                  : displayLabel(node)}
              </text>
              {node.type !== 'terminal' ? (
                <circle
                  className={styles.handle}
                  cx={NODE_WIDTH / 2}
                  cy={NODE_HEIGHT}
                  r={5}
                  role="button"
                  aria-label={`Start an edge from ${node.id}`}
                  data-handle-for={node.id}
                  onPointerDown={e => handleSourceHandleClick(e, node.id)}
                />
              ) : null}
            </g>
          )
        })}
      </svg>
      <div
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        data-testid="workflow-canvas-live"
      >
        {liveMessage}
      </div>
    </div>
  )
}

export default WorkflowCanvas

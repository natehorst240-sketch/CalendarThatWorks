/**
 * Workflow layout — Phase 2 visual builder.
 *
 * Pure function that computes SVG positions for each node and an
 * orthogonal path per edge. BFS from `startNodeId` determines the row
 * (rank); order-of-first-visit within a rank determines the column.
 * User-provided `WorkflowLayout.positions` always wins over the
 * auto-computed values.
 */
import { type Workflow, type WorkflowLayout } from './workflowSchema'

export const NODE_WIDTH = 140
export const NODE_HEIGHT = 56
export const COLUMN_STEP = 180
export const ROW_STEP = 120
export const GRID_SNAP = 20
const MARGIN = 40

export interface NodePosition {
  readonly x: number
  readonly y: number
}

export interface EdgePath {
  readonly from: string
  readonly to: string
  readonly d: string
  readonly midpoint: NodePosition
  readonly guard?: string
}

export interface LayoutResult {
  readonly positions: Readonly<Record<string, NodePosition>>
  /** Top-left corner of the bounding box covering all nodes + edges. */
  readonly origin: NodePosition
  /** Width and height from `origin`. Consumers wire both into an SVG viewBox. */
  readonly size: { readonly w: number; readonly h: number }
  readonly edgePaths: readonly EdgePath[]
}

export function layoutWorkflow(
  workflow: Workflow,
  overrides?: WorkflowLayout | null,
): LayoutResult {
  const placement = bfsPlacement(workflow)
  const auto: Record<string, NodePosition> = {}
  for (const node of workflow.nodes) {
    const p = placement.get(node.id) ?? { rank: 0, col: 0 }
    auto[node.id] = {
      x: MARGIN + p.col * COLUMN_STEP,
      y: MARGIN + p.rank * ROW_STEP,
    }
  }

  // Overrides are scoped: silently ignore a stale `WorkflowLayout` that
  // was saved against a different workflow id or version. This keeps
  // accidentally-mismatched coordinates from being rendered against
  // the wrong graph.
  const overridesMatch =
    overrides != null &&
    overrides.workflowId === workflow.id &&
    overrides.workflowVersion === workflow.version
  const positions: Record<string, NodePosition> = {}
  for (const node of workflow.nodes) {
    const override = overridesMatch ? overrides!.positions[node.id] : undefined
    positions[node.id] = override ?? auto[node.id]
  }

  const edgePaths: EdgePath[] = workflow.edges.map(edge => {
    const a = positions[edge.from]
    const b = positions[edge.to]
    if (!a || !b) {
      return { from: edge.from, to: edge.to, d: '', midpoint: { x: 0, y: 0 }, guard: edge.when }
    }
    return edge.from === edge.to
      ? selfLoopPath(edge, a)
      : a.y >= b.y
        ? backEdgePath(edge, a, b)
        : forwardEdgePath(edge, a, b)
  })

  // Bounding box covers node rectangles AND edge-path extremes
  // (back-edge detour channels + self-loop bulges can exit the node
  // grid). Track both min and max so negative coordinates from
  // user-dragged overrides aren't clipped by consumers sizing the SVG.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const pos of Object.values(positions)) {
    if (pos.x < minX) minX = pos.x
    if (pos.y < minY) minY = pos.y
    if (pos.x + NODE_WIDTH > maxX) maxX = pos.x + NODE_WIDTH
    if (pos.y + NODE_HEIGHT > maxY) maxY = pos.y + NODE_HEIGHT
  }
  for (const path of edgePaths) {
    for (const pt of extremesOfPath(path.d)) {
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0 }

  return {
    positions,
    origin: { x: minX - MARGIN, y: minY - MARGIN },
    size: { w: (maxX - minX) + 2 * MARGIN, h: (maxY - minY) + 2 * MARGIN },
    edgePaths,
  }
}

/**
 * Extract the absolute `(x, y)` pairs from an SVG path `d` string so
 * we can expand the bounding box to cover edge-only geometry (back-edge
 * channels, self-loop arcs). Handles the command set we emit: `M L C`.
 */
function extremesOfPath(d: string): readonly NodePosition[] {
  if (!d) return []
  const pts: NodePosition[] = []
  // Split on M/L/C commands and parse number pairs.
  const tokens = d.trim().split(/[MLC]/i).filter(t => t.trim().length > 0)
  for (const t of tokens) {
    const nums = t.trim().split(/[\s,]+/).map(Number).filter(n => !Number.isNaN(n))
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push({ x: nums[i], y: nums[i + 1] })
    }
  }
  return pts
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SNAP) * GRID_SNAP
}

function forwardEdgePath(
  edge: { from: string; to: string; when?: string },
  a: NodePosition,
  b: NodePosition,
): EdgePath {
  const ax = a.x + NODE_WIDTH / 2
  const ay = a.y + NODE_HEIGHT
  const bx = b.x + NODE_WIDTH / 2
  const by = b.y
  const midY = (ay + by) / 2
  return {
    from: edge.from,
    to: edge.to,
    d: `M ${ax} ${ay} L ${ax} ${midY} L ${bx} ${midY} L ${bx} ${by}`,
    midpoint: { x: (ax + bx) / 2, y: midY },
    guard: edge.when,
  }
}

/**
 * Back-edge (target rank ≤ source rank) — detours through a channel to
 * the left of the graph so the line is visible and can't be confused
 * with forward edges.
 */
function backEdgePath(
  edge: { from: string; to: string; when?: string },
  a: NodePosition,
  b: NodePosition,
): EdgePath {
  const ax = a.x
  const ay = a.y + NODE_HEIGHT / 2
  const bx = b.x
  const by = b.y + NODE_HEIGHT / 2
  const channelX = Math.min(ax, bx) - 40
  return {
    from: edge.from,
    to: edge.to,
    d: `M ${ax} ${ay} L ${channelX} ${ay} L ${channelX} ${by} L ${bx} ${by}`,
    midpoint: { x: channelX, y: (ay + by) / 2 },
    guard: edge.when,
  }
}

function selfLoopPath(
  edge: { from: string; to: string; when?: string },
  a: NodePosition,
): EdgePath {
  const rx = a.x + NODE_WIDTH
  const ry = a.y + NODE_HEIGHT / 2
  const loopX = rx + 32
  return {
    from: edge.from,
    to: edge.to,
    d: `M ${rx} ${ry} C ${loopX} ${ry - 32}, ${loopX} ${ry + 32}, ${rx} ${ry}`,
    midpoint: { x: loopX, y: ry },
    guard: edge.when,
  }
}

/**
 * BFS from `startNodeId` that assigns each node a `{rank, col}`:
 *  - rank = depth from start (row),
 *  - col  = zero-based index in that rank's *visitation order* (not the
 *    `workflow.nodes` declaration order — visitation order keeps
 *    children of the same parent horizontally adjacent).
 *
 * Uses an index-based queue (O(1) dequeue) and a prebuilt adjacency
 * map so the traversal is O(V + E) — safe to call on every edit.
 * Nodes unreachable from `startNodeId` are piled into trailing ranks
 * (one per row) below the main graph.
 */
function bfsPlacement(
  workflow: Workflow,
): Map<string, { rank: number; col: number }> {
  const placement = new Map<string, { rank: number; col: number }>()
  const present = new Set(workflow.nodes.map(n => n.id))

  // Adjacency: map<from, to[]> preserving edge-declaration order.
  const adj = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    if (!present.has(edge.from) || !present.has(edge.to)) continue
    let list = adj.get(edge.from)
    if (!list) { list = []; adj.set(edge.from, list) }
    list.push(edge.to)
  }

  const colsInRank = new Map<number, number>()
  let maxReachableRank = 0

  if (present.has(workflow.startNodeId)) {
    const queue: Array<{ id: string; rank: number }> = [
      { id: workflow.startNodeId, rank: 0 },
    ]
    placement.set(workflow.startNodeId, { rank: 0, col: 0 })
    colsInRank.set(0, 1)
    for (let head = 0; head < queue.length; head++) {
      const { id, rank } = queue[head]
      if (rank > maxReachableRank) maxReachableRank = rank
      const neighbors = adj.get(id)
      if (!neighbors) continue
      for (const to of neighbors) {
        if (placement.has(to)) continue
        const nextRank = rank + 1
        const col = colsInRank.get(nextRank) ?? 0
        colsInRank.set(nextRank, col + 1)
        placement.set(to, { rank: nextRank, col })
        queue.push({ id: to, rank: nextRank })
      }
    }
  }

  // Orphans: one per trailing rank, column 0. Deterministic ordering
  // comes from workflow.nodes declaration order.
  let orphanRank = maxReachableRank + 1
  for (const node of workflow.nodes) {
    if (placement.has(node.id)) continue
    placement.set(node.id, { rank: orphanRank, col: 0 })
    orphanRank++
  }
  // Edge case: startNodeId wasn't in the graph at all — every node is
  // now an orphan at its own row, which matches the previous fallback
  // behavior of "layout is still defined".
  return placement
}

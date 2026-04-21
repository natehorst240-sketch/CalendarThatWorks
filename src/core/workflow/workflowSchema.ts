/**
 * Workflow DSL — JSON schema (issue #219, Phase 1).
 *
 * A `Workflow` is a declarative, versioned graph of nodes and edges
 * that drives an approval flow end-to-end. Hosts persist a running
 * instance on `event.meta.workflowInstance`; the engine calls
 * `advance()` whenever an actor takes an action.
 *
 * Phase 1 node types:
 *   - `condition` — branches on an expression (true/false edges).
 *   - `approval`  — waits for approve/deny from an assignee.
 *   - `notify`    — fires a `WorkflowEmitEvent` and falls through.
 *   - `terminal`  — ends the flow with a final outcome.
 *
 * Phase 4 will add `parallel`. Phase 3 will honor `slaMinutes` /
 * `onTimeout`; those fields are schema-present here so templates can
 * carry them forward without a migration.
 */

// ─── Trigger ──────────────────────────────────────────────────────────────

export type WorkflowTrigger = 'on_submit' | 'on_edit' | 'on_cancel'

// ─── Nodes ────────────────────────────────────────────────────────────────

export interface WorkflowConditionNode {
  readonly id: string
  readonly type: 'condition'
  /** Expression evaluated against the action's variables. See `expression.ts`. */
  readonly expr: string
  readonly label?: string
}

export type TimeoutBehavior = 'escalate' | 'auto-approve' | 'auto-deny'

export interface WorkflowApprovalNode {
  readonly id: string
  readonly type: 'approval'
  /** Routing hint — e.g. "role:director", "user:alice". Host interprets. */
  readonly assignTo: string
  readonly label?: string
  /** Phase-3 fields; schema-only in Phase 1. */
  readonly slaMinutes?: number
  readonly onTimeout?: TimeoutBehavior
}

export interface WorkflowNotifyNode {
  readonly id: string
  readonly type: 'notify'
  readonly channel: string
  readonly template?: string
  readonly label?: string
}

export type WorkflowOutcome = 'finalized' | 'denied' | 'cancelled'

export interface WorkflowTerminalNode {
  readonly id: string
  readonly type: 'terminal'
  readonly outcome: WorkflowOutcome
  readonly label?: string
}

export type WorkflowNode =
  | WorkflowConditionNode
  | WorkflowApprovalNode
  | WorkflowNotifyNode
  | WorkflowTerminalNode

// ─── Edges ────────────────────────────────────────────────────────────────

/**
 * Edge guard. The interpreter walks an edge when its `when` matches
 * the signal emitted by the previous node:
 *
 *   - `condition`  → 'true' | 'false'
 *   - `approval`   → 'approved' | 'denied' | 'timeout' (when slaMinutes set)
 *   - `notify`     → 'default'
 *   - `terminal`   → (no outgoing edges)
 *
 * An edge with no `when` is a default transition, taken when no guarded
 * edge matches. At most one default edge per source node.
 */
export type EdgeGuard =
  | 'true'
  | 'false'
  | 'approved'
  | 'denied'
  | 'timeout'
  | 'default'

export interface WorkflowEdge {
  readonly from: string
  readonly to: string
  readonly when?: EdgeGuard
}

// ─── Workflow ─────────────────────────────────────────────────────────────

export interface Workflow {
  readonly id: string
  readonly version: number
  readonly trigger: WorkflowTrigger
  /** Entry node id — the first node entered when a fresh instance starts. */
  readonly startNodeId: string
  readonly nodes: readonly WorkflowNode[]
  readonly edges: readonly WorkflowEdge[]
}

// ─── Instance ─────────────────────────────────────────────────────────────

export type WorkflowInstanceStatus = 'running' | 'awaiting' | 'completed' | 'failed'

export interface WorkflowHistoryEntry {
  readonly nodeId: string
  /** ISO timestamp this node was entered. */
  readonly enteredAt: string
  /** ISO timestamp this node was exited; absent while current. */
  readonly exitedAt?: string
  /** Signal emitted when exiting — drives edge selection. */
  readonly signal?: EdgeGuard
  readonly actor?: string
  readonly reason?: string
}

export interface WorkflowInstance {
  readonly workflowId: string
  readonly workflowVersion: number
  readonly status: WorkflowInstanceStatus
  /** The node that is currently active (awaiting approval / running). */
  readonly currentNodeId: string | null
  readonly history: readonly WorkflowHistoryEntry[]
  /**
   * Outcome populated when `status === 'completed'`. Mirrors the
   * terminal node's `outcome` field so hosts don't have to re-walk
   * the history to learn the result.
   */
  readonly outcome?: WorkflowOutcome
}

// ─── Layout (Phase 2 visual builder — side-car, NOT part of Workflow) ─────

/**
 * Cosmetic node coordinates for the visual builder. Stored alongside a
 * `Workflow` rather than on its nodes so the runtime contract (schema +
 * interpreter) stays free of UI-only data. The interpreter ignores this
 * entirely; `advance()`, `findNode`, and `resolveNextEdge` never read it.
 */
export interface WorkflowLayout {
  readonly workflowId: string
  readonly workflowVersion: number
  readonly positions: Readonly<Record<string, { readonly x: number; readonly y: number }>>
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Look up a node by id. Returns undefined when missing. */
export function findNode(
  workflow: Workflow,
  nodeId: string,
): WorkflowNode | undefined {
  return workflow.nodes.find(n => n.id === nodeId)
}

/**
 * Return the next node id for a given source + emitted signal.
 * Priority: exact `when` match > `default` edge > undefined.
 */
export function resolveNextEdge(
  workflow: Workflow,
  fromNodeId: string,
  signal: EdgeGuard,
): WorkflowEdge | undefined {
  let defaultEdge: WorkflowEdge | undefined
  for (const edge of workflow.edges) {
    if (edge.from !== fromNodeId) continue
    if (edge.when === signal) return edge
    if (edge.when === undefined || edge.when === 'default') {
      defaultEdge = edge
    }
  }
  return defaultEdge
}

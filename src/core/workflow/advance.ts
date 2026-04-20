/**
 * Workflow interpreter — issue #219, Phase 1.
 *
 * Pure function that advances a `WorkflowInstance` by one actor action.
 * The host persists the returned instance; every state change is
 * reflected as a structured event in `emit` so downstream adapters
 * (lifecycle bus, audit drawer, notification channels) can react.
 *
 * Auto-advance behavior: after every actor action, the interpreter
 * walks through `condition` and `notify` nodes until it lands on an
 * `approval` (→ `awaiting`) or `terminal` (→ `completed`). This keeps
 * the actor-facing state machine simple: exactly one "stop" node is
 * active between actions.
 */
import { evaluateBool, ExpressionError } from './expression'
import {
  findNode,
  resolveNextEdge,
  type EdgeGuard,
  type Workflow,
  type WorkflowHistoryEntry,
  type WorkflowInstance,
  type WorkflowOutcome,
} from './workflowSchema'

// ─── Actions ──────────────────────────────────────────────────────────────

export type WorkflowAction =
  | { readonly type: 'start' }
  | { readonly type: 'approve'; readonly actor?: string; readonly reason?: string }
  | { readonly type: 'deny';    readonly actor?: string; readonly reason: string }
  | { readonly type: 'cancel';  readonly actor?: string; readonly reason?: string }

// ─── Emitted events ───────────────────────────────────────────────────────

export type WorkflowEmitEvent =
  | { readonly type: 'node_entered'; readonly nodeId: string; readonly at: string }
  | { readonly type: 'node_exited';  readonly nodeId: string; readonly at: string; readonly signal: EdgeGuard }
  | { readonly type: 'notify';       readonly nodeId: string; readonly channel: string; readonly template?: string; readonly at: string }
  | { readonly type: 'workflow_completed'; readonly outcome: WorkflowOutcome; readonly at: string }
  | { readonly type: 'workflow_failed'; readonly nodeId: string; readonly reason: string; readonly at: string }

// ─── Inputs / outputs ─────────────────────────────────────────────────────

export interface AdvanceInput {
  readonly workflow: Workflow
  readonly instance: WorkflowInstance | null
  readonly action: WorkflowAction
  /** ISO timestamp; defaults to `new Date().toISOString()`. */
  readonly at?: string
  /** Variables available to `condition` expressions. */
  readonly variables?: Readonly<Record<string, unknown>>
}

export type AdvanceResult =
  | { readonly ok: true;  readonly instance: WorkflowInstance; readonly emit: readonly WorkflowEmitEvent[] }
  | { readonly ok: false; readonly error: string; readonly instance: WorkflowInstance; readonly emit: readonly WorkflowEmitEvent[] }

// ─── Internal mutable state during a single advance call ─────────────────

interface RunState {
  history: WorkflowHistoryEntry[]
  emit: WorkflowEmitEvent[]
  currentNodeId: string | null
  status: WorkflowInstance['status']
  outcome?: WorkflowOutcome
}

// ─── Public API ───────────────────────────────────────────────────────────

export function advance(input: AdvanceInput): AdvanceResult {
  const at = input.at ?? new Date().toISOString()
  const vars = input.variables ?? {}
  const { workflow, action } = input

  // Seed state from incoming instance (or bootstrap a fresh one).
  const base: WorkflowInstance = input.instance ?? freshInstance(workflow)
  const state: RunState = {
    history: [...base.history],
    emit: [],
    currentNodeId: base.currentNodeId,
    status: base.status,
    outcome: base.outcome,
  }

  // Early exits — already terminal / failed.
  if (state.status === 'completed' || state.status === 'failed') {
    return finalize(base, state,
      `Instance already ${state.status}; no action taken.`)
  }

  try {
    switch (action.type) {
      case 'start':
        if (state.history.length > 0) {
          return finalize(base, state, 'start action on an already-running instance')
        }
        enter(workflow, state, workflow.startNodeId, at)
        autoAdvance(workflow, state, vars, at)
        break

      case 'approve':
      case 'deny': {
        const reason = action.type === 'deny' ? action.reason : undefined
        const node = state.currentNodeId ? findNode(workflow, state.currentNodeId) : undefined
        if (!node || node.type !== 'approval' || state.status !== 'awaiting') {
          return finalize(base, state,
            `${action.type} requires an awaiting approval node; current="${state.currentNodeId}" status=${state.status}`)
        }
        const signal: EdgeGuard = action.type === 'approve' ? 'approved' : 'denied'
        exitCurrent(state, signal, at, { actor: action.actor, reason })
        if (!followEdge(workflow, state, signal, at)) break
        autoAdvance(workflow, state, vars, at)
        break
      }

      case 'cancel':
        if (state.currentNodeId) {
          exitCurrent(state, 'default', at, { actor: action.actor, reason: action.reason })
        }
        state.status = 'completed'
        state.currentNodeId = null
        state.outcome = 'cancelled'
        state.emit.push({ type: 'workflow_completed', outcome: 'cancelled', at })
        break
    }
  } catch (err) {
    const reason = err instanceof ExpressionError ? err.message : String(err)
    const nodeId = state.currentNodeId ?? '<none>'
    state.status = 'failed'
    state.emit.push({ type: 'workflow_failed', nodeId, reason, at })
    return {
      ok: false,
      error: reason,
      instance: assemble(base, state),
      emit: state.emit,
    }
  }

  return { ok: true, instance: assemble(base, state), emit: state.emit }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function freshInstance(workflow: Workflow): WorkflowInstance {
  return {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    status: 'running',
    currentNodeId: null,
    history: [],
  }
}

function enter(
  workflow: Workflow,
  state: RunState,
  nodeId: string,
  at: string,
): void {
  const node = findNode(workflow, nodeId)
  if (!node) throw new Error(`Unknown node "${nodeId}"`)
  state.currentNodeId = nodeId
  state.history.push({ nodeId, enteredAt: at })
  state.emit.push({ type: 'node_entered', nodeId, at })
  state.status = node.type === 'approval' ? 'awaiting' : 'running'
}

function exitCurrent(
  state: RunState,
  signal: EdgeGuard,
  at: string,
  meta?: { actor?: string; reason?: string },
): void {
  const idx = findLastUnclosedHistoryIndex(state.history)
  if (idx < 0) return
  const entry = state.history[idx]
  state.history[idx] = {
    ...entry,
    exitedAt: at,
    signal,
    ...(meta?.actor  !== undefined ? { actor:  meta.actor  } : {}),
    ...(meta?.reason !== undefined ? { reason: meta.reason } : {}),
  }
  state.emit.push({ type: 'node_exited', nodeId: entry.nodeId, at, signal })
}

function findLastUnclosedHistoryIndex(h: readonly WorkflowHistoryEntry[]): number {
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].exitedAt === undefined) return i
  }
  return -1
}

/** Move to the node targeted by the edge matching `signal`. */
function followEdge(
  workflow: Workflow,
  state: RunState,
  signal: EdgeGuard,
  at: string,
): boolean {
  const edge = resolveNextEdge(workflow, state.currentNodeId!, signal)
  if (!edge) {
    state.status = 'failed'
    state.emit.push({
      type: 'workflow_failed',
      nodeId: state.currentNodeId!,
      reason: `No edge from "${state.currentNodeId}" for signal "${signal}"`,
      at,
    })
    return false
  }
  enter(workflow, state, edge.to, at)
  return true
}

/**
 * Walk condition / notify nodes until the current node is an approval
 * or terminal. Bounded by the workflow's node count to prevent cycles.
 */
function autoAdvance(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  at: string,
): void {
  const limit = workflow.nodes.length + 1
  for (let step = 0; step < limit; step++) {
    if (state.status !== 'running') return
    const node = state.currentNodeId ? findNode(workflow, state.currentNodeId) : undefined
    if (!node) return

    if (node.type === 'approval') {
      state.status = 'awaiting'
      return
    }

    if (node.type === 'terminal') {
      exitCurrent(state, 'default', at)
      state.status = 'completed'
      state.outcome = node.outcome
      state.currentNodeId = null
      state.emit.push({ type: 'workflow_completed', outcome: node.outcome, at })
      return
    }

    if (node.type === 'condition') {
      const truthy = evaluateBool(node.expr, vars)
      const signal: EdgeGuard = truthy ? 'true' : 'false'
      exitCurrent(state, signal, at)
      if (!followEdge(workflow, state, signal, at)) return
      continue
    }

    if (node.type === 'notify') {
      state.emit.push({
        type: 'notify',
        nodeId: node.id,
        channel: node.channel,
        ...(node.template !== undefined ? { template: node.template } : {}),
        at,
      })
      exitCurrent(state, 'default', at)
      if (!followEdge(workflow, state, 'default', at)) return
      continue
    }
  }

  state.status = 'failed'
  state.emit.push({
    type: 'workflow_failed',
    nodeId: state.currentNodeId ?? '<none>',
    reason: 'Auto-advance step limit exceeded — check for cycles',
    at,
  })
}

function assemble(base: WorkflowInstance, state: RunState): WorkflowInstance {
  return {
    workflowId: base.workflowId,
    workflowVersion: base.workflowVersion,
    status: state.status,
    currentNodeId: state.currentNodeId,
    history: state.history,
    ...(state.outcome !== undefined ? { outcome: state.outcome } : {}),
  }
}

function finalize(
  base: WorkflowInstance,
  state: RunState,
  error: string,
): AdvanceResult {
  return { ok: false, error, instance: assemble(base, state), emit: state.emit }
}

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
import { interpolateTemplate, TemplateError } from './templateInterpolate'
import {
  findNode,
  resolveNextEdge,
  type EdgeGuard,
  type Workflow,
  type WorkflowApprovalNode,
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
  | { readonly type: 'timeout' }

// ─── Emitted events ───────────────────────────────────────────────────────

export type WorkflowEmitEvent =
  | { readonly type: 'node_entered'; readonly nodeId: string; readonly at: string }
  | { readonly type: 'node_exited';  readonly nodeId: string; readonly at: string; readonly signal: EdgeGuard }
  | {
      readonly type: 'notify';
      readonly nodeId: string;
      readonly channel: string;
      readonly at: string;
      /** Authored template string (pre-interpolation). */
      readonly template?: string;
      /** Rendered message after `{{ }}` interpolation against `variables`. */
      readonly message?: string;
    }
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

      case 'timeout': {
        const node = state.currentNodeId ? findNode(workflow, state.currentNodeId) : undefined
        if (!node || node.type !== 'approval' || state.status !== 'awaiting') {
          return finalize(base, state,
            `timeout requires an awaiting approval node; current="${state.currentNodeId}" status=${state.status}`)
        }
        const behavior = node.onTimeout ?? 'escalate'
        // `escalate` walks a dedicated `timeout` edge; `auto-approve` /
        // `auto-deny` reuse the standard approved/denied edges so the
        // workflow author doesn't have to double-wire.
        const signal: EdgeGuard =
          behavior === 'escalate'    ? 'timeout'
          : behavior === 'auto-approve' ? 'approved'
          : 'denied'
        exitCurrent(state, signal, at, { reason: `SLA timeout (${behavior})` })
        if (!followEdge(workflow, state, signal, at)) break
        autoAdvance(workflow, state, vars, at)
        break
      }
    }
  } catch (err) {
    const reason = err instanceof ExpressionError || err instanceof TemplateError
      ? err.message
      : String(err)
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
      const message = node.template !== undefined
        ? interpolateTemplate(node.template, vars)
        : undefined
      state.emit.push({
        type: 'notify',
        nodeId: node.id,
        channel: node.channel,
        at,
        ...(node.template !== undefined ? { template: node.template } : {}),
        ...(message !== undefined ? { message } : {}),
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

// ─── Tick (SLA timers — issue #222) ──────────────────────────────────────

/**
 * Pure check: has the currently-awaited approval step exceeded its SLA?
 *
 * Returns an `AdvanceResult` (the product of firing a `{ type: 'timeout' }`
 * action) when the active approval node has `slaMinutes` set AND the
 * elapsed time since `history[-1].enteredAt` is at least that many
 * minutes. Returns `null` in every other case — not awaiting, no
 * `slaMinutes`, no `enteredAt`, or the SLA hasn't elapsed yet.
 *
 * `variables` are forwarded to `advance()` so condition nodes that the
 * timeout edge auto-advances into can resolve runtime data (e.g. cost-
 * based escalation). Callers driving tick from a scheduler should pass
 * whatever variables they use for normal actor-driven actions.
 *
 * Pure + side-effect-free: the host drives it with a scheduler
 * (`setInterval`, cron, server-side tick). Two consecutive calls with
 * the same `nowIso` produce the same result.
 */
export function tick(
  workflow: Workflow,
  instance: WorkflowInstance,
  nowIso: string,
  variables?: Readonly<Record<string, unknown>>,
): AdvanceResult | null {
  const node = activeApprovalNode(workflow, instance)
  if (!node) return null
  if (typeof node.slaMinutes !== 'number' || node.slaMinutes <= 0) return null

  const enteredAt = latestEnteredAt(instance, node.id)
  if (!enteredAt) return null

  const enteredMs = Date.parse(enteredAt)
  const nowMs = Date.parse(nowIso)
  if (!Number.isFinite(enteredMs) || !Number.isFinite(nowMs)) return null
  const elapsedMs = nowMs - enteredMs
  if (elapsedMs < node.slaMinutes * 60_000) return null

  return advance({
    workflow,
    instance,
    action: { type: 'timeout' },
    at: nowIso,
    ...(variables !== undefined ? { variables } : {}),
  })
}

function activeApprovalNode(
  workflow: Workflow,
  instance: WorkflowInstance,
): WorkflowApprovalNode | null {
  if (instance.status !== 'awaiting' || !instance.currentNodeId) return null
  const node = findNode(workflow, instance.currentNodeId)
  if (!node || node.type !== 'approval') return null
  return node
}

function latestEnteredAt(
  instance: WorkflowInstance,
  nodeId: string,
): string | null {
  for (let i = instance.history.length - 1; i >= 0; i--) {
    const entry = instance.history[i]
    if (entry.nodeId !== nodeId) continue
    if (entry.exitedAt !== undefined) continue
    return entry.enteredAt
  }
  return null
}

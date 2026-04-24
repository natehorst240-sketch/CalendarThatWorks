/**
 * Workflow interpreter — issue #219, Phases 1–4.
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
 *
 * Parallel scopes (Phase 4, issue #223): entering a `parallel` node
 * pushes a frame onto `instance.parallelFrames` and walks each branch
 * forward until it hits an approval (stored as the branch's
 * `activeNodeId`) or its paired `join`. Approve/deny/timeout actions
 * carry `targetNodeId` to disambiguate which branch they advance. The
 * paired join releases once the frame's `mode` quorum is satisfied —
 * which may fail-fast if the remaining branches can no longer reach
 * the required count (e.g. `requireAll` with one denial).
 */
import { evaluateBool, ExpressionError } from './expression'
import { interpolateTemplate, TemplateError } from './templateInterpolate'
import {
  findNode,
  resolveNextEdge,
  type EdgeGuard,
  type ParallelBranchState,
  type ParallelMode,
  type Workflow,
  type WorkflowApprovalNode,
  type WorkflowHistoryEntry,
  type WorkflowInstance,
  type WorkflowOutcome,
  type WorkflowParallelFrame,
  type WorkflowParallelNode,
} from './workflowSchema'

// ─── Actions ──────────────────────────────────────────────────────────────

/**
 * Actor-supplied input to `advance()`. Approval variants accept an
 * optional `targetNodeId` that identifies which branch's approval the
 * action applies to while a parallel scope is in flight. When the
 * workflow is linear (no parallel frame) `targetNodeId` is ignored —
 * the action targets the single `currentNodeId`.
 */
export type WorkflowAction =
  | { readonly type: 'start' }
  | { readonly type: 'approve'; readonly actor?: string; readonly reason?: string; readonly targetNodeId?: string }
  | { readonly type: 'deny';    readonly actor?: string; readonly reason: string;  readonly targetNodeId?: string }
  | { readonly type: 'cancel';  readonly actor?: string; readonly reason?: string }
  | { readonly type: 'timeout'; readonly targetNodeId?: string }

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

interface MutableBranchState {
  readonly branchEntryId: string
  activeNodeId: string | null
  completedAt?: string
  completedSignal?: EdgeGuard
}

interface MutableParallelFrame {
  readonly parallelId: string
  readonly joinId: string
  readonly mode: ParallelMode
  readonly n?: number
  readonly branches: MutableBranchState[]
}

interface RunState {
  history: WorkflowHistoryEntry[]
  emit: WorkflowEmitEvent[]
  currentNodeId: string | null
  status: WorkflowInstance['status']
  outcome?: WorkflowOutcome | undefined
  parallelFrames: MutableParallelFrame[]
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
    parallelFrames: (base.parallelFrames ?? []).map(cloneFrame),
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
        const signal: EdgeGuard = action.type === 'approve' ? 'approved' : 'denied'
        if (state.parallelFrames.length > 0) {
          const err = applyBranchAction(
            workflow, state, vars, signal, at,
            { actor: action.actor, reason, targetNodeId: action.targetNodeId },
          )
          if (err) return finalize(base, state, err)
          break
        }
        const node = state.currentNodeId ? findNode(workflow, state.currentNodeId) : undefined
        if (!node || node.type !== 'approval' || state.status !== 'awaiting') {
          return finalize(base, state,
            `${action.type} requires an awaiting approval node; current="${state.currentNodeId}" status=${state.status}`)
        }
        exitCurrent(state, signal, at, { actor: action.actor, reason })
        if (!followEdge(workflow, state, signal, at)) break
        autoAdvance(workflow, state, vars, at)
        break
      }

      case 'cancel':
        if (state.currentNodeId) {
          exitCurrent(state, 'default', at, { actor: action.actor, reason: action.reason })
        }
        // Close any still-open branch history entries so the audit trail
        // doesn't leave dangling "entered without exit" rows.
        for (const frame of state.parallelFrames) {
          for (const branch of frame.branches) {
            if (branch.activeNodeId) {
              closeHistoryFor(state, branch.activeNodeId, 'default', at,
                { actor: action.actor, reason: action.reason })
              branch.activeNodeId = null
            }
          }
        }
        state.parallelFrames = []
        state.status = 'completed'
        state.currentNodeId = null
        state.outcome = 'cancelled'
        state.emit.push({ type: 'workflow_completed', outcome: 'cancelled', at })
        break

      case 'timeout': {
        if (state.parallelFrames.length > 0) {
          const err = applyBranchTimeout(workflow, state, vars, at, action.targetNodeId)
          if (err) return finalize(base, state, err)
          break
        }
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

/**
 * Close the latest open history entry matching `nodeId`. Used when a
 * branch exits an approval out-of-band (i.e. while `currentNodeId` is
 * a different branch's node) — `exitCurrent` assumes the latest
 * unclosed row is the one to close, which is wrong under parallel
 * scope. Iterates from the tail for O(n) worst case, which matches the
 * linear interpreter's cost.
 */
function closeHistoryFor(
  state: RunState,
  nodeId: string,
  signal: EdgeGuard,
  at: string,
  meta?: { actor?: string | undefined; reason?: string | undefined },
): void {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const entry = state.history[i]
    if (entry === undefined) continue
    if (entry.nodeId !== nodeId) continue
    if (entry.exitedAt !== undefined) continue
    state.history[i] = {
      ...entry,
      exitedAt: at,
      signal,
      ...(meta?.actor  !== undefined ? { actor:  meta.actor  } : {}),
      ...(meta?.reason !== undefined ? { reason: meta.reason } : {}),
    }
    state.emit.push({ type: 'node_exited', nodeId, at, signal })
    return
  }
}

function exitCurrent(
  state: RunState,
  signal: EdgeGuard,
  at: string,
  meta?: { actor?: string | undefined; reason?: string | undefined },
): void {
  const idx = findLastUnclosedHistoryIndex(state.history)
  if (idx < 0) return
  const entry = state.history[idx]
  if (entry === undefined) return
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
    if (h[i]?.exitedAt === undefined) return i
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
 *
 * When the cursor lands on a `parallel` node, fans out into the frame
 * and leaves the branches in their "await an approval or reach the
 * paired join" state — after which the linear auto-advance returns;
 * further progress comes from actor actions on branch approvals.
 */
function autoAdvance(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  at: string,
): void {
  const limit = workflow.nodes.length * 2 + 4
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
      emitNotify(state, node, vars, at)
      exitCurrent(state, 'default', at)
      if (!followEdge(workflow, state, 'default', at)) return
      continue
    }

    if (node.type === 'parallel') {
      enterParallel(workflow, state, vars, node, at)
      // `enterParallel` either released the paired join (and advanced
      // past it — cursor now resumes after the join) or left us
      // awaiting branches (status='awaiting', currentNodeId=null). In
      // either case, fall through the loop and let the next iteration
      // pick up the new cursor or return.
      if (state.status !== 'running') return
      continue
    }

    if (node.type === 'join') {
      // A `join` should only ever be entered by the parallel interpreter
      // after quorum is satisfied. Reaching one via ordinary auto-advance
      // means the workflow is structurally broken (e.g. an edge pointing
      // at the join outside a parallel scope). Fail loudly instead of
      // quietly falling through.
      state.status = 'failed'
      state.emit.push({
        type: 'workflow_failed',
        nodeId: node.id,
        reason: `Join "${node.id}" entered outside a parallel scope`,
        at,
      })
      return
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

function emitNotify(
  state: RunState,
  node: { id: string; channel: string; template?: string | undefined },
  vars: Readonly<Record<string, unknown>>,
  at: string,
): void {
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
}

// ─── Parallel / join (Phase 4, issue #223) ────────────────────────────────

/**
 * Enter a `parallel` node: push a frame and walk each branch forward
 * until it either awaits an approval or reaches the paired join. If
 * every branch short-circuits to the join in one pass and quorum is
 * satisfied, release the join immediately so the caller's autoAdvance
 * loop picks up the post-join cursor.
 */
function enterParallel(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  node: WorkflowParallelNode,
  at: string,
): void {
  const join = findPairedJoin(workflow, node.id)
  if (!join) {
    state.status = 'failed'
    state.emit.push({
      type: 'workflow_failed',
      nodeId: node.id,
      reason: `Parallel "${node.id}" has no paired join`,
      at,
    })
    return
  }

  // Close the parallel node's own history entry. The fan-out is its
  // exit event — signal 'default' is neutral (no branch has completed
  // anything yet; this just means the parallel finished initializing).
  exitCurrent(state, 'default', at)

  const frame: MutableParallelFrame = {
    parallelId: node.id,
    joinId: join.id,
    mode: node.mode,
    ...(node.n !== undefined ? { n: node.n } : {}),
    branches: node.branches.map<MutableBranchState>(entryId => ({
      branchEntryId: entryId,
      activeNodeId: null,
    })),
  }
  state.parallelFrames.push(frame)
  // currentNodeId is cleared for the duration of the parallel scope —
  // the "active node" concept is per-branch from here on.
  state.currentNodeId = null

  // Walk each branch to its first pause point.
  for (let i = 0; i < frame.branches.length; i++) {
    initBranch(workflow, state, vars, frame, i, at)
    if (state.status === 'failed') return
  }

  // If every branch short-circuited straight to the join (no approval
  // in any path) AND quorum is satisfied, release the join so the
  // caller's autoAdvance can continue past it.
  settleFrame(workflow, state, vars, at)
}

function findPairedJoin(
  workflow: Workflow,
  parallelId: string,
): { readonly id: string } | undefined {
  for (const n of workflow.nodes) {
    if (n.type === 'join' && n.pairedWith === parallelId) return n
  }
  return undefined
}

/**
 * Initialize a single branch: enter the branch's entry node, then walk
 * forward until we pause (awaiting an approval) or hit the paired
 * join. A degenerate branch whose entry IS the paired join completes
 * immediately without pushing a history row (validator forbids this
 * shape; the interpreter tolerates it defensively).
 */
function initBranch(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  frame: MutableParallelFrame,
  branchIdx: number,
  at: string,
): void {
  const branch = frame.branches[branchIdx]
  if (branch === undefined) return
  if (branch.branchEntryId === frame.joinId) {
    branch.activeNodeId = null
    branch.completedAt = at
    branch.completedSignal = 'default'
    return
  }
  enter(workflow, state, branch.branchEntryId, at)
  walkBranchForward(workflow, state, vars, frame, branchIdx, at)
}

/**
 * Drive `state.currentNodeId` forward through condition / notify nodes
 * until it lands on an approval (→ pause branch) or the next outgoing
 * edge would land on the frame's paired join (→ mark branch complete
 * without entering the join). Writes the pause/complete state into the
 * branch record instead of `state.currentNodeId`.
 *
 * `lastSignal` is the signal emitted by the branch's final non-join
 * node; it's copied into `completedSignal` as the branch's quorum vote.
 */
function walkBranchForward(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  frame: MutableParallelFrame,
  branchIdx: number,
  at: string,
): void {
  const branch = frame.branches[branchIdx]
  if (branch === undefined) return
  const limit = workflow.nodes.length * 2 + 4
  let lastSignal: EdgeGuard = 'default'

  for (let step = 0; step < limit; step++) {
    const nodeId = state.currentNodeId
    if (!nodeId) return
    const node = findNode(workflow, nodeId)
    if (!node) return

    if (node.type === 'approval') {
      branch.activeNodeId = nodeId
      state.status = 'awaiting'
      state.currentNodeId = null
      return
    }

    if (node.type === 'terminal') {
      // A terminal inside a parallel branch is a structural bug — the
      // branch can't rejoin. Validator forbids this; the interpreter
      // fails loudly instead of silently completing the workflow.
      failWorkflow(state, node.id,
        `Terminal "${node.id}" reached inside parallel branch "${branch.branchEntryId}"`,
        at)
      return
    }

    if (node.type === 'parallel' || node.type === 'join') {
      // Nested parallel scopes are out of scope for Phase 4 — a branch
      // that hits another parallel (or a foreign join) is treated as a
      // structural error.
      failWorkflow(state, nodeId,
        `Unsupported ${node.type} node "${nodeId}" inside a parallel branch`, at)
      return
    }

    if (node.type === 'condition') {
      const truthy = evaluateBool(node.expr, vars)
      lastSignal = truthy ? 'true' : 'false'
      closeHistoryFor(state, nodeId, lastSignal, at)
      if (!stepBranchOutOf(workflow, state, frame, branch, nodeId, lastSignal, at)) return
      if (state.currentNodeId === null) return
      continue
    }

    if (node.type === 'notify') {
      emitNotify(state, node, vars, at)
      lastSignal = 'default'
      closeHistoryFor(state, nodeId, lastSignal, at)
      if (!stepBranchOutOf(workflow, state, frame, branch, nodeId, lastSignal, at)) return
      if (state.currentNodeId === null) return
      continue
    }
  }

  failWorkflow(state, branch.activeNodeId ?? branch.branchEntryId,
    `Branch "${branch.branchEntryId}" exceeded step limit — check for cycles`, at)
}

/**
 * Step out of `fromNodeId` (already exited) toward the edge matching
 * `signal`. If the target IS the paired join, mark the branch complete
 * without emitting a join `node_entered` — the join is entered once
 * canonically by `releaseJoin`. Returns `false` only on a routing
 * failure (state already marked failed).
 */
function stepBranchOutOf(
  workflow: Workflow,
  state: RunState,
  frame: MutableParallelFrame,
  branch: MutableBranchState,
  fromNodeId: string,
  signal: EdgeGuard,
  at: string,
): boolean {
  const edge = resolveNextEdge(workflow, fromNodeId, signal)
  if (!edge) {
    failWorkflow(state, fromNodeId,
      `No edge from "${fromNodeId}" for signal "${signal}"`, at)
    return false
  }
  if (edge.to === frame.joinId) {
    branch.activeNodeId = null
    branch.completedAt = at
    branch.completedSignal = signal
    state.currentNodeId = null
    return true
  }
  enter(workflow, state, edge.to, at)
  return true
}

function failWorkflow(
  state: RunState,
  nodeId: string,
  reason: string,
  at: string,
): void {
  state.status = 'failed'
  state.emit.push({ type: 'workflow_failed', nodeId, reason, at })
}

/**
 * Find the (frameIdx, branchIdx) for a parallel-scope action. When
 * `targetNodeId` is omitted and exactly one branch in the innermost
 * frame is pending, default to that branch — otherwise require
 * disambiguation.
 *
 * Nested frames are searched outermost-first, but since we don't
 * currently support nested parallel scopes, in practice there's always
 * exactly one frame.
 */
function locateBranch(
  state: RunState,
  targetNodeId: string | undefined,
): { frameIdx: number; branchIdx: number } | { error: string } {
  if (targetNodeId !== undefined) {
    for (let f = 0; f < state.parallelFrames.length; f++) {
      const frame = state.parallelFrames[f]
      if (frame === undefined) continue
      for (let b = 0; b < frame.branches.length; b++) {
        if (frame.branches[b]?.activeNodeId === targetNodeId) {
          return { frameIdx: f, branchIdx: b }
        }
      }
    }
    return { error: `no pending branch awaiting node "${targetNodeId}"` }
  }

  const pending: Array<{ frameIdx: number; branchIdx: number }> = []
  for (let f = 0; f < state.parallelFrames.length; f++) {
    const frame = state.parallelFrames[f]
    if (frame === undefined) continue
    for (let b = 0; b < frame.branches.length; b++) {
      if (frame.branches[b]?.activeNodeId) pending.push({ frameIdx: f, branchIdx: b })
    }
  }
  if (pending.length === 1) {
    const p = pending[0]
    if (p !== undefined) return p
  }
  if (pending.length === 0) return { error: 'no branch is awaiting an action' }
  return { error: `${pending.length} branches awaiting — supply targetNodeId` }
}

function applyBranchAction(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  signal: EdgeGuard,
  at: string,
  meta: { actor?: string | undefined; reason?: string | undefined; targetNodeId?: string | undefined },
): string | null {
  const located = locateBranch(state, meta.targetNodeId)
  if ('error' in located) return located.error

  const frame = state.parallelFrames[located.frameIdx]
  if (frame === undefined) return 'internal: frame index out of range'
  const branch = frame.branches[located.branchIdx]
  if (branch === undefined) return 'internal: branch index out of range'
  const approvalId = branch.activeNodeId!

  // Close the approval's open history entry with the branch's signal
  // (we can't use `exitCurrent` — currentNodeId is null in parallel).
  closeHistoryFor(state, approvalId, signal, at,
    { actor: meta.actor, reason: meta.reason })
  branch.activeNodeId = null

  if (!stepBranchOutOf(workflow, state, frame, branch, approvalId, signal, at)) {
    return null
  }
  if (state.currentNodeId !== null) {
    walkBranchForward(workflow, state, vars, frame, located.branchIdx, at)
    if (state.status === 'failed') return null
  }

  settleAndResume(workflow, state, vars, at)
  return null
}

function applyBranchTimeout(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  at: string,
  targetNodeId: string | undefined,
): string | null {
  const located = locateBranch(state, targetNodeId)
  if ('error' in located) return located.error

  const frame = state.parallelFrames[located.frameIdx]
  if (frame === undefined) return 'internal: frame index out of range'
  const branch = frame.branches[located.branchIdx]
  if (branch === undefined) return 'internal: branch index out of range'
  const approvalId = branch.activeNodeId!
  const approval = findNode(workflow, approvalId)
  if (!approval || approval.type !== 'approval') {
    return `branch target "${approvalId}" is not an approval node`
  }
  const behavior = approval.onTimeout ?? 'escalate'
  const signal: EdgeGuard =
    behavior === 'escalate'      ? 'timeout'
    : behavior === 'auto-approve' ? 'approved'
    : 'denied'
  closeHistoryFor(state, approvalId, signal, at,
    { reason: `SLA timeout (${behavior})` })
  branch.activeNodeId = null

  if (!stepBranchOutOf(workflow, state, frame, branch, approvalId, signal, at)) {
    return null
  }
  if (state.currentNodeId !== null) {
    walkBranchForward(workflow, state, vars, frame, located.branchIdx, at)
    if (state.status === 'failed') return null
  }

  settleAndResume(workflow, state, vars, at)
  return null
}

/**
 * After a branch transitions, settle the innermost frame (maybe
 * release the join) and, if a join was released, resume linear
 * auto-advance from the post-join cursor. `settleFrame` alone leaves
 * `status='running'` with a fresh cursor when it pops a frame — we
 * need to keep walking to reach the next approval / terminal.
 */
function settleAndResume(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  at: string,
): void {
  settleFrame(workflow, state, vars, at)
  if (state.status === 'running' && state.currentNodeId !== null) {
    autoAdvance(workflow, state, vars, at)
  }
}

/**
 * After each branch transition, check if the innermost frame can
 * release its join. If quorum is satisfied, pop + release. If quorum
 * is now unreachable (e.g. `requireAll` saw a denial), fail the
 * workflow. Otherwise the branch stays awaiting.
 *
 * Loops because releasing a join may land the cursor on another
 * parallel (nested case, currently unsupported but defensive) or on
 * condition/notify/approval/terminal nodes — the outer autoAdvance
 * picks up from there.
 */
function settleFrame(
  workflow: Workflow,
  state: RunState,
  vars: Readonly<Record<string, unknown>>,
  at: string,
): void {
  while (state.parallelFrames.length > 0 && state.status !== 'failed') {
    const frame = state.parallelFrames[state.parallelFrames.length - 1]
    if (frame === undefined) return
    const verdict = checkQuorum(frame)
    if (verdict === 'pending') {
      state.status = 'awaiting'
      return
    }
    if (verdict === 'failed') {
      state.status = 'failed'
      state.emit.push({
        type: 'workflow_failed',
        nodeId: frame.parallelId,
        reason: `Parallel "${frame.parallelId}" quorum (${frame.mode}) unreachable`,
        at,
      })
      return
    }
    // Satisfied — release the paired join.
    state.parallelFrames.pop()
    releaseJoin(workflow, state, vars, frame, at)
    // After releasing, `currentNodeId` now points past the join. Let
    // autoAdvance continue in the caller; settleFrame is invoked again
    // if that auto-advance itself lands on another parallel.
    return
  }
}

type QuorumVerdict = 'satisfied' | 'failed' | 'pending'

function checkQuorum(frame: MutableParallelFrame): QuorumVerdict {
  const total = frame.branches.length
  let positive = 0
  let negative = 0
  let pending = 0
  for (const b of frame.branches) {
    if (b.completedSignal === undefined) { pending++; continue }
    if (isPositiveSignal(b.completedSignal)) positive++
    else negative++
  }

  switch (frame.mode) {
    case 'requireAll':
      if (negative > 0) return 'failed'
      if (positive === total) return 'satisfied'
      return 'pending'
    case 'requireAny':
      if (positive > 0) return 'satisfied'
      if (negative === total) return 'failed'
      return 'pending'
    case 'requireN': {
      const required = Math.max(1, Math.min(total, frame.n ?? 1))
      if (positive >= required) return 'satisfied'
      if (positive + pending < required) return 'failed'
      return 'pending'
    }
  }
}

function isPositiveSignal(signal: EdgeGuard): boolean {
  // `approved` / `true` / `default` / `branch-completed` are treated
  // as "this branch succeeded". `denied` / `timeout` / `false` are
  // negative. The distinction matters for `requireN` + `requireAll`
  // where one denial can doom the whole frame.
  return signal === 'approved'
    || signal === 'true'
    || signal === 'default'
    || signal === 'branch-completed'
}

/**
 * Release the paired join: record one `node_entered`/`node_exited`
 * pair for the join itself, then move `state.currentNodeId` to the
 * node past the join via its default edge. Branches that reached the
 * join earlier set `completedSignal` on themselves but did NOT emit a
 * `node_entered` for the join — this is the only place we do.
 */
function releaseJoin(
  workflow: Workflow,
  state: RunState,
  _vars: Readonly<Record<string, unknown>>,
  frame: MutableParallelFrame,
  at: string,
): void {
  enter(workflow, state, frame.joinId, at)
  exitCurrent(state, 'default', at)
  const next = resolveNextEdge(workflow, frame.joinId, 'default')
  if (!next) {
    failWorkflow(state, frame.joinId,
      `No edge from join "${frame.joinId}" (need a default edge)`, at)
    return
  }
  enter(workflow, state, next.to, at)
  state.status = 'running'
}

function assemble(base: WorkflowInstance, state: RunState): WorkflowInstance {
  return {
    workflowId: base.workflowId,
    workflowVersion: base.workflowVersion,
    status: state.status,
    currentNodeId: state.currentNodeId,
    history: state.history,
    ...(state.outcome !== undefined ? { outcome: state.outcome } : {}),
    ...(state.parallelFrames.length > 0
      ? { parallelFrames: state.parallelFrames.map(freezeFrame) }
      : {}),
  }
}

function cloneFrame(frame: WorkflowParallelFrame): MutableParallelFrame {
  return {
    parallelId: frame.parallelId,
    joinId: frame.joinId,
    mode: frame.mode,
    ...(frame.n !== undefined ? { n: frame.n } : {}),
    branches: frame.branches.map(b => ({
      branchEntryId: b.branchEntryId,
      activeNodeId: b.activeNodeId,
      ...(b.completedAt !== undefined ? { completedAt: b.completedAt } : {}),
      ...(b.completedSignal !== undefined ? { completedSignal: b.completedSignal } : {}),
    })),
  }
}

function freezeFrame(frame: MutableParallelFrame): WorkflowParallelFrame {
  return {
    parallelId: frame.parallelId,
    joinId: frame.joinId,
    mode: frame.mode,
    ...(frame.n !== undefined ? { n: frame.n } : {}),
    branches: frame.branches.map<ParallelBranchState>(b => ({
      branchEntryId: b.branchEntryId,
      activeNodeId: b.activeNodeId,
      ...(b.completedAt !== undefined ? { completedAt: b.completedAt } : {}),
      ...(b.completedSignal !== undefined ? { completedSignal: b.completedSignal } : {}),
    })),
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
    if (entry === undefined) continue
    if (entry.nodeId !== nodeId) continue
    if (entry.exitedAt !== undefined) continue
    return entry.enteredAt
  }
  return null
}

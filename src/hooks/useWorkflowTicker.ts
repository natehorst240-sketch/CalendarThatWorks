/**
 * useWorkflowTicker — periodic SLA timeout driver (issue #222).
 *
 * Calls `tick(workflow, instance, nowIso)` on a fixed interval; when
 * `tick` returns a non-null `AdvanceResult`, invokes `onTimeout` with
 * the next instance + emitted events so the host can persist and
 * re-render. Stops on unmount or when `instance` becomes null.
 *
 * Pure at-will scheduling — the host owns persistence, the hook just
 * detects the SLA boundary. Idle when the workflow has no SLA, the
 * instance isn't awaiting, or the interval hasn't fired yet.
 *
 * Dedupe: each (currentNodeId, enteredAt) tuple is emitted at most
 * once. If host persistence is slow (or the host ignores the result)
 * the interval won't re-fire for the same boundary — the callback
 * only runs again after `instance` changes, which happens when the
 * host persists the advance and re-renders with the new workflow
 * state.
 *
 * Typical wiring:
 *
 *     useWorkflowTicker({
 *       workflow,
 *       instance: event.meta?.workflowInstance,
 *       variables: { event },
 *       onTimeout: (next, emit) => persist(event.id, next, emit),
 *     })
 */
import { useEffect, useRef } from 'react'
import { tick, type AdvanceResult, type WorkflowEmitEvent } from '../core/workflow/advance'
import type { Workflow, WorkflowInstance } from '../core/workflow/workflowSchema'

export interface UseWorkflowTickerOptions {
  readonly workflow: Workflow | null | undefined
  readonly instance: WorkflowInstance | null | undefined
  /**
   * Called once per crossing of the SLA boundary. Receives the result
   * of the synthetic `{ type: 'timeout' }` action. Host is responsible
   * for persisting the new instance and re-rendering.
   */
  readonly onTimeout: (
    result: AdvanceResult,
    emit: readonly WorkflowEmitEvent[],
  ) => void
  /**
   * Variables forwarded to `advance()` so condition nodes downstream of
   * the timeout edge can resolve runtime data. Pass the same object you
   * use for normal actor-driven actions.
   */
  readonly variables?: Readonly<Record<string, unknown>>
  /** Polling interval in ms. Default: 30s. */
  readonly intervalMs?: number
  /** Set false to pause the ticker (e.g. during modal edits). Default: true. */
  readonly enabled?: boolean
}

export function useWorkflowTicker(opts: UseWorkflowTickerOptions): void {
  const { workflow, instance, onTimeout, variables, intervalMs = 30_000, enabled = true } = opts

  // Hold the latest onTimeout + variables in refs so the interval
  // doesn't need to restart when the host passes a fresh callback or
  // variables object every render.
  const cbRef = useRef(onTimeout)
  cbRef.current = onTimeout
  const varsRef = useRef(variables)
  varsRef.current = variables

  // Keyed by `${currentNodeId}:${enteredAt}` — the SLA boundary
  // identity for the currently-awaited approval. Once onTimeout fires
  // for a given key, we don't fire again until the instance prop
  // changes (i.e. the host persisted our advance) and the effect
  // re-runs with a fresh closure.
  const firedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (!workflow || !instance) return
    if (instance.status !== 'awaiting') return

    const nodeId = instance.currentNodeId
    if (!nodeId) return
    const enteredAt = findEnteredAt(instance, nodeId)
    if (!enteredAt) return
    const boundaryKey = `${nodeId}:${enteredAt}`
    firedKeyRef.current = null

    const check = (): void => {
      if (firedKeyRef.current === boundaryKey) return
      const result = tick(workflow, instance, new Date().toISOString(), varsRef.current)
      if (!result) return
      firedKeyRef.current = boundaryKey
      cbRef.current(result, result.emit)
    }

    // Fire once immediately so a page that mounts mid-SLA doesn't have
    // to wait a full interval before catching an already-elapsed timer.
    check()
    const id = setInterval(check, intervalMs)
    return () => clearInterval(id)
  }, [workflow, instance, intervalMs, enabled])
}

function findEnteredAt(instance: WorkflowInstance, nodeId: string): string | null {
  for (let i = instance.history.length - 1; i >= 0; i--) {
    const entry = instance.history[i]
    if (entry === undefined) continue
    if (entry.nodeId !== nodeId) continue
    if (entry.exitedAt !== undefined) continue
    return entry.enteredAt
  }
  return null
}

export default useWorkflowTicker

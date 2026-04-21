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
 * Typical wiring:
 *
 *     useWorkflowTicker({
 *       workflow,
 *       instance: event.meta?.workflowInstance,
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
  /** Polling interval in ms. Default: 30s. */
  readonly intervalMs?: number
  /** Set false to pause the ticker (e.g. during modal edits). Default: true. */
  readonly enabled?: boolean
}

export function useWorkflowTicker(opts: UseWorkflowTickerOptions): void {
  const { workflow, instance, onTimeout, intervalMs = 30_000, enabled = true } = opts

  // Hold the latest onTimeout in a ref so the interval doesn't need to
  // restart when the host passes a fresh callback every render.
  const cbRef = useRef(onTimeout)
  cbRef.current = onTimeout

  useEffect(() => {
    if (!enabled) return
    if (!workflow || !instance) return
    if (instance.status !== 'awaiting') return

    const check = (): void => {
      const result = tick(workflow, instance, new Date().toISOString())
      if (!result) return
      cbRef.current(result, result.emit)
    }

    // Fire once immediately so a page that mounts mid-SLA doesn't have
    // to wait a full interval before catching an already-elapsed timer.
    check()
    const id = setInterval(check, intervalMs)
    return () => clearInterval(id)
  }, [workflow, instance, intervalMs, enabled])
}

export default useWorkflowTicker

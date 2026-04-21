/**
 * WorkflowSimulator — steps `advance()` against user-supplied variables
 * so authors can smoke-test a workflow without wiring it to real events.
 *
 * Design notes:
 * - Pure local state: this is an *authoring* tool, nothing it does is
 *   persisted. A Reset button wipes instance + emit log + step counter.
 * - Variables are a JSON textarea. A parse error is surfaced inline and
 *   blocks action buttons so we never hand `advance()` malformed input.
 * - Emits `onActiveNodeChange(nodeId | null)` so the canvas can highlight
 *   whichever node the interpreter parked on.
 * - **Step cap (plan amendment #8)**: `advance()` is already cycle-
 *   guarded within a single call, but a user can still keep mashing
 *   Approve on a pathological graph. The simulator tracks an action
 *   counter; at `STEP_CAP` (100) all action buttons go disabled and a
 *   banner nudges the user to Reset. The counter ONLY counts successful
 *   or failed actions — nothing that short-circuits on invalid variables.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { advance, tick } from '../core/workflow/advance'
import type {
  WorkflowAction,
  WorkflowEmitEvent,
} from '../core/workflow/advance'
import type {
  Workflow,
  WorkflowInstance,
} from '../core/workflow/workflowSchema'
import styles from './WorkflowSimulator.module.css'

export const STEP_CAP = 100

/** Fixed sim-clock epoch so every simulator run starts at the same wall
 * clock. Real host time is irrelevant in the authoring UI — what matters
 * is the delta between actions and clock jumps. */
const SIM_EPOCH_ISO = '2026-01-01T09:00:00.000Z'
const CLOCK_JUMPS_MINUTES: readonly number[] = [5, 15, 60]

const DEFAULT_VARIABLES = JSON.stringify(
  { event: { cost: 1000 }, actor: { role: 'director' } },
  null,
  2,
)

export interface WorkflowSimulatorProps {
  readonly workflow: Workflow
  readonly onActiveNodeChange?: (nodeId: string | null) => void
}

interface TimedEmit {
  readonly seq: number
  readonly event: WorkflowEmitEvent
}

export function WorkflowSimulator(
  props: WorkflowSimulatorProps,
): JSX.Element {
  const { workflow, onActiveNodeChange } = props

  const [variablesText, setVariablesText] = useState<string>(DEFAULT_VARIABLES)
  const [instance, setInstance] = useState<WorkflowInstance | null>(null)
  const [emitLog, setEmitLog] = useState<readonly TimedEmit[]>([])
  const [denyReason, setDenyReason] = useState<string>('')
  const [stepCount, setStepCount] = useState<number>(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [simClockMs, setSimClockMs] = useState<number>(Date.parse(SIM_EPOCH_ISO))
  const seqRef = useRef<number>(0)

  const { variables, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(variablesText) as unknown
      // Arrays are typeof 'object' in JS, so filter them explicitly —
      // otherwise `[]` slips through and `advance()` receives something
      // that can't be indexed by `event.cost`-style condition expressions.
      if (
        parsed === null
        || typeof parsed !== 'object'
        || Array.isArray(parsed)
      ) {
        return { variables: {}, parseError: 'Variables must be a JSON object.' }
      }
      return { variables: parsed as Record<string, unknown>, parseError: null }
    } catch (err) {
      return {
        variables: {},
        parseError: err instanceof Error ? err.message : 'Invalid JSON',
      }
    }
  }, [variablesText])

  // Notify the canvas whenever the active node changes. Skip when
  // `instance` is null (post-reset / pre-start) — onActiveNodeChange(null)
  // is still meaningful there, so fire once on transition.
  const lastActiveRef = useRef<string | null>(null)
  useEffect(() => {
    const next = instance?.currentNodeId ?? null
    if (next === lastActiveRef.current) return
    lastActiveRef.current = next
    onActiveNodeChange?.(next)
  }, [instance, onActiveNodeChange])

  const atCap = stepCount >= STEP_CAP
  const running = instance?.status === 'running' || instance?.status === 'awaiting'
  const awaiting = instance?.status === 'awaiting'
  const canStart = instance === null && !parseError && !atCap
  const canApprove = awaiting && !parseError && !atCap
  const canDeny = awaiting && denyReason.trim().length > 0 && !parseError && !atCap
  const canCancel = running && !parseError && !atCap

  const dispatch = useCallback((action: WorkflowAction): void => {
    if (atCap) return
    const at = new Date(simClockMs).toISOString()
    const result = advance({ workflow, instance, action, variables, at })
    // Count every action the user fires, even failed ones — pathological
    // graphs can generate a stream of `ok:false` that still deserves a cap.
    setStepCount(n => n + 1)
    setInstance(result.instance)
    setEmitLog(prev => {
      const additions = result.emit.map(e => ({ seq: seqRef.current++, event: e }))
      return [...prev, ...additions]
    })
    setLastError(result.ok === false ? result.error : null)
  }, [workflow, instance, variables, atCap, simClockMs])

  const advanceClock = useCallback((minutes: number): void => {
    if (atCap) return
    const nextMs = simClockMs + minutes * 60_000
    setSimClockMs(nextMs)
    if (!instance) return
    const result = tick(workflow, instance, new Date(nextMs).toISOString())
    if (!result) return
    setStepCount(n => n + 1)
    setInstance(result.instance)
    setEmitLog(prev => {
      const additions = result.emit.map(e => ({ seq: seqRef.current++, event: e }))
      return [...prev, ...additions]
    })
    setLastError(result.ok === false ? result.error : null)
  }, [workflow, instance, simClockMs, atCap])

  const reset = useCallback((): void => {
    setInstance(null)
    setEmitLog([])
    setDenyReason('')
    setStepCount(0)
    setLastError(null)
    setSimClockMs(Date.parse(SIM_EPOCH_ISO))
    seqRef.current = 0
  }, [])

  // When the workflow itself changes — template swap OR in-place edits
  // that mutate nodes/edges — reset so we never hand a stale instance
  // to `advance()` against a schema whose nodes may no longer exist.
  // Watching `workflow.id` alone misses in-place edits that keep the id
  // but bump `version` or rename/remove nodes (the builder's primary
  // mode of use). Depending on the workflow reference itself covers
  // both cases: the builder spreads a fresh object per edit.
  useEffect(() => {
    reset()
  }, [workflow, reset])

  const statusLabel = instance === null ? 'idle' : instance.status

  return (
    <section className={styles.panel} aria-label="Workflow simulator">
      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-sim-vars">Variables (JSON)</label>
        <textarea
          id="wc-sim-vars"
          className={[
            styles.textarea,
            parseError ? styles.errorInput : '',
          ].filter(Boolean).join(' ')}
          value={variablesText}
          onChange={e => setVariablesText(e.target.value)}
          aria-invalid={parseError ? 'true' : 'false'}
          aria-describedby="wc-sim-vars-hint"
          rows={6}
          spellCheck={false}
        />
        <span
          id="wc-sim-vars-hint"
          className={parseError ? styles.error : styles.hint}
        >
          {parseError ?? 'Passed to condition expressions — e.g. event.cost.'}
        </span>
      </div>

      <div className={styles.status} data-status={statusLabel}>
        <span className={styles.statusLabel}>Status</span>
        <span className={styles.statusValue}>{statusLabel}</span>
        {instance?.currentNodeId && (
          <span className={styles.currentNode} data-testid="sim-current-node">
            @ {instance.currentNodeId}
          </span>
        )}
        {instance?.outcome && (
          <span className={styles.outcome} data-outcome={instance.outcome}>
            {instance.outcome}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={() => dispatch({ type: 'start' })}
          disabled={!canStart}
        >
          Start
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => dispatch({ type: 'approve' })}
          disabled={!canApprove}
        >
          Approve
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => dispatch({ type: 'deny', reason: denyReason })}
          disabled={!canDeny}
        >
          Deny
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => dispatch({ type: 'cancel' })}
          disabled={!canCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.buttonSecondary}
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-sim-deny-reason">Deny reason</label>
        <input
          id="wc-sim-deny-reason"
          className={styles.input}
          value={denyReason}
          placeholder="Required to enable Deny"
          onChange={e => setDenyReason(e.target.value)}
        />
      </div>

      <div className={styles.section} data-testid="sim-clock">
        <h4 className={styles.sectionTitle}>Sim clock</h4>
        <div className={styles.clockRow}>
          <span className={styles.clockValue} data-testid="sim-clock-value">
            {new Date(simClockMs).toISOString()}
          </span>
        </div>
        <div className={styles.actions}>
          {CLOCK_JUMPS_MINUTES.map(m => (
            <button
              key={m}
              type="button"
              className={styles.buttonSecondary}
              onClick={() => advanceClock(m)}
              disabled={atCap}
              data-testid={`sim-advance-${m}m`}
            >
              +{m}m
            </button>
          ))}
        </div>
        <span className={styles.hint}>
          Advances the simulator clock. If the current approval has
          an SLA and the elapsed time crosses it, a timeout action fires.
        </span>
      </div>

      {atCap && (
        <div className={styles.capBanner} role="status" data-testid="sim-cap-banner">
          Step limit reached — reset to continue.
        </div>
      )}

      {lastError && (
        <div className={styles.errorBanner} role="alert" data-testid="sim-error">
          {lastError}
        </div>
      )}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Emit log</h4>
        {emitLog.length === 0
          ? <p className={styles.empty}>No events yet.</p>
          : (
            <ul className={styles.emitList} data-testid="sim-emit-log">
              {emitLog.map(({ seq, event }) => (
                <li
                  key={seq}
                  className={styles.emitItem}
                  data-emit-type={event.type}
                >
                  <span className={styles.emitType}>{event.type}</span>
                  <span className={styles.emitDetail}>{summarizeEmit(event)}</span>
                </li>
              ))}
            </ul>
          )}
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>History</h4>
        {instance === null || instance.history.length === 0
          ? <p className={styles.empty}>No history yet.</p>
          : (
            <table className={styles.historyTable} data-testid="sim-history">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Signal</th>
                  <th>Actor</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {instance.history.map((h, i) => (
                  <tr key={`${h.nodeId}-${i}`}>
                    <td>{h.nodeId}</td>
                    <td>{h.signal ?? '—'}</td>
                    <td>{h.actor ?? '—'}</td>
                    <td>{h.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </section>
  )
}

export default WorkflowSimulator

// ─── Helpers ──────────────────────────────────────────────────────────────

function summarizeEmit(e: WorkflowEmitEvent): string {
  switch (e.type) {
    case 'node_entered': return e.nodeId
    case 'node_exited':  return `${e.nodeId} → ${e.signal}`
    case 'notify':       return `${e.nodeId} via ${e.channel}${e.template ? ` (${e.template})` : ''}`
    case 'workflow_completed': return e.outcome
    case 'workflow_failed':    return `${e.nodeId}: ${e.reason}`
  }
}

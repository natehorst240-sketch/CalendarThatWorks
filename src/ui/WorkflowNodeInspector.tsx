/**
 * WorkflowNodeInspector — per-type editor for a single workflow node.
 *
 * Pure controlled component: the caller owns the draft `node` and
 * receives patches via `onChange`. Patches are shallow — the parent
 * merges them into the underlying `Workflow.nodes[]` entry.
 *
 * Condition expressions are syntax-checked via `validateExpressionSyntax`
 * with a short debounce (150ms) so the user isn't badgered mid-keystroke.
 * Everything else is direct binding; validation of guards / signal
 * coverage lives in the top-level `validateWorkflow` pass.
 */
import { useEffect, useRef, useState } from 'react'
import { validateExpressionSyntax } from '../core/workflow/validate'
import type {
  TimeoutBehavior,
  WorkflowApprovalNode,
  WorkflowConditionNode,
  WorkflowNode,
  WorkflowNotifyNode,
  WorkflowOutcome,
  WorkflowTerminalNode,
} from '../core/workflow/workflowSchema'
import styles from './WorkflowNodeInspector.module.css'

const EXPR_DEBOUNCE_MS = 150

const TIMEOUT_BEHAVIORS: readonly TimeoutBehavior[] = [
  'escalate',
  'auto-approve',
  'auto-deny',
]

const OUTCOMES: readonly WorkflowOutcome[] = ['finalized', 'denied', 'cancelled']

export interface WorkflowNodeInspectorProps {
  readonly node: WorkflowNode
  readonly onChange: (patch: Partial<WorkflowNode>) => void
}

export function WorkflowNodeInspector(
  props: WorkflowNodeInspectorProps,
): JSX.Element {
  const { node, onChange } = props
  return (
    <section
      className={styles.panel}
      aria-label={`Inspector for ${node.type} node ${node.id}`}
    >
      <header className={styles.header}>
        <span className={styles.headerTitle}>{node.type}</span>
        <span className={styles.headerKind}>#{node.id}</span>
      </header>

      <CommonFields node={node} onChange={onChange} />

      {node.type === 'condition' && (
        <ConditionFields node={node} onChange={onChange} />
      )}
      {node.type === 'approval' && (
        <ApprovalFields node={node} onChange={onChange} />
      )}
      {node.type === 'notify' && (
        <NotifyFields node={node} onChange={onChange} />
      )}
      {node.type === 'terminal' && (
        <TerminalFields node={node} onChange={onChange} />
      )}
    </section>
  )
}

export default WorkflowNodeInspector

// ─── Field groups ──────────────────────────────────────────────────────────

function CommonFields({
  node,
  onChange,
}: {
  node: WorkflowNode
  onChange: (patch: Partial<WorkflowNode>) => void
}): JSX.Element {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-id">Node ID</label>
        <input
          id="wc-node-id"
          className={styles.input}
          value={node.id}
          disabled
          readOnly
        />
        <span className={styles.hint}>IDs are fixed after creation.</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-label">Label</label>
        <input
          id="wc-node-label"
          className={styles.input}
          value={node.label ?? ''}
          placeholder="Shown on the canvas"
          onChange={e => onChange({ label: e.target.value } as Partial<WorkflowNode>)}
        />
      </div>
    </>
  )
}

function ConditionFields({
  node,
  onChange,
}: {
  node: WorkflowConditionNode
  onChange: (patch: Partial<WorkflowConditionNode>) => void
}): JSX.Element {
  // Debounced syntax check: store the latest draft value and run
  // `validateExpressionSyntax` only after the user pauses typing.
  //
  // The initial `error` is seeded synchronously so there's no "no
  // error" flash between mount and the first effect pass.
  const [draftExpr, setDraftExpr] = useState<string>(node.expr)
  const [error, setError] = useState<string | null>(
    () => validateExpressionSyntax(node.expr),
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Only sync on a genuine node swap (`node.id` changes). Syncing on
  // `node.expr` would re-validate on every controlled re-render — in
  // normal usage the parent merges each keystroke back in, which
  // would short-circuit the 150ms debounce and badger mid-type.
  // On swap we also flush the pending timer so a late validation
  // from the previous node can't stomp the new node's error state.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setDraftExpr(node.expr)
    setError(validateExpressionSyntax(node.expr))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, [node.id])

  // Safety net: cancel any pending validation on unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const handleChange = (value: string): void => {
    setDraftExpr(value)
    onChange({ expr: value })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setError(validateExpressionSyntax(value))
    }, EXPR_DEBOUNCE_MS)
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="wc-node-expr">Expression</label>
      <textarea
        id="wc-node-expr"
        className={[styles.textarea, error ? styles.errorInput : ''].filter(Boolean).join(' ')}
        value={draftExpr}
        onChange={e => handleChange(e.target.value)}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby="wc-node-expr-hint"
        rows={3}
        spellCheck={false}
      />
      <span id="wc-node-expr-hint" className={error ? styles.error : styles.hint}>
        {error ?? 'Evaluated against action variables — e.g. event.cost > 500'}
      </span>
    </div>
  )
}

function ApprovalFields({
  node,
  onChange,
}: {
  node: WorkflowApprovalNode
  onChange: (patch: Partial<WorkflowApprovalNode>) => void
}): JSX.Element {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-assignTo">Assign to</label>
        <input
          id="wc-node-assignTo"
          className={styles.input}
          value={node.assignTo}
          placeholder="role:director, user:alice, …"
          onChange={e => onChange({ assignTo: e.target.value })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-sla">SLA minutes (optional)</label>
        <input
          id="wc-node-sla"
          className={styles.input}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={node.slaMinutes ?? ''}
          onChange={e => {
            const raw = e.target.value
            if (raw === '') return onChange({ slaMinutes: undefined })
            if (!/^\d+$/.test(raw)) return
            const parsed = Number(raw)
            if (Number.isFinite(parsed) && parsed >= 0) {
              onChange({ slaMinutes: parsed })
            }
          }}
        />
        <span className={styles.hint}>Phase-3 feature; stored but not yet enforced.</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-onTimeout">On timeout</label>
        <select
          id="wc-node-onTimeout"
          className={styles.select}
          value={node.onTimeout ?? ''}
          onChange={e => {
            const v = e.target.value as TimeoutBehavior | ''
            onChange({ onTimeout: v === '' ? undefined : v })
          }}
        >
          <option value="">(none)</option>
          {TIMEOUT_BEHAVIORS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
    </>
  )
}

function NotifyFields({
  node,
  onChange,
}: {
  node: WorkflowNotifyNode
  onChange: (patch: Partial<WorkflowNotifyNode>) => void
}): JSX.Element {
  return (
    <>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-channel">Channel</label>
        <input
          id="wc-node-channel"
          className={styles.input}
          value={node.channel}
          placeholder="slack, email, webhook, …"
          onChange={e => onChange({ channel: e.target.value })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="wc-node-template">Template (optional)</label>
        <input
          id="wc-node-template"
          className={styles.input}
          value={node.template ?? ''}
          onChange={e => onChange({ template: e.target.value || undefined })}
        />
      </div>
    </>
  )
}

function TerminalFields({
  node,
  onChange,
}: {
  node: WorkflowTerminalNode
  onChange: (patch: Partial<WorkflowTerminalNode>) => void
}): JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="wc-node-outcome">Outcome</label>
      <select
        id="wc-node-outcome"
        className={styles.select}
        value={node.outcome}
        onChange={e => onChange({ outcome: e.target.value as WorkflowOutcome })}
      >
        {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

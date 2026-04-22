/**
 * AuditDrawer — renders the approval-stage history for a single event.
 *
 * Opens from the AssetsView when the user clicks a denied or pending_higher
 * pill. Read-only; calendar never mutates history. Host is expected to
 * append entries via the onApprovalAction callback (calendar emits, host
 * persists, re-renders with updated history).
 */
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import styles from './AuditDrawer.module.css';
import ApprovalActionMenu from '../ui/ApprovalActionMenu';
import { findNode } from '../core/workflow/workflowSchema';

/**
 * Formats an ISO timestamp as a locale-aware date + time string. Returns the
 * raw input unchanged when the value is falsy or unparseable so the caller
 * never renders "Invalid Date".
 */
function formatAt(iso: string | undefined | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

const ACTION_LABELS = {
  submit:    'Submitted',
  approve:   'Approved',
  deny:      'Denied',
  downgrade: 'Downgraded',
  finalize:  'Finalized',
};

/**
 * Compute SLA pill data from a workflow definition + running instance.
 * Returns null when inapplicable (no instance, not awaiting, no SLA, or
 * the active node isn't in the workflow anymore).
 */
function computeSlaPill(workflow: any, workflowInstance: any, nowMs: number) {
  if (!workflow || !workflowInstance) return null;
  if (workflowInstance.status !== 'awaiting') return null;
  const nodeId = workflowInstance.currentNodeId;
  if (!nodeId) return null;
  const node = findNode(workflow, nodeId);
  if (!node || node.type !== 'approval') return null;
  if (typeof node.slaMinutes !== 'number' || node.slaMinutes <= 0) return null;
  const history = workflowInstance.history ?? [];
  let enteredAt = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.nodeId === nodeId && h.exitedAt === undefined) { enteredAt = h.enteredAt; break; }
  }
  if (!enteredAt) return null;
  const enteredMs = Date.parse(enteredAt);
  if (!Number.isFinite(enteredMs)) return null;
  const slaMs = node.slaMinutes * 60_000;
  const remainingMs = enteredMs + slaMs - nowMs;
  return {
    remainingMs,
    slaMinutes: node.slaMinutes,
    onTimeout: node.onTimeout ?? 'escalate',
    expired: remainingMs <= 0,
  };
}

function formatRemaining(ms: number) {
  const abs = Math.abs(ms);
  const totalMinutes = Math.max(0, Math.round(abs / 60_000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function AuditDrawer({ event, onClose, approvalsConfig, onAction, workflow }: any) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!event) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  // Re-render once per 30s so the SLA countdown stays current while the
  // drawer is open. Only runs when an SLA pill is actually visible —
  // cheaper than a global interval.
  const workflowInstance = event?.meta?.workflowInstance;
  const sla = computeSlaPill(workflow, workflowInstance, nowMs);
  useEffect(() => {
    if (!sla) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [sla !== null]);

  if (!event) return null;

  const stageData = event.meta?.approvalStage;
  const history = Array.isArray(stageData?.history) ? stageData.history : [];

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="audit-drawer-overlay"
    >
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`Audit history for ${event.title}`}
      >
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>{event.title}</h2>
            {stageData?.stage && (
              <span className={styles.stageTag} data-stage={stageData.stage}>
                {stageData.stage.replace('_', ' ')}
              </span>
            )}
            {sla && (
              <span
                className={styles.slaPill}
                data-testid="audit-sla-pill"
                data-sla-expired={sla.expired ? 'true' : 'false'}
                title={`SLA ${sla.slaMinutes}m · onTimeout=${sla.onTimeout}`}
              >
                {sla.expired
                  ? `SLA elapsed +${formatRemaining(sla.remainingMs)}`
                  : `SLA ${formatRemaining(sla.remainingMs)} left`}
              </span>
            )}
            {stageData?.stage && typeof onAction === 'function' && (
              <ApprovalActionMenu
                stage={stageData.stage}
                approvalsConfig={approvalsConfig}
                onAction={onAction}
                variant="inline"
                onClose={undefined}
                labelledBy={undefined}
                anchorRect={undefined}
              />
            )}
          </div>
          <button
            ref={closeRef}
            className={styles.closeBtn}
            onClick={() => onClose?.()}
            aria-label="Close audit history"
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {history.length === 0 ? (
            <p className={styles.empty}>No history recorded for this request.</p>
          ) : (
            <ol className={styles.timeline}>
              {history.map((entry: any, i: number) => (
                <li
                  key={`${entry.at}-${entry.action}-${i}`}
                  className={styles.entry}
                  data-action={entry.action}
                >
                  <div className={styles.entryHead}>
                    <span className={styles.entryAction}>
                      {ACTION_LABELS[entry.action as keyof typeof ACTION_LABELS] ?? entry.action}
                    </span>
                    {entry.tier != null && (
                      <span className={styles.entryTier}>Tier {entry.tier}</span>
                    )}
                  </div>
                  <div className={styles.entryMeta}>
                    <span>{formatAt(entry.at)}</span>
                    {entry.actor && <span> · {entry.actor}</span>}
                  </div>
                  {entry.reason && (
                    <p className={styles.entryReason}>{entry.reason}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}

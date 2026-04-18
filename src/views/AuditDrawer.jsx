/**
 * AuditDrawer — renders the approval-stage history for a single event.
 *
 * Opens from the AssetsView when the user clicks a denied or pending_higher
 * pill. Read-only; calendar never mutates history. Host is expected to
 * append entries via the onApprovalAction callback (calendar emits, host
 * persists, re-renders with updated history).
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './AuditDrawer.module.css';
import ApprovalActionMenu from '../ui/ApprovalActionMenu.jsx';

/**
 * Formats an ISO timestamp as a locale-aware date + time string. Returns the
 * raw input unchanged when the value is falsy or unparseable so the caller
 * never renders "Invalid Date".
 */
function formatAt(iso) {
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

export default function AuditDrawer({ event, onClose, approvalsConfig, onAction }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, onClose]);

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
            {stageData?.stage && typeof onAction === 'function' && (
              <ApprovalActionMenu
                stage={stageData.stage}
                approvalsConfig={approvalsConfig}
                onAction={onAction}
                variant="inline"
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
              {history.map((entry, i) => (
                <li
                  key={`${entry.at}-${entry.action}-${i}`}
                  className={styles.entry}
                  data-action={entry.action}
                >
                  <div className={styles.entryHead}>
                    <span className={styles.entryAction}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
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

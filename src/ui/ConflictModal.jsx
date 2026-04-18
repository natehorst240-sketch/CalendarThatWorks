/**
 * ConflictModal — surfaces conflict-engine violations for user override.
 *
 * Host code runs `evaluateConflicts()` (src/core/conflictEngine.ts) before
 * an event write. When violations come back, the modal lists them with
 * severity, the offending event id, and the rule id, then offers:
 *   - Proceed  — only enabled when every violation is `soft` (engine sets
 *                `allowed: true` in that case). Hard violations block.
 *   - Cancel   — dismiss without writing.
 *
 * The component is purely presentational: it takes a `result` from the
 * engine and two callbacks. It does not mutate state itself.
 */
import { AlertTriangle, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import styles from './ConflictModal.module.css';

export default function ConflictModal({
  result,
  onProceed,
  onCancel,
  title = 'Conflict detected',
}) {
  const trapRef = useFocusTrap(onCancel);

  if (!result || result.severity === 'none' || result.violations.length === 0) {
    return null;
  }

  const canProceed = result.allowed; // soft-only violations

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-modal-title"
        className={styles.panel}
        data-severity={result.severity}
      >
        <div className={styles.head}>
          <AlertTriangle size={18} aria-hidden="true" />
          <h2 id="conflict-modal-title" className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
            aria-label="Close conflict dialog"
          >
            <X size={16} />
          </button>
        </div>

        <ul className={styles.list} aria-label="Conflict violations">
          {result.violations.map((v, i) => (
            <li
              key={`${v.rule}:${v.conflictingEventId ?? i}`}
              className={styles.item}
              data-severity={v.severity}
              data-rule={v.rule}
            >
              <span className={styles.severityTag}>{v.severity}</span>
              <span className={styles.message}>{v.message}</span>
              <span className={styles.ruleTag} aria-label={`rule ${v.rule}`}>
                {v.rule}
              </span>
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onProceed}
            disabled={!canProceed}
            title={canProceed
              ? 'Proceed despite warnings'
              : 'Cannot proceed — hard violations must be resolved first'}
          >
            {canProceed ? 'Proceed anyway' : 'Resolve to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: remove as types are tightened */
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
import type { MouseEvent } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './ConflictModal.module.css';

export default function ConflictModal({
  result,
  onProceed,
  onCancel,
  title = 'Conflict detected',
}: any) {
  const trapRef = useFocusTrap<HTMLDivElement>(onCancel);

  if (!result || result.severity === 'none' || result.violations.length === 0) {
    return null;
  }

  const canProceed = result.allowed; // soft-only violations

  return (
    <div
      className={styles['overlay']}
      onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onCancel()}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-modal-title"
        className={styles['panel']}
        data-severity={result.severity}
      >
        <div className={styles['head']}>
          <AlertTriangle size={18} aria-hidden="true" />
          <h2 id="conflict-modal-title" className={styles['title']}>
            {title}
          </h2>
          <button
            type="button"
            className={styles['closeBtn']}
            onClick={onCancel}
            aria-label="Close conflict dialog"
          >
            <X size={16} />
          </button>
        </div>

        <ul className={styles['list']} aria-label="Conflict violations">
          {result.violations.map((v: any, i: number) => {
            // Pool-unresolvable rejections carry an `evaluated` trail
            // (the ordered list of members the resolver actually
            // tried) and a structured error `code`. Surface both so
            // the user can see "tried A, B; both conflicted" instead
            // of a bare "no member available" — issue #386 item #8.
            const isPoolFailure = v.rule === 'pool-unresolvable';
            const evaluated: readonly string[] = isPoolFailure && Array.isArray(v.details?.evaluated)
              ? v.details.evaluated
              : [];
            const code = isPoolFailure && typeof v.details?.code === 'string'
              ? v.details.code
              : null;
            return (
              <li
                key={`${v.rule}:${v.conflictingEventId ?? i}`}
                className={styles['item']}
                data-severity={v.severity}
                data-rule={v.rule}
              >
                <span className={styles['severityTag']}>{v.severity}</span>
                <span className={styles['message']}>{v.message}</span>
                <span className={styles['ruleTag']} aria-label={`rule ${v.rule}`}>
                  {code ?? v.rule}
                </span>
                {evaluated.length > 0 && (
                  <span
                    className={styles['poolEvaluated']}
                    aria-label={`Pool members tried: ${evaluated.join(', ')}`}
                    data-testid="pool-evaluated"
                  >
                    Tried members: {evaluated.join(', ')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className={styles['footer']}>
          <button
            type="button"
            className={styles['btnSecondary']}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles['btnPrimary']}
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

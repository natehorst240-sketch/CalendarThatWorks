import { useFocusTrap } from '../hooks/useFocusTrap';
import type { MouseEvent } from 'react';
import styles from './ValidationAlert.module.css';

/**
 * ValidationAlert — shown when validateChange returns a soft or hard violation.
 *
 * Hard  → one "Dismiss" button (commit is blocked).
 * Soft  → "Cancel" + "Save anyway" (user can override the warning).
 */
export default function ValidationAlert({ violations, isHard, onConfirm, onCancel }: any) {
  const trapRef = useFocusTrap(onCancel);
  return (
    <div
      className={styles.overlay}
      onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={trapRef}
        className={[styles.dialog, isHard ? styles.hard : styles.soft].join(' ')}
        role="alertdialog" aria-modal="true"
      >
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden="true">
            {isHard ? '⛔' : '⚠️'}
          </span>
          <h2 className={styles.title}>
            {isHard ? 'Cannot save' : 'Check before saving'}
          </h2>
        </div>

        <ul className={styles.list}>
          {violations.map((v: any, i: number) => (
            <li key={i} className={styles.item}>{v.message}</li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {isHard ? 'Dismiss' : 'Cancel'}
          </button>
          {!isHard && onConfirm && (
            <button className={styles.confirmBtn} onClick={onConfirm}>
              Save anyway
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

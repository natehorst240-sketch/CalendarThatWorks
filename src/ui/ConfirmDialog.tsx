import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './ConfirmDialog.module.css';

/**
 * ConfirmDialog — in-app replacement for the browser's native confirm().
 *
 * Uses the existing focus trap and design system tokens so it fits
 * seamlessly inside any embedded deployment.
 *
 * Props:
 *   message       string   — Body text shown to the user.
 *   confirmLabel  string   — Label for the destructive confirm button (default "Delete").
 *   onConfirm     () => void
 *   onCancel      () => void
 */
export default function ConfirmDialog({ message, confirmLabel = 'Delete', onConfirm, onCancel }: any) {
  const trapRef = useFocusTrap(onCancel);

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={trapRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm action"
      >
        <div className={styles.body}>
          <p className={styles.message}>{message}</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

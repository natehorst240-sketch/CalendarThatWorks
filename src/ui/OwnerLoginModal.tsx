/**
 * OwnerLoginModal — focused password gate for owner access.
 *
 * Replaces the popover that used to live inline next to the gear button.
 * Renders a centered modal with focus trap, Escape-to-close, and a single
 * password field so screen-reader users land on a dedicated dialog rather
 * than a floating menu attached to the toolbar.
 */
import { useState, type FormEvent, type MouseEvent } from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './OwnerLoginModal.module.css';

export default function OwnerLoginModal({ authError, isAuthLoading, onAuthenticate, onClose }: any) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onAuthenticate(password);
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={trapRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-login-title"
      >
        <div className={styles.head}>
          <div className={styles.title}>
            <Lock size={14} aria-hidden="true" />
            <h2 id="owner-login-title" className={styles.titleText}>Owner settings</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="owner-login-password">
            Owner password
          </label>
          <div className={styles.inputRow}>
            <input
              id="owner-login-password"
              type={showPw ? 'text' : 'password'}
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password…"
              autoFocus
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.togglePw}
              onClick={() => setShowPw(p => !p)}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {authError && <span className={styles.error} role="alert">{authError}</span>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={isAuthLoading || !password}>
              {isAuthLoading ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

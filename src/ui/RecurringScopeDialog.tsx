import { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './RecurringScopeDialog.module.css';

const SCOPE_OPTIONS = [
  {
    value:       'single',
    label:       'This event only',
    description: 'Only this occurrence is changed. The rest of the series stays the same.',
  },
  {
    value:       'following',
    label:       'This and following events',
    description: 'This occurrence and all future ones are changed. Past occurrences are unaffected.',
  },
  {
    value:       'series',
    label:       'All events in the series',
    description: 'Every occurrence is updated, including past and future ones.',
  },
];

/**
 * RecurringScopeDialog — shown when editing/moving/deleting an occurrence of a
 * recurring series.  Lets the user choose whether to affect:
 *   • only this occurrence ('single')
 *   • this and all following ('following')
 *   • the entire series ('series')
 *
 * Props:
 *   actionLabel   Short verb for the title, e.g. "Edit", "Move", "Delete"
 *   onConfirm(scope: 'single' | 'following' | 'series') → void
 *   onCancel()  → void
 */
export default function RecurringScopeDialog({ actionLabel = 'Edit', onConfirm, onCancel }: any) {
  const [scope, setScope] = useState('single');
  const trapRef = useFocusTrap(onCancel);

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={trapRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsd-title"
      >
        <div className={styles.header}>
          <span className={styles.icon} aria-hidden="true">🔁</span>
          <h2 className={styles.title} id="rsd-title">
            {actionLabel} recurring event
          </h2>
        </div>

        <p className={styles.prompt}>Which events do you want to {actionLabel.toLowerCase()}?</p>

        <div className={styles.options}>
          {SCOPE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={[styles.option, scope === opt.value && styles.selected].filter(Boolean).join(' ')}
            >
              <input
                type="radio"
                className={styles.radio}
                name="scope"
                value={opt.value}
                checked={scope === opt.value}
                onChange={() => setScope(opt.value)}
              />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{opt.label}</span>
                <span className={styles.optionDesc}>{opt.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.confirmBtn} onClick={() => onConfirm(scope)}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * KeyboardHelpOverlay — discoverable cheat-sheet for the global shortcuts
 * registered by useKeyboardShortcuts. Triggered by `?` (or the toolbar
 * button when one is wired). Standard modal contract: focus trap, Escape
 * closes, click-outside dismisses.
 */
import { Keyboard, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import styles from './KeyboardHelpOverlay.module.css';

const SHORTCUTS = [
  {
    group: 'Switch view',
    items: [
      { keys: ['1'], label: 'Month' },
      { keys: ['2'], label: 'Week' },
      { keys: ['3'], label: 'Day' },
      { keys: ['4'], label: 'Agenda' },
      { keys: ['5'], label: 'Schedule' },
      { keys: ['6'], label: 'Assets' },
    ],
  },
  {
    group: 'Navigate',
    items: [
      { keys: ['j', '→'], label: 'Next period' },
      { keys: ['k', '←'], label: 'Previous period' },
      { keys: ['t'], label: 'Jump to today' },
    ],
  },
  {
    group: 'Help',
    items: [
      { keys: ['?'], label: 'Open this help dialog' },
      { keys: ['Esc'], label: 'Close any open dialog' },
    ],
  },
];

export default function KeyboardHelpOverlay({ onClose }: any) {
  const trapRef = useFocusTrap(onClose);

  return (
    <div
      className={styles.overlay}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={trapRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-help-title"
      >
        <div className={styles.head}>
          <div className={styles.title}>
            <Keyboard size={16} aria-hidden="true" />
            <h2 id="kbd-help-title" className={styles.titleText}>Keyboard shortcuts</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close keyboard help">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {SHORTCUTS.map(group => (
            <section key={group.group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.group}</h3>
              <ul className={styles.list}>
                {group.items.map(item => (
                  <li key={item.label} className={styles.row}>
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.keys}>
                      {item.keys.map((k, i) => (
                        <kbd key={i} className={styles.kbd}>{k}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

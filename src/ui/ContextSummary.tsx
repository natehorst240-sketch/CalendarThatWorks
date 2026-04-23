/**
 * ContextSummary — live one-line readout of the calendar's current state.
 *
 * Renders: "View: By Base  ·  Focus: Aircraft Requests  ·  Scope: All regions"
 * Updates every render via props; no internal state needed.
 */
import styles from './ContextSummary.module.css';

export type ContextSummaryProps = {
  /** Label of the active view preset, e.g. "By Base". Null = "Custom". */
  viewLabel: string | null;
  /** Labels of all currently active focus chips. Empty = "All". */
  chipLabels: string[];
  /** Scope/region label, e.g. "All regions". */
  scope: string;
};

export default function ContextSummary({
  viewLabel,
  chipLabels,
  scope,
}: ContextSummaryProps) {
  const focusText: string = chipLabels.length > 0 ? chipLabels.join(' + ') : 'All';
  const viewText: string = viewLabel !== null ? viewLabel : 'Custom';

  return (
    <div
      className={styles.bar}
      aria-live="polite"
      aria-label="Current calendar context"
    >
      <Segment label="View" value={viewText} />
      <span className={styles.dot} aria-hidden="true">·</span>
      <Segment label="Focus" value={focusText} />
      <span className={styles.dot} aria-hidden="true">·</span>
      <Segment label="Scope" value={scope} />
    </div>
  );
}

function Segment({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.segment}>
      <span className={styles.key}>{label}</span>
      <span className={styles.value}>{value}</span>
    </span>
  );
}

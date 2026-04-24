/**
 * ContextSummary â€” live one-line readout of the calendar's current state.
 *
 * Renders: "View: By Base  |  Focus: Aircraft Requests  |  Scope: All regions"
 * Updates every render via props; no internal state needed.
 */
import styles from './ContextSummary.module.css';

export type ContextSummaryProps = {
  /** Label of the active view preset, e.g. "By Base". Null = "Custom". */
  viewLabel: string | null;
  /** Labels of all currently active focus chips. Empty = "All". */
  chipLabels?: string[];
  /** Optional already-combined focus summary. */
  focusLabel?: string;
  /** Scope/region label, e.g. "All regions". */
  scope?: string;
  /** Optional alternate scope summary copy. */
  scopeLabel?: string;
};

export default function ContextSummary({
  viewLabel,
  chipLabels = [],
  focusLabel,
  scope,
  scopeLabel,
}: ContextSummaryProps) {
  const focusText: string = focusLabel ?? (chipLabels.length > 0 ? chipLabels.join(' + ') : 'All');
  const viewText: string = viewLabel !== null ? viewLabel : 'Custom';
  const scopeText: string = scopeLabel ?? scope ?? 'All';

  return (
    <div
      className={styles['bar']}
      aria-live="polite"
      aria-label="Current calendar context"
    >
      <Segment label="View" value={viewText} />
      <span className={styles['dot']} aria-hidden="true">|</span>
      <Segment label="Focus" value={focusText} />
      <span className={styles['dot']} aria-hidden="true">|</span>
      <Segment label="Scope" value={scopeText} />
    </div>
  );
}

function Segment({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles['segment']}>
      <span className={styles['key']}>{label}</span>
      <span className={styles['value']}>{value}</span>
    </span>
  );
}

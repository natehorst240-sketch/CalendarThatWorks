/**
 * ContextSummary — live one-line readout of the calendar's current state.
 *
 * Renders: "View: By Base  ·  Focus: Aircraft Requests  ·  Scope: All regions"
 * Updates every render via props; no internal state needed.
 */
import styles from './ContextSummary.module.css';

export type ContextSummarySegment = 'view' | 'focus' | 'scope';

export type ContextSummaryProps = {
  /** Label of the active view preset, e.g. "By Base". Null = "Custom". */
  viewLabel: string | null;
  /** Labels of all currently active focus chips. Empty = "All". */
  chipLabels: string[];
  /** Scope/region label, e.g. "All regions". */
  scope: string;
  /** Fires when a segment is clicked; makes segments interactive. */
  onSegmentClick?: (segment: ContextSummarySegment) => void;
};

export default function ContextSummary({
  viewLabel,
  chipLabels,
  scope,
  onSegmentClick,
}: ContextSummaryProps) {
  const focusText: string = chipLabels.length > 0 ? chipLabels.join(' + ') : 'All';
  const viewText: string = viewLabel !== null ? viewLabel : 'Custom';

  return (
    <div
      className={styles['bar']}
      aria-live="polite"
      aria-label="Current calendar context"
    >
      <Segment
        label="View"
        value={viewText}
        segment="view"
        onClick={onSegmentClick ? () => onSegmentClick('view') : undefined}
      />
      <span className={styles['dot']} aria-hidden="true">·</span>
      <Segment
        label="Focus"
        value={focusText}
        segment="focus"
        onClick={onSegmentClick ? () => onSegmentClick('focus') : undefined}
      />
      <span className={styles['dot']} aria-hidden="true">·</span>
      <Segment
        label="Scope"
        value={scope}
        segment="scope"
        onClick={onSegmentClick ? () => onSegmentClick('scope') : undefined}
      />
    </div>
  );
}

function Segment({
  label,
  value,
  segment,
  onClick,
}: {
  label: string;
  value: string;
  segment: ContextSummarySegment;
  onClick: (() => void) | undefined;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={styles['segmentBtn']}
        onClick={onClick}
        aria-label={`Edit ${label}: ${value}`}
        data-segment={segment}
      >
        <span className={styles['key']}>{label}</span>
        <span className={styles['value']}>{value}</span>
        <span className={styles['chevron']} aria-hidden="true">›</span>
      </button>
    );
  }
  return (
    <span className={styles['segment']} data-segment={segment}>
      <span className={styles['key']}>{label}</span>
      <span className={styles['value']}>{value}</span>
    </span>
  );
}

/**
 * ApprovalDot — small status dot rendered inside calendar event pills.
 *
 * Reads `event.meta.approvalStage.stage` and shows a coloured dot for any
 * non-terminal-success state (requested / approved / finalized /
 * pending_higher / denied). Returns null otherwise so cleanly-categorised
 * events with no approval workflow stay visually unchanged.
 *
 * Used by views that don't have their own approval-stage rendering
 * (MonthView, ScheduleView, WeekView, DayView). AssetsView has its own,
 * richer treatment (strikethrough on denied, label prefixes) and doesn't
 * consume this component.
 */
import styles from './ApprovalDot.module.css';

const STAGE_LABEL: Record<string, string> = {
  requested:      'Pending request',
  approved:       'Approved',
  finalized:      'Finalized',
  pending_higher: 'Pending higher approval',
  denied:         'Denied',
};

type ApprovalEventLike = {
  meta?: { approvalStage?: { stage?: string | null } | null } | null | undefined;
};

export type ApprovalDotProps = {
  event: ApprovalEventLike;
};

export default function ApprovalDot({ event }: ApprovalDotProps): JSX.Element | null {
  const stage = event?.meta?.approvalStage?.stage;
  if (!stage || !(stage in STAGE_LABEL)) return null;
  const label = STAGE_LABEL[stage] ?? stage;
  return (
    <span
      className={[styles['dot'], styles[`stage_${stage}`]].filter(Boolean).join(' ')}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

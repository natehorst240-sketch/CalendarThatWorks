/**
 * MaintenanceBadge — read-only chip showing the due status for a single
 * maintenance rule. Pairs with `<AssetMaintenanceBadges>` for the multi-rule
 * case, but is exported standalone for consumers building their own layouts.
 *
 * Pure presentation. Status colors come from the WorksCalendar theme tokens
 * (--wc-danger / --wc-warning / --wc-success / --wc-text-muted).
 */
import type { CSSProperties } from 'react';
import type { MaintenanceRule } from '../types/maintenance';
import type { DueResult, DueStatus } from '../core/maintenance';

const PALETTE: Record<DueStatus, { bg: string; fg: string; border: string }> = {
  overdue:    { bg: 'color-mix(in srgb, var(--wc-danger) 14%, transparent)',  fg: 'var(--wc-danger)',      border: 'color-mix(in srgb, var(--wc-danger) 40%, transparent)' },
  'due-soon': { bg: 'color-mix(in srgb, var(--wc-warning) 14%, transparent)', fg: 'var(--wc-warning)',     border: 'color-mix(in srgb, var(--wc-warning) 40%, transparent)' },
  ok:         { bg: 'transparent',                                            fg: 'var(--wc-text-muted)',  border: 'var(--wc-border)' },
  unknown:    { bg: 'transparent',                                            fg: 'var(--wc-text-faint)',  border: 'var(--wc-border)' },
};

const STATUS_LABEL: Record<DueStatus, string> = {
  overdue:    'overdue',
  'due-soon': 'due soon',
  ok:         'ok',
  unknown:    'unknown',
};

export interface MaintenanceBadgeProps {
  rule: MaintenanceRule;
  due: DueResult;
  /** Override the default short label ("oil change · 1.2k mi"). */
  label?: string;
  style?: CSSProperties;
  className?: string;
}

export function MaintenanceBadge({
  rule,
  due,
  label,
  style,
  className,
}: MaintenanceBadgeProps) {
  const colors = PALETTE[due.status];
  const detail = label ?? buildDetail(due);
  const aria = `${rule.title}: ${STATUS_LABEL[due.status]}${detail ? ` (${detail})` : ''}`;

  return (
    <span
      role="status"
      aria-label={aria}
      title={aria}
      data-status={due.status}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        fontSize: 10,
        lineHeight: '14px',
        fontWeight: 500,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--wc-radius-sm, 4px)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ opacity: 0.85 }}>{rule.title}</span>
      {detail && <span style={{ opacity: 0.65 }}>· {detail}</span>}
    </span>
  );
}

/**
 * Pick the most-actionable single-line summary from a DueResult. Prefers
 * the dimension that drives the overall status (overdue first, then
 * due-soon), then falls back to whichever dimension has the smallest
 * `remaining`.
 */
function buildDetail(due: DueResult): string {
  const dims: Array<{ key: 'miles' | 'hours' | 'days' | 'cycles'; remaining: number; unit: string }> = [];
  if (due.miles)  dims.push({ key: 'miles',  remaining: due.miles.remaining,  unit: 'mi'    });
  if (due.hours)  dims.push({ key: 'hours',  remaining: due.hours.remaining,  unit: 'hr'    });
  if (due.cycles) dims.push({ key: 'cycles', remaining: due.cycles.remaining, unit: 'cycles'});
  if (due.days)   dims.push({ key: 'days',   remaining: due.days.remaining,   unit: 'd'     });
  if (!dims.length) return '';

  // Worst dimension first.
  dims.sort((a, b) => a.remaining - b.remaining);
  const worst = dims[0]!;
  if (worst.remaining < 0) return `${formatNum(-worst.remaining)} ${worst.unit} late`;
  return `${formatNum(worst.remaining)} ${worst.unit}`;
}

function formatNum(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000)  return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

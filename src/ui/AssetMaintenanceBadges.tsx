/**
 * AssetMaintenanceBadges — given an asset's rules + current state, computes
 * due status for each rule and renders a row of `<MaintenanceBadge>` chips.
 *
 * Sort order: overdue → due-soon → ok → unknown, then by smallest remaining.
 * `max` truncates the visible list with a "+N" overflow chip.
 */
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type {
  MaintenanceRule,
  MeterType,
} from '../types/maintenance';
import {
  computeDueStatus,
  type CurrentState,
  type DueResult,
  type DueStatus,
  type LastService,
} from '../core/maintenance';
import { MaintenanceBadge } from './MaintenanceBadge';

const STATUS_RANK: Record<DueStatus, number> = { overdue: 0, 'due-soon': 1, ok: 2, unknown: 3 };

export interface AssetMaintenanceBadgesProps {
  rules: readonly MaintenanceRule[];
  /** Most recent meter reading for the asset. Optional — meter-based rules
   *  without a reading render as `unknown`. */
  currentMeter?: { type: MeterType; value: number };
  /** Per-rule last-service info, keyed by `rule.id`. */
  lastServiceByRule?: Record<string, LastService>;
  /** Override "now" for date-based rules. Defaults to `new Date()`. */
  now?: Date;
  /** Cap on visible chips. Extras collapse into a "+N" overflow chip. */
  max?: number;
  /** Hide chips with status `ok` or `unknown` (typical for compact rows). */
  hideHealthy?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function AssetMaintenanceBadges({
  rules,
  currentMeter,
  lastServiceByRule,
  now,
  max,
  hideHealthy = false,
  style,
  className,
}: AssetMaintenanceBadgesProps) {
  const entries = useMemo(() => {
    const current: CurrentState = currentMeter ? { meter: currentMeter } : {};
    const computed = rules.map(rule => {
      const last = lastServiceByRule?.[rule.id] ?? {};
      const due = computeDueStatus(rule, current, last, now);
      return { rule, due };
    });
    const filtered = hideHealthy
      ? computed.filter(e => e.due.status === 'overdue' || e.due.status === 'due-soon')
      : computed;
    filtered.sort((a, b) => {
      const r = STATUS_RANK[a.due.status] - STATUS_RANK[b.due.status];
      if (r !== 0) return r;
      return smallestRemaining(a.due) - smallestRemaining(b.due);
    });
    return filtered;
  }, [rules, currentMeter, lastServiceByRule, now, hideHealthy]);

  if (!entries.length) return null;

  const visible  = max != null ? entries.slice(0, max) : entries;
  const overflow = max != null ? entries.length - visible.length : 0;

  return (
    <div
      className={className}
      role="group"
      aria-label="Maintenance status"
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, ...style }}
    >
      {visible.map(({ rule, due }) => (
        <MaintenanceBadge key={rule.id} rule={rule} due={due} />
      ))}
      {overflow > 0 && (
        <span
          aria-label={`${overflow} more maintenance items`}
          title={`${overflow} more`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '1px 6px',
            fontSize: 10,
            lineHeight: '14px',
            fontWeight: 500,
            color: 'var(--wc-text-muted)',
            border: '1px solid var(--wc-border)',
            borderRadius: 'var(--wc-radius-sm, 4px)',
          }}
        >+{overflow}</span>
      )}
    </div>
  );
}

function smallestRemaining(due: DueResult): number {
  const xs: number[] = [];
  if (due.miles)  xs.push(due.miles.remaining);
  if (due.hours)  xs.push(due.hours.remaining);
  if (due.cycles) xs.push(due.cycles.remaining);
  if (due.days)   xs.push(due.days.remaining);
  return xs.length ? Math.min(...xs) : Number.POSITIVE_INFINITY;
}

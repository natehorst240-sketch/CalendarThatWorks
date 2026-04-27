import cls from './DayWindowPills.module.css';

const DEFAULT_OPTIONS = [7, 14, 30, 90] as const;

export type DayWindowPillsProps = {
  /**
   * Currently selected day window (in days), or `null` for the "auto" /
   * view-default state where no numeric pill is highlighted (the explicit
   * "Auto" pill is active instead).
   */
  value: number | null;
  /**
   * Called when the user picks a different window. `null` means "auto" —
   * the consumer should restore the view's intrinsic span (TimelineView /
   * BaseGanttView / AssetsView fall back to their calendar-month default).
   */
  onChange: (next: number | null) => void;
  /**
   * Pill options to render. Defaults to [7, 14, 30, 90]. Order is preserved.
   * The "Auto" pill is always rendered first regardless of this list.
   */
  options?: readonly number[];
};

/**
 * Day-window pill set. A segmented selector that picks how many days the
 * timeline-style views (Schedule / Base / Assets) span at once.
 *
 * The first pill is "Auto" — selecting it clears the override and lets the
 * view fall back to its intrinsic range (the calendar month around
 * currentDate). Without this, users who clicked any numeric pill could not
 * return to the auto state without remounting the calendar.
 *
 * Layout-only — the consuming hook owns the underlying state. Styling uses
 * theme tokens so all 12 themes restyle automatically.
 */
export function DayWindowPills({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
}: DayWindowPillsProps) {
  const autoActive = value === null;
  return (
    <div className={cls['root']} role="group" aria-label="Day window">
      <button
        type="button"
        className={[cls['pill'], autoActive && cls['active']].filter(Boolean).join(' ')}
        aria-pressed={autoActive}
        onClick={() => onChange(null)}
        title="Show the view's default range"
      >
        Auto
      </button>
      {options.map(n => {
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            className={[cls['pill'], active && cls['active']].filter(Boolean).join(' ')}
            aria-pressed={active}
            onClick={() => onChange(n)}
            title={`Show ${n} day${n === 1 ? '' : 's'}`}
          >
            {n} day
          </button>
        );
      })}
    </div>
  );
}

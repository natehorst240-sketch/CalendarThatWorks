import cls from './DayWindowPills.module.css';

const DEFAULT_OPTIONS = [7, 14, 30, 90] as const;

export type DayWindowPillsProps = {
  /**
   * Currently selected day window (in days), or `null` for the "auto" /
   * view-default state where no pill is highlighted.
   */
  value: number | null;
  /** Called when the user picks a different window. */
  onChange: (next: number) => void;
  /**
   * Pill options to render. Defaults to [7, 14, 30, 90]. Order is preserved.
   */
  options?: readonly number[];
};

/**
 * Day-window pill set. A segmented selector that picks how many days the
 * timeline-style views (Schedule / Base / Assets) span at once.
 *
 * Layout-only — the consuming hook owns the underlying state. Styling uses
 * theme tokens so all 12 themes restyle automatically.
 */
export function DayWindowPills({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
}: DayWindowPillsProps) {
  return (
    <div className={cls['root']} role="group" aria-label="Day window">
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

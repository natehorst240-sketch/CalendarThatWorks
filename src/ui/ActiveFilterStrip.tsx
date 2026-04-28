/**
 * ActiveFilterStrip — single-line summary of currently-applied filters.
 *
 * Renders nothing when no filters are active. When active, shows one
 * removable chip per filter value ("Categories: Pilot Shift ✕"), so
 * users can answer "what is this calendar showing?" without opening
 * the sidebar's Focus tab.
 *
 * Wraps the existing `buildActiveFilterPills` helper from
 * `src/filters/filterState.ts` — the same builder FilterBar uses
 * internally — so the chip set always matches the live filter state.
 *
 * Mirrors FilterBar's pillRemove logic but is decoupled so the strip
 * can render even when FilterBar is hidden (which is the default since
 * the move to FilterGroupSidebar).
 */
import { X } from 'lucide-react';
import { buildActiveFilterPills, clearFilterValue } from '../filters/filterState';
import styles from './ActiveFilterStrip.module.css';

type FieldLike = { key: string; type?: string; defaultValue?: unknown };

export type ActiveFilterStripProps = {
  filters: Record<string, unknown>;
  schema: FieldLike[];
  /** Toggle a single value off (multi-select). */
  onChange: (key: string, value: unknown) => void;
  /** Clear an entire filter (for non-multi-select fields). */
  onClear: (key: string) => void;
  /** Optional: clear-all link at the end of the strip. */
  onClearAll?: (() => void) | undefined;
};

export default function ActiveFilterStrip({
  filters,
  schema,
  onChange,
  onClear,
  onClearAll,
}: ActiveFilterStripProps): JSX.Element | null {
  const pills = buildActiveFilterPills(filters, schema);
  if (pills.length === 0) return null;

  return (
    <div className={styles['strip']} role="status" aria-live="polite">
      <span className={styles['label']}>Filtered by</span>
      {pills.map((pill, i) => {
        const field = schema.find(f => f.key === pill.key);
        return (
          <span key={`${pill.key}-${i}`} className={styles['pill']}>
            <span className={styles['pillField']}>{pill.fieldLabel}:</span>
            <span className={styles['pillValue']}>{pill.displayValue ?? String(pill.value)}</span>
            <button
              className={styles['remove']}
              onClick={() => {
                const current = filters[pill.key];
                if (current instanceof Set) {
                  const next = new Set(current);
                  next.delete(pill.value);
                  onChange(pill.key, next.size ? next : clearFilterValue(field));
                } else {
                  onClear(pill.key);
                }
              }}
              aria-label={`Remove filter ${pill.fieldLabel}`}
              type="button"
            >
              <X size={10} />
            </button>
          </span>
        );
      })}
      {onClearAll && (
        <button
          type="button"
          className={styles['clearAll']}
          onClick={onClearAll}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

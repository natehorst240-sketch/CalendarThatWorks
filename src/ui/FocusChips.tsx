/**
 * FocusChips — visible quick-filter chip strip (issue #268 Task 4).
 *
 * Mental model: "Focus" is a first-class, always-visible row of one-tap
 * filter chips. No panel-opening required. Each chip maps to a set of
 * category ids; clicking atomically toggles the full set on/off in the
 * calendar's `categories` filter (which is the default schema key used
 * by buildDefaultFilterSchema).
 *
 * When nothing is active, all events show (normal calendar behavior).
 * When any chip is active, only events in the union of active chips'
 * categories render.
 */
import { MapPin, Plane, Package } from 'lucide-react';
import styles from './FocusChips.module.css';

export type FocusChipDef = {
  /** Stable id, used for keys and aria. */
  id: string;
  /** Short label, e.g. "Region". */
  label: string;
  /** Categories this chip toggles on the `categories` filter. */
  categories: string[];
  /** Optional icon name (bundled set). Falls back to no icon. */
  icon?: 'map-pin' | 'plane' | 'package';
};

/**
 * Default chip list for operational Air EMS calendars. Hosts can override via
 * the `focusChips` prop on <WorksCalendar />.
 *
 * - Region        → base-context events (anchor events per base/region)
 * - Aircraft Type → aviation flight-operation categories
 * - Asset Requests → request events only
 */
export const DEFAULT_FOCUS_CHIPS: FocusChipDef[] = [
  {
    id: 'region',
    label: 'Region',
    categories: ['base-event'],
    icon: 'map-pin',
  },
  {
    id: 'aircraft-type',
    label: 'Aircraft Type',
    categories: ['pilot-shift', 'mission-assignment', 'training'],
    icon: 'plane',
  },
  {
    id: 'asset-requests',
    label: 'Asset Requests',
    categories: ['aircraft-request', 'asset-request'],
    icon: 'package',
  },
];

const ICON_MAP = {
  'map-pin': MapPin,
  plane: Plane,
  package: Package,
} as const;

export type FocusChipsProps = {
  chips?: FocusChipDef[];
  /** Current active categories Set (from cal.filters.categories). */
  activeCategories: Set<string> | undefined | null;
  /** Replace the active-categories set. */
  onCategoriesChange: (next: Set<string>) => void;
};

/** Returns the labels of all chips whose categories are fully active. */
export function resolveActiveChipLabels(
  chips: FocusChipDef[],
  active: Set<string> | null | undefined,
): string[] {
  return chips
    .filter(chip => chipIsActive(chip, active))
    .map(chip => chip.label);
}

/** A chip is "active" only when every one of its categories is in the set. */
function chipIsActive(chip: FocusChipDef, active: Set<string> | null | undefined): boolean {
  if (!active || active.size === 0) return false;
  return chip.categories.every(c => active.has(c));
}

/**
 * Atomically toggle a chip's categories:
 *   - fully active → remove all of them
 *   - partial or inactive → add any missing ones (treat the chip as one unit)
 */
function toggleChip(chip: FocusChipDef, active: Set<string> | null | undefined): Set<string> {
  const next = new Set(active ?? []);
  if (chipIsActive(chip, next)) {
    chip.categories.forEach(c => next.delete(c));
  } else {
    chip.categories.forEach(c => next.add(c));
  }
  return next;
}

export default function FocusChips({
  chips = DEFAULT_FOCUS_CHIPS,
  activeCategories,
  onCategoriesChange,
}: FocusChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className={styles.row} role="toolbar" aria-label="Focus filters">
      <span className={styles.label}>Focus</span>
      {chips.map(chip => {
        const Icon = chip.icon ? ICON_MAP[chip.icon] : null;
        const active = chipIsActive(chip, activeCategories);
        return (
          <button
            key={chip.id}
            type="button"
            className={[styles.chip, active && styles.chipActive].filter(Boolean).join(' ')}
            onClick={() => onCategoriesChange(toggleChip(chip, activeCategories))}
            aria-pressed={active}
            title={`Focus on ${chip.label.toLowerCase()}`}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            <span>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}

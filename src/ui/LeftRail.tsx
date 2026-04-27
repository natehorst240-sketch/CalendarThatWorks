import { VIEW_ICON_MAP } from './viewIcons';
import cls from './LeftRail.module.css';

export type LeftRailItem = {
  /** View id; must match a key in VIEW_ICON_MAP (otherwise the row is skipped). */
  id: string;
  /** Optional richer tooltip; falls back to the icon's accessible label. */
  hint?: string;
};

export type LeftRailProps = {
  /** Ordered list of views to render. */
  items: LeftRailItem[];
  /** Currently active view id. Marked aria-pressed=true. */
  activeId: string;
  /** Called when the user picks a view. */
  onSelect: (id: string) => void;
};

/**
 * LeftRail — fixed-width icon column rendered in <AppShell>'s leftRail slot.
 * Each button maps a view id to its lucide icon via VIEW_ICON_MAP. Layout-
 * only — the consumer owns the items list and the active selection.
 *
 * Buttons are intentionally aria-labelled with the descriptive form from
 * VIEW_ICON_MAP (e.g. "Schedule view") rather than the bare label
 * ("Schedule"), so they don't collide with the AppHeader view-tab pills
 * in role/name accessibility queries.
 */
export function LeftRail({ items, activeId, onSelect }: LeftRailProps) {
  return (
    <nav className={cls['root']} aria-label="Calendar views">
      {items.map(item => {
        const entry = VIEW_ICON_MAP[item.id];
        if (!entry) return null;
        const Icon = entry.Icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={[cls['btn'], active && cls['active']].filter(Boolean).join(' ')}
            onClick={() => onSelect(item.id)}
            aria-pressed={active}
            aria-label={entry.label}
            title={item.hint ?? entry.label}
          >
            <Icon size={18} aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}

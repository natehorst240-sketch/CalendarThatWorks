import type { ReactNode } from 'react';
import cls from './LeftRail.module.css';

export type LeftRailAction = {
  /** Stable identifier (used as React key + the action's payload). */
  id: string;
  /** Accessible name; falls back to `hint` if hint is not provided. */
  label: string;
  /** Pre-rendered icon (e.g. `<Bookmark size={18} aria-hidden="true" />`). */
  icon: ReactNode;
  /** Tooltip (`title`) text. Defaults to `label` when omitted. */
  hint?: string;
  /** When true, paints the accent active treatment. */
  active?: boolean;
  /** Click handler. */
  onClick: () => void;
};

export type LeftRailProps = {
  /** Ordered list of actions to render. */
  actions: LeftRailAction[];
};

/**
 * LeftRail — fixed-width icon column rendered in <AppShell>'s leftRail slot.
 *
 * Layout-only: the consumer hands in the actions and owns their wiring.
 * Each action gets a 40px icon button with an accent active treatment
 * (border-left + surface-2 background) when `active` is true.
 *
 * Earlier iterations of the rail mirrored the AppHeader view-tab pills
 * (one icon per CalendarView), which made the rail and the centered tabs
 * compete for the same picker. Now the rail is intentionally orthogonal:
 * it surfaces drawer / panel actions that don't have a top-bar tab — the
 * view picker stays the AppHeader's job.
 */
export function LeftRail({ actions }: LeftRailProps) {
  return (
    <nav className={cls['root']} aria-label="Quick actions">
      {actions.map(action => (
        <button
          key={action.id}
          type="button"
          className={[cls['btn'], action.active && cls['active']].filter(Boolean).join(' ')}
          onClick={action.onClick}
          aria-pressed={action.active ?? false}
          aria-label={action.label}
          title={action.hint ?? action.label}
        >
          {action.icon}
        </button>
      ))}
    </nav>
  );
}

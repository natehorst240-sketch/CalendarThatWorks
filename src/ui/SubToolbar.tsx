import type { ReactNode } from 'react';
import cls from './SubToolbar.module.css';

export type SubToolbarProps = {
  /** Left zone — primary data actions (e.g. Add, Filter trigger). */
  leftSlot?: ReactNode;
  /** Center zone — view-scoped controls (e.g. day-window pill set). */
  centerSlot?: ReactNode;
  /** Right zone — secondary actions (e.g. Import, Export, Save view). */
  rightSlot?: ReactNode;
};

/**
 * Sub-toolbar that lives inside the calendar card, above the view grid.
 *
 * Three layout-only zones — content is provided by the consumer so the
 * shell stays agnostic to which buttons exist in each surface (calendar
 * top-level vs. embedder-supplied custom toolbars).
 */
export function SubToolbar({ leftSlot, centerSlot, rightSlot }: SubToolbarProps) {
  return (
    <div className={cls['root']} role="toolbar" aria-label="Calendar actions">
      <div className={cls['left']}>{leftSlot}</div>
      <div className={cls['center']}>{centerSlot}</div>
      <div className={cls['right']}>{rightSlot}</div>
    </div>
  );
}

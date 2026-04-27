import type { ReactNode } from 'react';
import cls from './AppShell.module.css';

export type AppShellProps = {
  /** Top header band, full-width above the body. */
  header: ReactNode;
  /** Main content column between the optional left rail and right panel. */
  main: ReactNode;
  /** Optional fixed-width left icon rail. Omit to render no rail. */
  leftRail?: ReactNode;
  /** Optional fixed-width right panel. Omit to render no panel. */
  rightPanel?: ReactNode;
};

/**
 * Three-column dashboard shell scaffold.
 *
 * Header is always rendered above a body row that holds main and (optionally)
 * a left rail / right panel. Slots that are not provided take no space, so a
 * shell with only `header` + `main` lays out identically to a plain stacked
 * column.
 */
export function AppShell({ header, main, leftRail, rightPanel }: AppShellProps) {
  return (
    <div className={cls['shell']}>
      <div className={cls['headerBand']}>{header}</div>
      <div className={cls['body']}>
        {leftRail !== undefined && <aside className={cls['leftRail']}>{leftRail}</aside>}
        <div className={cls['main']}>{main}</div>
        {rightPanel !== undefined && <aside className={cls['rightPanel']}>{rightPanel}</aside>}
      </div>
    </div>
  );
}

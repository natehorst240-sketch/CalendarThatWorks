import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import cls from './AppHeader.module.css';

export type AppHeaderMenuItem = {
  /** Visible label (top line). */
  label: string;
  /** Optional sub-label (smaller, second line). */
  sub?: string;
  /** Click handler. AppHeader closes the dropdown before invoking. */
  onClick: () => void;
};

export type AppHeaderProps = {
  /** Left zone — branding + nav cluster. */
  leftSlot?: ReactNode;
  /** Center zone — view-tab pills. */
  centerSlot?: ReactNode;
  /** Right zone — system actions. */
  rightSlot?: ReactNode;
  /** Hamburger menu items. Empty / omitted hides the hamburger entirely. */
  menuItems?: AppHeaderMenuItem[];
};

/**
 * Top header band. Three layout zones (left / center / right) plus an
 * optional hamburger dropdown anchored at the very start of the left zone.
 * Slots are layout-only; the consumer owns content + state.
 *
 * role="toolbar" + aria-label="Calendar navigation" is preserved on the
 * root so existing a11y queries keep working.
 */
export function AppHeader({ leftSlot, centerSlot, rightSlot, menuItems }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const hasMenu = !!menuItems && menuItems.length > 0;

  return (
    <div className={cls['root']} role="toolbar" aria-label="Calendar navigation">
      <div className={cls['left']}>
        {hasMenu && (
          <div ref={menuWrapRef} className={cls['menuWrap']}>
            <button
              type="button"
              className={cls['menuBtn']}
              aria-label={menuOpen ? 'Close main menu' : 'Open main menu'}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            {menuOpen && (
              <div className={cls['dropdown']} role="menu">
                {menuItems!.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={cls['dropdownItem']}
                    onClick={() => {
                      setMenuOpen(false);
                      item.onClick();
                    }}
                  >
                    <span className={cls['dropdownLabel']}>{item.label}</span>
                    {item.sub && <span className={cls['dropdownSub']}>{item.sub}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {leftSlot}
      </div>
      <div className={cls['center']}>{centerSlot}</div>
      <div className={cls['right']}>{rightSlot}</div>
    </div>
  );
}

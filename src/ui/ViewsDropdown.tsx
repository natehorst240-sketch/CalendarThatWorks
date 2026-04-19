/**
 * ViewsDropdown — "All Views ▾" popover listing every saved view.
 *
 * Each row has:
 *   - a visibility checkbox that toggles whether the view appears as a chip
 *     in the ProfileBar strip
 *   - a clickable name that applies the view's filters
 */
import { useEffect, useRef, useState } from 'react';
import {
  BookmarkCheck, Bookmark, Eye, EyeOff, ChevronDown,
  CalendarDays, Calendar, Columns3, List, CalendarRange, Boxes,
} from 'lucide-react';
import styles from './ProfileBar.module.css';

const VIEW_ICON_MAP = {
  month:    CalendarDays,
  week:     Columns3,
  day:      Calendar,
  agenda:   List,
  schedule: CalendarRange,
  assets:   Boxes,
};

export default function ViewsDropdown({
  views,
  activeId,
  onApply,
  onToggleVisibility,
}: any) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const hiddenCount = views.filter((v: any) => v.hiddenFromStrip).length;

  return (
    <div ref={rootRef} className={styles.headerControl}>
      <button
        type="button"
        className={styles.headerBtn}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bookmark size={13} />
        <span>All views</span>
        {hiddenCount > 0 && (
          <span className={styles.headerBtnBadge}>{views.length - hiddenCount}/{views.length}</span>
        )}
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.dropdownPanel} role="menu" aria-label="All saved views">
          {views.length === 0 ? (
            <p className={styles.dropdownEmpty}>
              No saved views yet — click Save view to create one.
            </p>
          ) : (
            <ul className={styles.dropdownList}>
              {views.map((view: any) => {
                const ViewIcon = view.view ? VIEW_ICON_MAP[view.view] : null;
                const isActive = view.id === activeId;
                const isHidden = !!view.hiddenFromStrip;
                const color = view.color ?? '#64748b';
                return (
                  <li key={view.id} className={styles.dropdownRow}>
                    <button
                      type="button"
                      className={styles.dropdownVisibilityBtn}
                      onClick={() => onToggleVisibility(view.id)}
                      aria-pressed={!isHidden}
                      aria-label={isHidden ? `Show ${view.name} in quick views` : `Hide ${view.name} from quick views`}
                      title={isHidden ? 'Show in quick views' : 'Hide from quick views'}
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownApplyBtn}
                      onClick={() => {
                        onApply(view);
                        setOpen(false);
                      }}
                      role="menuitem"
                    >
                      <span
                        className={styles.dropdownColorDot}
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      {isActive
                        ? <BookmarkCheck size={12} className={styles.dropdownIcon} />
                        : <Bookmark size={12} className={styles.dropdownIcon} />
                      }
                      <span className={styles.dropdownName}>{view.name}</span>
                      {ViewIcon && <ViewIcon size={11} className={styles.dropdownViewIcon} aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

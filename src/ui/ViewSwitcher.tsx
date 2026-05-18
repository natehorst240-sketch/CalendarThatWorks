/**
 * Compact view-switcher pill row for views that own their own chrome
 * (e.g. the dispatch board). Renders the same Month/Week/.../Dispatch
 * tabs the host calendar's toolbar would, but in a tight inline pill
 * suitable for slotting into a view's own header bar.
 *
 * Stays headless — accepts the view list + current selection + change
 * handler, no calendar-context plumbing.
 */
import { useEffect, useRef } from 'react';
import type { ViewDef } from '../core/calendarViewConfig';

export interface ViewSwitcherProps {
  readonly views: readonly ViewDef[];
  readonly currentView: string;
  readonly onViewChange: (id: string) => void;
  /** Optional className for the outer container. */
  readonly className?: string;
}

export function ViewSwitcher({ views, currentView, onViewChange, className }: ViewSwitcherProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  // Keep the active tab visible when the switcher is narrow enough to
  // scroll horizontally (mobile widths). Done manually instead of via
  // scrollIntoView so the surrounding page scroll position isn't
  // perturbed when the active tab lives off-screen on first render.
  useEffect(() => {
    const c = containerRef.current;
    const b = activeRef.current;
    if (!c || !b) return;
    const target = b.offsetLeft - (c.clientWidth - b.offsetWidth) / 2;
    c.scrollLeft = Math.max(0, target);
  }, [currentView]);
  return (
    <div
      ref={containerRef}
      className={className}
      role="group"
      aria-label="Calendar view"
      style={{
        display: 'flex',
        flex: '1 1 auto',
        minWidth: 0,
        alignItems: 'center',
        gap: 2,
        padding: 2,
        border: '1px solid rgba(61, 43, 31, 0.2)',
        borderRadius: 6,
        background: 'rgba(245, 230, 200, 0.6)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {views.map((v) => {
        const active = v.id === currentView;
        return (
          <button
            key={v.id}
            ref={active ? activeRef : undefined}
            type="button"
            onClick={() => onViewChange(v.id)}
            aria-pressed={active}
            title={v.hint ?? v.label}
            data-wc-view-button={v.id}
            style={{
              flex: '0 0 auto',
              height: 22,
              padding: '0 8px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              border: 0,
              borderRadius: 4,
              cursor: 'pointer',
              color: active ? '#f5e6c8' : '#3d2b1f',
              background: active ? '#3d2b1f' : 'transparent',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * useFocusTrap — accessibility focus management for modal dialogs.
 *
 * Traps Tab / Shift+Tab within the container, auto-focuses the first
 * focusable element on mount, restores focus to the previously-active
 * element on unmount, and calls onEscape when the user presses Escape.
 *
 * Usage:
 *   const trapRef = useFocusTrap(onClose);
 *   <div ref={trapRef} role="dialog" aria-modal="true"> … </div>
 */

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Returns true when the element is interactive and reachable by the user.
 * Filters out elements that are:
 *  - hidden via the HTML `hidden` attribute
 *  - inside an `aria-hidden="true"` subtree
 *  - inside an `inert` subtree
 *  - made invisible via CSS display:none or visibility:hidden
 */
function isVisible(el) {
  if (el.hidden) return false;
  if (el.closest('[hidden]')) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  // Use feature-detect for `inert` with aria-hidden fallback
  if (typeof el.inert === 'boolean' ? el.closest('[inert]') : el.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (el.getClientRects().length === 0) return false;
  return true;
}

/**
 * @param {(() => void) | null | undefined} onEscape  Called when Escape is pressed.
 * @param {boolean} [active=true]  Set false to temporarily suspend the trap.
 * @returns {React.RefObject<HTMLElement>}  Attach to the dialog container element.
 */
export function useFocusTrap(onEscape, active = true) {
  const containerRef = useRef(null);
  // Keep a stable ref to the callback so the effect dep array stays stable.
  const onEscapeRef  = useRef(onEscape);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    // Remember what had focus so we can restore it on unmount.
    const previouslyFocused = document.activeElement;

    // Auto-focus the first visible focusable child (skip if something inside
    // is already focused, e.g. via autoFocus prop on an input).
    if (!el.contains(document.activeElement)) {
      const first = [...el.querySelectorAll(FOCUSABLE_SELECTORS)].find(isVisible);
      first?.focus();
    }

    function handleKeyDown(e) {
      if (!el.contains(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = [...el.querySelectorAll(FOCUSABLE_SELECTORS)].filter(isVisible);
      if (!focusables.length) return;

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Capture phase so we intercept before any child stops propagation.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Restore focus when the dialog unmounts.
      if (previouslyFocused && typeof (previouslyFocused as HTMLElement).focus === 'function') {
        (previouslyFocused as HTMLElement).focus();
      }
    };
  }, [active]);

  return containerRef;
}

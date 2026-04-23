import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.closest('[hidden]')) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  if (typeof (el as HTMLElement & { inert?: boolean }).inert === 'boolean') {
    if (el.closest('[inert]')) return false;
  } else if (el.closest('[aria-hidden="true"]')) {
    return false;
  }

  const style = getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (el.getClientRects().length === 0) return false;
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(isVisible);
}

function canFocus(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement && typeof value.focus === 'function';
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  onEscape?: (() => void) | null,
  active = true,
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const onEscapeRef = useRef<(() => void) | null | undefined>(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;

    const el = containerRef.current;
    if (!el) return;

    const previouslyFocused = document.activeElement;

    if (!el.contains(document.activeElement)) {
      const first = getFocusableElements(el)[0];
      first?.focus();
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (!el.contains(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusables = getFocusableElements(el);
      const first = focusables[0];
      const last = focusables.at(-1);

      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (canFocus(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}

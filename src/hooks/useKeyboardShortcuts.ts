/**
 * useKeyboardShortcuts — global single-key shortcuts for navigating the
 * calendar without ever leaving the keyboard.
 *
 * Bindings (also surfaced in KeyboardHelpOverlay):
 *   1 / 2 / 3 / 4 / 5 / 6   → Month / Week / Day / Agenda / Schedule / Assets
 *   t                       → Today
 *   j  or  ArrowRight       → Next period
 *   k  or  ArrowLeft        → Previous period
 *   ?  or  Shift+/          → Open keyboard help
 *
 * Guards:
 *   - Skips when focus is inside an input / textarea / select / contentEditable
 *   - Skips when any modifier key (Ctrl / Meta / Alt) is held
 *   - Skips when an aria-modal dialog is open (lets ConfigPanel, EventForm,
 *     OwnerLoginModal, etc. own the keyboard while they're up)
 */
import { useEffect } from 'react';

const VIEW_KEYS = {
  '1': 'month',
  '2': 'week',
  '3': 'day',
  '4': 'agenda',
  '5': 'schedule',
  '6': 'assets',
};

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function hasOpenModal() {
  return !!document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"]');
}

/**
 * @param {object} api
 * @param {(view: string) => void} api.setView
 * @param {(direction: number) => void} api.navigate
 * @param {() => void} api.goToToday
 * @param {() => void} api.openHelp
 * @param {boolean} [api.enabled=true]
 */
export function useKeyboardShortcuts(api) {
  const { setView, navigate, goToToday, openHelp, enabled = true } = api;

  useEffect(() => {
    if (!enabled) return;

    function handler(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      if (hasOpenModal()) return;

      // View switches: digits 1..6
      if (Object.prototype.hasOwnProperty.call(VIEW_KEYS, e.key)) {
        e.preventDefault();
        setView?.(VIEW_KEYS[e.key]);
        return;
      }

      switch (e.key) {
        case 't':
        case 'T':
          e.preventDefault();
          goToToday?.();
          return;
        case 'j':
        case 'ArrowRight':
          e.preventDefault();
          navigate?.(1);
          return;
        case 'k':
        case 'ArrowLeft':
          e.preventDefault();
          navigate?.(-1);
          return;
        case '?':
          e.preventDefault();
          openHelp?.();
          return;
        default:
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled, setView, navigate, goToToday, openHelp]);
}

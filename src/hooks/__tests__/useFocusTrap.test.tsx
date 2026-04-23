/**
 * useFocusTrap — unit tests for hidden / inert / aria-hidden edge cases.
 *
 * Verifies that the trap never lands focus on elements that are not
 * visually or interactively reachable (display:none, visibility:hidden,
 * hidden attribute, aria-hidden="true" ancestor, inert ancestor).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../useFocusTrap';

/* ── tiny helper component ──────────────────────────────────────────────── */

function Trap({ onEscape, children, active = true }: {
  onEscape?: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  const ref = useFocusTrap(onEscape, active);
  return (
    <div ref={ref} role="dialog" aria-modal="true" data-testid="trap">
      {children}
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function requireElement<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function tabForward(element: Element | null = document.activeElement) {
  fireEvent.keyDown(requireElement(element, 'Expected focused element for Tab'), {
    key: 'Tab',
    shiftKey: false,
  });
}

function tabBackward(element: Element | null = document.activeElement) {
  fireEvent.keyDown(requireElement(element, 'Expected focused element for Shift+Tab'), {
    key: 'Tab',
    shiftKey: true,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   Basic trap behaviour
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — basic behaviour', () => {
  it('auto-focuses the first focusable child on mount', () => {
    render(
      <Trap>
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
      </Trap>,
    );
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('calls onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    render(
      <Trap onEscape={onEscape}>
        <button>OK</button>
      </Trap>,
    );
    fireEvent.keyDown(
      requireElement(document.activeElement, 'Expected active element for Escape'),
      { key: 'Escape' },
    );
    expect(onEscape).toHaveBeenCalledOnce();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Hidden inputs — display:none
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — display:none inputs skipped', () => {
  it('does not auto-focus a display:none button', () => {
    render(
      <Trap>
        <button style={{ display: 'none' }} data-testid="hidden">Hidden</button>
        <button data-testid="visible">Visible</button>
      </Trap>,
    );
    // auto-focus should land on the visible button, not the hidden one
    expect(screen.getByTestId('visible')).toHaveFocus();
  });

  it('does not auto-focus a visibility:hidden button', () => {
    render(
      <Trap>
        <button style={{ visibility: 'hidden' }} data-testid="hidden-v">Hidden</button>
        <button data-testid="visible">Visible</button>
      </Trap>,
    );
    expect(screen.getByTestId('visible')).toHaveFocus();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Hidden inputs — HTML hidden attribute
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — [hidden] attribute skipped', () => {
  it('skips a button with the hidden attribute during auto-focus', () => {
    render(
      <Trap>
        <button hidden data-testid="hidden">Hidden</button>
        <button data-testid="visible">Visible</button>
      </Trap>,
    );
    expect(screen.getByTestId('visible')).toHaveFocus();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   aria-hidden="true" ancestor
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — aria-hidden subtree skipped', () => {
  it('does not auto-focus a button inside aria-hidden="true"', () => {
    render(
      <Trap>
        <div aria-hidden="true">
          <button data-testid="aria-hidden-btn">Aria hidden</button>
        </div>
        <button data-testid="visible">Visible</button>
      </Trap>,
    );
    expect(screen.getByTestId('visible')).toHaveFocus();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   inert attribute
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — inert attribute skipped', () => {
  it('does not auto-focus a button inside an inert subtree', () => {
    render(
      <Trap>
        <div inert="">
          <button data-testid="inert-btn">Inert</button>
        </div>
        <button data-testid="visible">Visible</button>
      </Trap>,
    );
    expect(screen.getByTestId('visible')).toHaveFocus();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   All-disabled form — no focusable elements
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — all-disabled form', () => {
  it('does not throw when every input is disabled', () => {
    expect(() =>
      render(
        <Trap>
          <input disabled />
          <button disabled>Submit</button>
        </Trap>,
      ),
    ).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Tab cycling wraps through visible elements only
═══════════════════════════════════════════════════════════════════════════ */

describe('useFocusTrap — Tab cycles through visible elements only', () => {
  it('wraps from last visible to first visible, skipping hidden', () => {
    render(
      <Trap>
        <button data-testid="a">A</button>
        <button style={{ display: 'none' }} data-testid="hidden">Hidden</button>
        <button data-testid="b">B</button>
      </Trap>,
    );

    // auto-focus → A
    const a = screen.getByTestId('a');
    const b = screen.getByTestId('b');
    expect(a).toHaveFocus();

    // Tab forward from B should wrap to A (hidden button excluded)
    b.focus();
    tabForward(b);
    expect(a).toHaveFocus();
  });

  it('Shift+Tab from first visible wraps to last visible, skipping hidden', () => {
    render(
      <Trap>
        <button data-testid="a">A</button>
        <button hidden data-testid="hidden">Hidden</button>
        <button data-testid="b">B</button>
      </Trap>,
    );

    const a = screen.getByTestId('a');
    const b = screen.getByTestId('b');

    // Shift+Tab from A should wrap to B (hidden button excluded)
    a.focus();
    tabBackward(a);
    expect(b).toHaveFocus();
  });
});

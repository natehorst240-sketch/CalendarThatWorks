// @vitest-environment happy-dom
/**
 * OwnerLoginModal — focused password gate (Day 3 sprint).
 *
 * The modal replaces the inline OwnerLock popover. We verify it acts like a
 * proper dialog: aria-modal, focus trap, Escape closes, Cancel closes, and
 * submitting the form forwards the password to the parent.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import OwnerLoginModal from '../OwnerLoginModal';

function requireElement<T>(value: T | null, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

function mount(props = {}) {
  return render(
    <OwnerLoginModal
      authError={null}
      isAuthLoading={false}
      onAuthenticate={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe('OwnerLoginModal', () => {
  it('renders an aria-modal dialog labelled "Owner settings"', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Owner settings' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('auto-focuses the password input', () => {
    mount();
    const input = screen.getByLabelText('Owner password');
    expect(document.activeElement).toBe(input);
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.keyDown(requireElement(document.activeElement, 'Expected active element'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('submitting forwards the password to onAuthenticate', () => {
    const onAuthenticate = vi.fn();
    mount({ onAuthenticate });
    const input = screen.getByLabelText('Owner password');
    fireEvent.change(input, { target: { value: 'hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(onAuthenticate).toHaveBeenCalledWith('hunter2');
  });

  it('Unlock is disabled until a password is typed', () => {
    mount();
    const submit = screen.getByRole('button', { name: 'Unlock' });
    expect(submit).toBeDisabled();
    const input = screen.getByLabelText('Owner password');
    fireEvent.change(input, { target: { value: 'x' } });
    expect(submit).not.toBeDisabled();
  });

  it('renders authError as an alert when provided', () => {
    mount({ authError: 'Wrong password' });
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong password');
  });

  it('Tab cycles focus inside the dialog', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Owner settings' });
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(requireElement(document.activeElement, 'Expected active element'), { key: 'Tab' });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

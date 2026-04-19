// @vitest-environment happy-dom
/**
 * KeyboardHelpOverlay — discoverability cheat sheet (Day 4 sprint).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import KeyboardHelpOverlay from '../KeyboardHelpOverlay';

describe('KeyboardHelpOverlay', () => {
  it('renders an aria-modal dialog labelled "Keyboard shortcuts"', () => {
    render(<KeyboardHelpOverlay onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('lists each view-switch digit binding', () => {
    render(<KeyboardHelpOverlay onClose={vi.fn()} />);
    for (const label of ['Month', 'Week', 'Day', 'Agenda', 'Schedule', 'Assets']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardHelpOverlay onClose={onClose} />);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Close button calls onClose', () => {
    const onClose = vi.fn();
    render(<KeyboardHelpOverlay onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close keyboard help' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

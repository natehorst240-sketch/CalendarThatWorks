// @vitest-environment happy-dom
/**
 * ConfigPanel — focus trap + Escape close (Day 3 sprint).
 *
 * The settings panel is a modal dialog: focus should stay inside while the
 * user tabs around, Escape should call onClose, and the section that owns
 * the deep-linked tab should auto-expand so its tab buttons are reachable.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import ConfigPanel from '../ConfigPanel';
import { DEFAULT_CONFIG } from '../../core/configSchema';

function requireElement<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function mount(props = {}) {
  return render(
    <ConfigPanel
      config={DEFAULT_CONFIG}
      schema={{ fields: [] }}
      items={[]}
      categories={[]}
      resources={[]}
      onUpdate={vi.fn()}
      onClose={vi.fn()}
      savedViews={[]}
      onUpdateView={vi.fn()}
      onDeleteView={vi.fn()}
      {...props}
    />,
  );
}

describe('ConfigPanel — focus trap & accordion', () => {
  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    mount({ onClose });
    fireEvent.keyDown(
      requireElement(document.activeElement, 'Expected active element for Escape'),
      { key: 'Escape' },
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('initial focus lands inside the dialog', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Calendar settings' });
    expect(
      dialog.contains(
        requireElement(document.activeElement, 'Expected active element inside dialog'),
      ),
    ).toBe(true);
  });

  it('Tab cycles focus inside the dialog instead of escaping it', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Calendar settings' });
    for (let i = 0; i < 25; i++) {
      fireEvent.keyDown(
        requireElement(document.activeElement, 'Expected active element for Tab'),
        { key: 'Tab' },
      );
      expect(
        dialog.contains(requireElement(document.activeElement, 'Expected active element after Tab')),
      ).toBe(true);
    }
  });

  it('auto-expands the section containing a deep-linked tab', () => {
    mount({ initialTab: 'requestForm' });
    // Workflows section should be open so its Request Form tab is reachable.
    const workflowsHeader = screen.getByRole('button', { name: 'Workflows' });
    expect(workflowsHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: 'Request Form' })).toHaveAttribute(
      'aria-selected', 'true',
    );
  });

  it('Appearance section is open by default and contains the Setup tab', () => {
    mount();
    const appearanceHeader = screen.getByRole('button', { name: 'Appearance' });
    expect(appearanceHeader).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: 'Setup' })).toBeInTheDocument();
  });

  it('clicking a collapsed section header expands it and reveals its tabs', () => {
    mount();
    // Data section starts collapsed. Its tabs should not be in the DOM yet.
    expect(screen.queryByRole('tab', { name: 'Assets' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Data' }));
    expect(screen.getByRole('tab', { name: 'Assets' })).toBeInTheDocument();
  });
});

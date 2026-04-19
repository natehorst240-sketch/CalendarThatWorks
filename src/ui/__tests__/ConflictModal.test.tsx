// @vitest-environment happy-dom
/**
 * ConflictModal — ticket #134-13.
 *
 * The modal is the UX for conflictEngine violations. It renders a list of
 * violations with severity + rule badges, locks the "Proceed" action when
 * any hard violation is present, and calls cancel on overlay click / Escape.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import ConflictModal from '../ConflictModal';

const softResult = {
  violations: [
    { rule: 'rest', severity: 'soft', message: 'Only 30 min rest between shifts.' },
  ],
  severity: 'soft',
  allowed: true,
};

const hardResult = {
  violations: [
    {
      rule: 'ovr',
      severity: 'hard',
      message: 'Conflicts with "X" on the same resource.',
      conflictingEventId: 'x1',
    },
  ],
  severity: 'hard',
  allowed: false,
};

describe('ConflictModal — rendering', () => {
  it('returns null when result is null', () => {
    const { container } = render(
      <ConflictModal result={null} onProceed={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when severity is none', () => {
    const { container } = render(
      <ConflictModal
        result={{ violations: [], severity: 'none', allowed: true }}
        onProceed={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the violation message + rule id + severity tag', () => {
    render(<ConflictModal result={softResult} onProceed={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Only 30 min rest between shifts.')).toBeInTheDocument();
    expect(screen.getByText('rest')).toBeInTheDocument();
    expect(screen.getByText('soft')).toBeInTheDocument();
  });

  it('stamps the panel with data-severity', () => {
    render(<ConflictModal result={hardResult} onProceed={vi.fn()} onCancel={vi.fn()} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('data-severity', 'hard');
  });
});

describe('ConflictModal — actions', () => {
  it('Proceed is enabled for soft-only violations', () => {
    const onProceed = vi.fn();
    render(<ConflictModal result={softResult} onProceed={onProceed} onCancel={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Proceed anyway/ });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it('Proceed is disabled for hard violations', () => {
    render(<ConflictModal result={hardResult} onProceed={vi.fn()} onCancel={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Resolve to continue/ });
    expect(btn).toBeDisabled();
  });

  it('Cancel fires onCancel', () => {
    const onCancel = vi.fn();
    render(<ConflictModal result={softResult} onProceed={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Close button (×) fires onCancel', () => {
    const onCancel = vi.fn();
    render(<ConflictModal result={softResult} onProceed={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /Close conflict dialog/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

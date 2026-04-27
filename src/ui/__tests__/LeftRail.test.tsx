// @vitest-environment happy-dom
/**
 * LeftRail — fixed-width icon column in the AppShell leftRail slot.
 *
 * Pins render / active-state / dispatch / unknown-id-skip / a11y so the
 * AppShell wiring is safe to refactor.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { LeftRail } from '../LeftRail';

const ITEMS = [
  { id: 'month' },
  { id: 'week' },
  { id: 'schedule', hint: 'Staffing rotation' },
];

describe('LeftRail', () => {
  it('renders one button per known view item', () => {
    render(<LeftRail items={ITEMS} activeId="month" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Month view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Week view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule view' })).toBeInTheDocument();
  });

  it('marks the active button via aria-pressed', () => {
    render(<LeftRail items={ITEMS} activeId="schedule" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Schedule view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Month view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSelect with the picked id', () => {
    const onSelect = vi.fn();
    render(<LeftRail items={ITEMS} activeId="month" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule view' }));
    expect(onSelect).toHaveBeenCalledWith('schedule');
  });

  it('skips items whose id has no entry in VIEW_ICON_MAP', () => {
    const items = [
      ...ITEMS,
      { id: 'no-such-view' },
    ];
    render(<LeftRail items={items} activeId="month" onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /no-such-view/i })).toBeNull();
    // The known items still render.
    expect(screen.getByRole('button', { name: 'Month view' })).toBeInTheDocument();
  });

  it('uses the hint as the tooltip when provided, otherwise the icon label', () => {
    render(<LeftRail items={ITEMS} activeId="month" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Schedule view' })).toHaveAttribute('title', 'Staffing rotation');
    expect(screen.getByRole('button', { name: 'Month view' })).toHaveAttribute('title', 'Month view');
  });

  it('exposes a labelled navigation landmark', () => {
    render(<LeftRail items={ITEMS} activeId="month" onSelect={() => {}} />);
    expect(screen.getByRole('navigation', { name: /calendar views/i })).toBeInTheDocument();
  });
});

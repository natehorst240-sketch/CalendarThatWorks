// @vitest-environment happy-dom
/**
 * DayWindowPills — segmented day-window selector.
 *
 * Pins the rendering / selection / a11y contract so the sub-toolbar
 * integration is safe to refactor.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import { DayWindowPills } from '../DayWindowPills';

describe('DayWindowPills', () => {
  it('renders the default 7 / 14 / 30 / 90 options', () => {
    render(<DayWindowPills value={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '7 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '14 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 day' })).toBeInTheDocument();
  });

  it('marks the active pill via aria-pressed', () => {
    render(<DayWindowPills value={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '30 day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 day' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '14 day' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '90 day' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves every pill unpressed when value is null (auto / view default)', () => {
    render(<DayWindowPills value={null} onChange={() => {}} />);
    for (const n of [7, 14, 30, 90]) {
      expect(screen.getByRole('button', { name: `${n} day` })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('invokes onChange with the picked window', () => {
    const onChange = vi.fn();
    render(<DayWindowPills value={30} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '14 day' }));
    expect(onChange).toHaveBeenCalledWith(14);
  });

  it('exposes a labelled group for a11y trees', () => {
    render(<DayWindowPills value={30} onChange={() => {}} />);
    expect(screen.getByRole('group', { name: /day window/i })).toBeInTheDocument();
  });

  it('honours custom options', () => {
    render(<DayWindowPills value={3} onChange={() => {}} options={[1, 3, 5]} />);
    expect(screen.getByRole('button', { name: '1 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '7 day' })).toBeNull();
    expect(screen.getByRole('button', { name: '3 day' })).toHaveAttribute('aria-pressed', 'true');
  });
});

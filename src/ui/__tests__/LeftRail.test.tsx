// @vitest-environment happy-dom
/**
 * LeftRail — fixed-width icon column in the AppShell leftRail slot.
 *
 * Pins the action-rendering / active-state / dispatch / a11y contract.
 * The rail is intentionally NOT view-pickered any more (it used to mirror
 * the AppHeader view tabs) — it now surfaces drawer / panel actions that
 * don't have a top-bar tab.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { Bookmark, Filter, Settings } from 'lucide-react';

import { LeftRail } from '../LeftRail';

describe('LeftRail', () => {
  it('renders one button per action', () => {
    render(
      <LeftRail
        actions={[
          { id: 'a', label: 'Saved views', icon: <Bookmark size={18} aria-hidden="true" />, onClick: () => {} },
          { id: 'b', label: 'Focus filters', icon: <Filter size={18} aria-hidden="true" />, onClick: () => {} },
          { id: 'c', label: 'Settings', icon: <Settings size={18} aria-hidden="true" />, onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Saved views' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('marks the active action via aria-pressed=true', () => {
    render(
      <LeftRail
        actions={[
          { id: 'a', label: 'Saved views', icon: <Bookmark size={18} aria-hidden="true" />, active: false, onClick: () => {} },
          { id: 'b', label: 'Focus filters', icon: <Filter size={18} aria-hidden="true" />, active: true,  onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Focus filters' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Saved views' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('treats omitted active as not-pressed', () => {
    render(
      <LeftRail
        actions={[
          { id: 'a', label: 'Saved views', icon: <Bookmark size={18} aria-hidden="true" />, onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Saved views' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('dispatches onClick when the button is pressed', () => {
    const handler = vi.fn();
    render(
      <LeftRail
        actions={[
          { id: 'a', label: 'Saved views', icon: <Bookmark size={18} aria-hidden="true" />, onClick: handler },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Saved views' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses the hint as the tooltip when provided, otherwise the label', () => {
    render(
      <LeftRail
        actions={[
          { id: 'a', label: 'Saved views', hint: 'Open saved views drawer', icon: <Bookmark size={18} aria-hidden="true" />, onClick: () => {} },
          { id: 'b', label: 'Focus filters', icon: <Filter size={18} aria-hidden="true" />, onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Saved views' })).toHaveAttribute('title', 'Open saved views drawer');
    expect(screen.getByRole('button', { name: 'Focus filters' })).toHaveAttribute('title', 'Focus filters');
  });

  it('exposes a labelled "Quick actions" navigation landmark', () => {
    render(
      <LeftRail
        actions={[
          { id: 'a', label: 'Saved views', icon: <Bookmark size={18} aria-hidden="true" />, onClick: () => {} },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: /quick actions/i })).toBeInTheDocument();
  });
});

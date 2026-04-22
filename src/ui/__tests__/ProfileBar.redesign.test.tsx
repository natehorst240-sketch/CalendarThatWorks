// @vitest-environment happy-dom
/**
 * ProfileBar redesign — locks in the header-row behaviour introduced when
 * the inline pencil / manage-panel flow was replaced with three explicit
 * controls:
 *
 *   [All views ▾]  [Customize Quick Views ▾]  [Clear all filters]  [+ Save view]
 *
 * and the chip strip now only shows views where `!hiddenFromStrip`.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import ProfileBar from '../ProfileBar';

const VIEW_VISIBLE: any = {
  id: 'v-vis',
  name: 'Work Week',
  createdAt: new Date().toISOString(),
  color: '#3b82f6',
  view: 'week',
  filters: { categories: [], resources: [], sources: [], search: '', dateRange: null },
  hiddenFromStrip: false,
};

const VIEW_HIDDEN: any = {
  id: 'v-hid',
  name: 'Archive',
  createdAt: new Date().toISOString(),
  color: '#10b981',
  view: null,
  filters: { categories: [], resources: [], sources: [], search: '', dateRange: null },
  hiddenFromStrip: true,
};

function renderBar(overrides: Record<string, unknown> = {}) {
  const props: any = {
    views: [VIEW_VISIBLE, VIEW_HIDDEN],
    activeId: null,
    isDirty: false,
    hasActiveFilters: false,
    onApply: vi.fn(),
    onAdd: vi.fn(),
    onResave: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onToggleVisibility: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides,
  };
  const utils = render(<ProfileBar {...props} />);
  return { ...utils, props };
}

describe('ProfileBar — chip strip filters by hiddenFromStrip', () => {
  it('renders only views where hiddenFromStrip is falsy as chips', () => {
    renderBar();
    // Visible view's chip is rendered as a button with its name
    const visibleChip = screen.getByRole('button', { name: /Work Week/ });
    expect(visibleChip).toBeInTheDocument();
    // Hidden view has no chip in the strip
    expect(screen.queryByRole('button', { name: /^Archive$/ })).toBeNull();
  });

  it('omits the chip strip entirely when every view is hidden', () => {
    const { container } = renderBar({
      views: [{ ...VIEW_VISIBLE, hiddenFromStrip: true }, VIEW_HIDDEN],
    });
    // Header controls still render; no visible chip name present
    expect(screen.queryByRole('button', { name: /^Work Week$/ })).toBeNull();
    // Strip CSS-module class starts with 'strip' — sanity-check via container
    expect(container.querySelector('[class*="strip"]')).toBeNull();
  });
});

describe('ProfileBar — All Views dropdown', () => {
  it('lists every view (visible + hidden) once opened', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /All views/i }));
    const menu = screen.getByRole('menu', { name: /All saved views/i });
    expect(within(menu).getByRole('menuitem', { name: /Work Week/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Archive/ })).toBeInTheDocument();
  });

  it('clicking a row fires onApply with the saved view', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /All views/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/ }));
    expect(props.onApply).toHaveBeenCalledWith(VIEW_HIDDEN);
  });

  it('clicking the visibility toggle fires onToggleVisibility with the view id', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /All views/i }));
    const menu = screen.getByRole('menu', { name: /All saved views/i });
    fireEvent.click(within(menu).getByRole('button', { name: /Hide Work Week from quick views/i }));
    expect(props.onToggleVisibility).toHaveBeenCalledWith(VIEW_VISIBLE.id);
  });

  it('shows an empty-state message when no views exist', () => {
    renderBar({ views: [] });
    fireEvent.click(screen.getByRole('button', { name: /All views/i }));
    expect(screen.getByText(/No saved views yet/i)).toBeInTheDocument();
  });
});

describe('ProfileBar — Customize Quick Views', () => {
  it('disables the trigger when no views exist', () => {
    renderBar({ views: [] });
    const btn = screen.getByRole('button', { name: /Customize Quick Views/i });
    expect(btn).toBeDisabled();
  });

  it('exposes rename, color, resave, visibility-toggle, and delete for each view', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /Customize Quick Views/i }));

    // Rename — click pencil, change value, commit
    const renameBtn = screen.getByRole('button', { name: /Rename Work Week/i });
    fireEvent.click(renameBtn);
    const input = screen.getByDisplayValue('Work Week');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm rename/i }));
    expect(props.onUpdate).toHaveBeenCalledWith(VIEW_VISIBLE.id, { name: 'Renamed' });

    // Color — click a color dot for the visible view
    const colorButtons = screen.getAllByRole('button', { name: /Set color #10b981 for Work Week/i });
    fireEvent.click(colorButtons[0]);
    expect(props.onUpdate).toHaveBeenCalledWith(VIEW_VISIBLE.id, { color: '#10b981' });

    // Resave
    fireEvent.click(screen.getAllByRole('button', { name: /Update with current filters/i })[0]);
    expect(props.onResave).toHaveBeenCalledWith(VIEW_VISIBLE.id);

    // Toggle visibility from the customize panel
    fireEvent.click(screen.getAllByRole('button', { name: /Hide from quick views/i })[0]);
    expect(props.onToggleVisibility).toHaveBeenCalledWith(VIEW_VISIBLE.id);

    // Delete — two-step confirm
    fireEvent.click(screen.getAllByRole('button', { name: /Delete saved view/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Yes, delete/i }));
    expect(props.onDelete).toHaveBeenCalledWith(VIEW_VISIBLE.id);
  });

  it('shows the Edit conditions action only when the prop is passed', () => {
    const onEditConditions = vi.fn();
    renderBar({ onEditConditions });
    fireEvent.click(screen.getByRole('button', { name: /Customize Quick Views/i }));
    const editConditions = screen.getAllByRole('button', { name: /Edit conditions/i });
    fireEvent.click(editConditions[0]);
    expect(onEditConditions).toHaveBeenCalledWith(VIEW_VISIBLE.id);
  });
});

describe('ProfileBar — Clear all filters', () => {
  it('is disabled when hasActiveFilters is false', () => {
    renderBar({ hasActiveFilters: false });
    const btn = screen.getByRole('button', { name: /Clear all filters/i });
    expect(btn).toBeDisabled();
  });

  it('fires onClearFilters when clicked', () => {
    const { props } = renderBar({ hasActiveFilters: true });
    fireEvent.click(screen.getByRole('button', { name: /Clear all filters/i }));
    expect(props.onClearFilters).toHaveBeenCalled();
  });
});

describe('ProfileBar — Save view form', () => {
  it('toggles open when the + Save view button is clicked', () => {
    renderBar();
    expect(screen.queryByPlaceholderText(/View name/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Save view/i }));
    expect(screen.getByPlaceholderText(/View name/i)).toBeInTheDocument();
  });

  it('submits the new-view payload when Save view is clicked', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /Save view/i }));
    const input = screen.getByPlaceholderText(/View name/i);
    fireEvent.change(input, { target: { value: 'New Saved' } });
    // Both the header "+ Save view" and the form submit share the same accessible name;
    // submit via Enter to disambiguate.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Saved' }));
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import BaseGanttView from '../BaseGanttView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 21); // April 21, 2026

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

// BaseGanttView accesses ctx.colorRules (no optional chain) when rendering bars.
// Provide a minimal context so tests with events don't crash.
const minCtx = { colorRules: [] as unknown[] };

function wrap(props: Record<string, any> = {}, ctxValue: any = null) {
  return render(
    <CalendarContext.Provider value={ctxValue}>
      <BaseGanttView
        currentDate={currentDate}
        events={[]}
        bases={[]}
        employees={[]}
        assets={[]}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('BaseGanttView — empty state', () => {
  it('renders an empty-state message when no bases are configured', () => {
    wrap({ bases: [] });
    expect(screen.getByText(/No bases configured yet/i)).toBeInTheDocument();
  });

  it('uses the locationLabel in the empty-state message', () => {
    wrap({ bases: [], locationLabel: 'Station' });
    expect(screen.getByText(/No stations configured yet/i)).toBeInTheDocument();
  });
});

// ─── Toolbar ──────────────────────────────────────────────────────────────────

describe('BaseGanttView — span toggle', () => {
  const bases = [{ id: 'b1', name: 'Alpha Base' }];

  it('renders span toggle buttons', () => {
    wrap({ bases });
    expect(screen.getByRole('button', { name: '14 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 days' })).toBeInTheDocument();
  });

  it('"14 days" is pressed by default and "90 days" is not', () => {
    wrap({ bases });
    expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches pressed state when "90 days" is clicked', () => {
    wrap({ bases });
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    expect(screen.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'false');
  });
});

// ─── Base picker dropdown ─────────────────────────────────────────────────────

describe('BaseGanttView — base picker dropdown', () => {
  const bases = [
    { id: 'b1', name: 'Alpha Base' },
    { id: 'b2', name: 'Bravo Base' },
  ];

  function openPicker() {
    fireEvent.click(screen.getByRole('button', { expanded: false }));
  }

  it('shows an "All bases (N)" summary on the trigger when nothing is selected', () => {
    wrap({ bases, selectedBaseIds: [] });
    expect(screen.getByRole('button', { name: /All bases \(2\)/i })).toBeInTheDocument();
  });

  it('shows the single base name on the trigger when one base is selected', () => {
    wrap({ bases, selectedBaseIds: ['b1'] });
    // Trigger is the listbox-haspopup button.
    const trigger = screen.getByRole('button', { expanded: false });
    expect(within(trigger).getByText('Alpha Base')).toBeInTheDocument();
  });

  it('shows "N of M" on the trigger when multiple bases are selected', () => {
    wrap({ bases, selectedBaseIds: ['b1', 'b2'] });
    expect(screen.getByRole('button', { name: /2 of 2 bases/i })).toBeInTheDocument();
  });

  it('opens the popover when the trigger is clicked', () => {
    wrap({ bases });
    expect(screen.queryByRole('listbox')).toBeNull();
    openPicker();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('renders a checkbox option for each base inside the popover', () => {
    wrap({ bases });
    openPicker();
    const lb = screen.getByRole('listbox');
    expect(within(lb).getByText('Alpha Base')).toBeInTheDocument();
    expect(within(lb).getByText('Bravo Base')).toBeInTheDocument();
    // Two checkboxes inside the popover (one per base).
    expect(within(lb).getAllByRole('checkbox')).toHaveLength(2);
  });

  it('toggles selection when an option is clicked', () => {
    const onBaseSelectionChange = vi.fn();
    wrap({ bases, selectedBaseIds: [], onBaseSelectionChange });
    openPicker();
    const lb = screen.getByRole('listbox');
    fireEvent.click(within(lb).getByText('Alpha Base'));
    expect(onBaseSelectionChange).toHaveBeenCalledWith(['b1']);
  });

  it('filters options by the search query', () => {
    wrap({ bases });
    openPicker();
    const lb = screen.getByRole('listbox');
    const search = within(lb).getByPlaceholderText(/Search bases/i);
    fireEvent.change(search, { target: { value: 'alph' } });
    expect(within(lb).getByText('Alpha Base')).toBeInTheDocument();
    expect(within(lb).queryByText('Bravo Base')).toBeNull();
  });

  it('shows "No matches" when the search query matches nothing', () => {
    wrap({ bases });
    openPicker();
    const lb = screen.getByRole('listbox');
    fireEvent.change(within(lb).getByPlaceholderText(/Search bases/i), { target: { value: 'zzzz' } });
    expect(within(lb).getByText(/No matches/i)).toBeInTheDocument();
  });

  it('"Show all" clears selectedBaseIds', () => {
    const onBaseSelectionChange = vi.fn();
    wrap({ bases, selectedBaseIds: ['b1'], onBaseSelectionChange });
    openPicker();
    const lb = screen.getByRole('listbox');
    fireEvent.click(within(lb).getByRole('button', { name: /Show all/i }));
    expect(onBaseSelectionChange).toHaveBeenCalledWith([]);
  });

  it('"Show all" is disabled when nothing is selected', () => {
    wrap({ bases, selectedBaseIds: [] });
    openPicker();
    const lb = screen.getByRole('listbox');
    expect(within(lb).getByRole('button', { name: /Show all/i })).toBeDisabled();
  });

  it('"Only these" sets selection to the currently filtered bases', () => {
    const onBaseSelectionChange = vi.fn();
    wrap({ bases, selectedBaseIds: [], onBaseSelectionChange });
    openPicker();
    const lb = screen.getByRole('listbox');
    fireEvent.change(within(lb).getByPlaceholderText(/Search bases/i), { target: { value: 'brav' } });
    fireEvent.click(within(lb).getByRole('button', { name: /Only these/i }));
    expect(onBaseSelectionChange).toHaveBeenCalledWith(['b2']);
  });
});

// ─── Region grouping ──────────────────────────────────────────────────────────

describe('BaseGanttView — region grouping', () => {
  const regions = [
    { id: 'r-north', name: 'Northern' },
    { id: 'r-south', name: 'Southern' },
  ];
  const bases = [
    { id: 'b1', name: 'Alpha Base', regionId: 'r-north' },
    { id: 'b2', name: 'Bravo Base', regionId: 'r-south' },
    { id: 'b3', name: 'Charlie Base' }, // no region → Unassigned
  ];

  it('renders a region header per region with at least one visible base', () => {
    wrap({ bases, regions });
    expect(screen.getByRole('button', { name: /Northern/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Southern/i })).toBeInTheDocument();
  });

  it('groups bases without a configured region under "Unassigned"', () => {
    wrap({ bases, regions });
    expect(screen.getByRole('button', { name: /Unassigned/i })).toBeInTheDocument();
  });

  it('does not render region headers when no regions are configured', () => {
    wrap({ bases: [{ id: 'b1', name: 'Alpha Base' }] });
    expect(screen.queryByRole('button', { name: /Northern/i })).toBeNull();
  });

  it('hides bases under a region when its header is clicked (collapse)', () => {
    wrap({ bases, regions });
    // Northern region contains Alpha Base.
    expect(screen.getByText('Alpha Base')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Northern/i }));
    expect(screen.queryByText('Alpha Base')).toBeNull();
    // Other regions still visible.
    expect(screen.getByText('Bravo Base')).toBeInTheDocument();
  });

  it('groups picker options by region inside the popover', () => {
    wrap({ bases, regions });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const lb = screen.getByRole('listbox');
    expect(within(lb).getByText('Northern')).toBeInTheDocument();
    expect(within(lb).getByText('Southern')).toBeInTheDocument();
    expect(within(lb).getByText('Unassigned')).toBeInTheDocument();
  });
});

// ─── Click-to-focus on base header ────────────────────────────────────────────

describe('BaseGanttView — click-to-focus base header', () => {
  const bases = [
    { id: 'b1', name: 'Alpha Base' },
    { id: 'b2', name: 'Bravo Base' },
  ];

  it('clicking a base header focuses just that base (selectedBaseIds = [id])', () => {
    const onBaseSelectionChange = vi.fn();
    wrap({ bases, selectedBaseIds: [], onBaseSelectionChange });
    // Both base headers exist as buttons; pick Alpha Base.
    fireEvent.click(screen.getByRole('button', { name: 'Alpha Base' }));
    expect(onBaseSelectionChange).toHaveBeenCalledWith(['b1']);
  });

  it('shift-clicking a base header toggles it in the existing selection', () => {
    const onBaseSelectionChange = vi.fn();
    // Start with both selected so both headers render and shift-click can remove.
    wrap({ bases, selectedBaseIds: ['b1', 'b2'], onBaseSelectionChange });
    // The trigger summary also reads "Alpha Base" sometimes; pick the header
    // by selecting the second matching button (the rendered base header).
    const headers = screen.getAllByRole('button', { name: 'Alpha Base' });
    fireEvent.click(headers[headers.length - 1]!, { shiftKey: true });
    expect(onBaseSelectionChange).toHaveBeenCalledWith(['b2']);
  });
});

// ─── Hide-empty toggle ────────────────────────────────────────────────────────

describe('BaseGanttView — hide empty toggle', () => {
  const bases = [
    { id: 'b1', name: 'Alpha Base' },
    { id: 'b2', name: 'Bravo Base' },
  ];
  const employees = [{ id: 'e1', name: 'Alice', base: 'b1' }];
  const events = [
    { id: 'ev1', title: 'Shift', resource: 'e1',
      start: d(2026, 4, 21), end: d(2026, 4, 22) },
  ];

  it('hides bases with no events when "Hide empty" is checked', () => {
    wrap({ bases, employees, events }, minCtx);
    // Both visible by default.
    expect(screen.getByRole('button', { name: 'Alpha Base' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bravo Base' })).toBeInTheDocument();
    // Toggle on.
    fireEvent.click(screen.getByLabelText(/Hide empty/i));
    expect(screen.getByRole('button', { name: 'Alpha Base' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bravo Base' })).toBeNull();
  });
});

// ─── Base group rendering ─────────────────────────────────────────────────────

describe('BaseGanttView — base groups', () => {
  const bases = [{ id: 'b1', name: 'Alpha Base' }];

  it('renders the base name in the header', () => {
    wrap({ bases });
    // Base name appears as a clickable header button (Click-to-focus).
    expect(screen.getByRole('button', { name: 'Alpha Base' })).toBeInTheDocument();
  });

  it('shows asset and people counts in the base header', () => {
    const assets = [{ id: 'a1', label: 'Truck 1', meta: { base: 'b1' } }];
    const employees = [{ id: 'e1', name: 'Alice', base: 'b1' }];
    wrap({ bases, assets, employees });
    expect(screen.getByText(/1 assets · 1 people/i)).toBeInTheDocument();
  });

  it('shows 0 counts when base has no assets or employees', () => {
    wrap({ bases });
    expect(screen.getByText(/0 assets · 0 people/i)).toBeInTheDocument();
  });

  it('renders the empty-row message when a base has no assets or employees', () => {
    wrap({ bases });
    expect(screen.getByText(/No assets or people assigned/i)).toBeInTheDocument();
  });
});

// ─── Asset and person rows ────────────────────────────────────────────────────

describe('BaseGanttView — asset rows', () => {
  const bases = [{ id: 'b1', name: 'Alpha Base' }];

  it('renders an asset row with the asset label', () => {
    const assets = [{ id: 'a1', label: 'Truck 1', meta: { base: 'b1' } }];
    wrap({ bases, assets });
    expect(screen.getByText('Truck 1')).toBeInTheDocument();
  });

  it('renders the asset sublabel when present', () => {
    const assets = [{ id: 'a1', label: 'Truck 1', meta: { base: 'b1', sublabel: 'VIN 12345' } }];
    wrap({ bases, assets });
    expect(screen.getByText('VIN 12345')).toBeInTheDocument();
  });

  it('falls back to asset id when label is absent', () => {
    const assets = [{ id: 'asset-99', meta: { base: 'b1' } }];
    wrap({ bases, assets });
    expect(screen.getByText('asset-99')).toBeInTheDocument();
  });
});

describe('BaseGanttView — person rows', () => {
  const bases = [{ id: 'b1', name: 'Alpha Base' }];

  it('renders a person row with the employee name', () => {
    const employees = [{ id: 'e1', name: 'Alice Smith', base: 'b1' }];
    wrap({ bases, employees });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('renders the employee role', () => {
    const employees = [{ id: 'e1', name: 'Alice', role: 'Lead Tech', base: 'b1' }];
    wrap({ bases, employees });
    expect(screen.getByText('Lead Tech')).toBeInTheDocument();
  });

  it('renders a manager title badge', () => {
    const employees = [{
      id: 'e1', name: 'Bob', base: 'b1',
      accountableManagers: [{ title: 'Site Manager' }],
    }];
    wrap({ bases, employees });
    expect(screen.getAllByText('Site Manager').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a tel: link for an employee phone number', () => {
    const employees = [{ id: 'e1', name: 'Carol', base: 'b1', phone: '5550001234' }];
    wrap({ bases, employees });
    const link = screen.getByRole('link', { name: /555.*000.*1234/ });
    expect(link).toHaveAttribute('href', 'tel:5550001234');
  });

  it('renders formatted phone number text for 10-digit number', () => {
    const employees = [{ id: 'e1', name: 'Carol', base: 'b1', phone: '5550001234' }];
    wrap({ bases, employees });
    expect(screen.getByText('(555) 000-1234')).toBeInTheDocument();
  });

  it('renders formatted phone number text for 11-digit number starting with 1', () => {
    const employees = [{ id: 'e1', name: 'Dave', base: 'b1', phone: '15550001234' }];
    wrap({ bases, employees });
    expect(screen.getByText('+1 (555) 000-1234')).toBeInTheDocument();
  });
});

// ─── Event bars ───────────────────────────────────────────────────────────────

describe('BaseGanttView — event bars', () => {
  const bases = [{ id: 'b1', name: 'Alpha Base' }];
  const employees = [{ id: 'e1', name: 'Alice', base: 'b1' }];

  it('renders an event bar for an event routed to an employee resource', () => {
    const events = [
      { id: 'ev1', title: 'Scheduled Shift', resource: 'e1',
        start: d(2026, 4, 21), end: d(2026, 4, 22) },
    ];
    wrap({ bases, employees, events }, minCtx);
    expect(screen.getByRole('button', { name: /Scheduled Shift/i })).toBeInTheDocument();
  });

  it('fires onEventClick when an event bar is clicked', () => {
    const onEventClick = vi.fn();
    const events = [
      { id: 'ev1', title: 'Scheduled Shift', resource: 'e1',
        start: d(2026, 4, 21), end: d(2026, 4, 22) },
    ];
    wrap({ bases, employees, events, onEventClick }, minCtx);
    fireEvent.click(screen.getByRole('button', { name: /Scheduled Shift/i }));
    expect(onEventClick).toHaveBeenCalledOnce();
    expect(onEventClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ev1', title: 'Scheduled Shift', resource: 'e1' }),
    );
  });

  it('renders a base-wide event bar for an event tagged to a base', () => {
    const events = [
      { id: 'ev1', title: 'Site Maintenance', meta: { base: 'b1' },
        start: d(2026, 4, 21), end: d(2026, 4, 21) },
    ];
    wrap({ bases, events }, minCtx);
    expect(screen.getByRole('button', { name: /Site Maintenance/i })).toBeInTheDocument();
  });
});

// ─── Base filtering via selectedBaseIds ───────────────────────────────────────

describe('BaseGanttView — selectedBaseIds filtering', () => {
  const bases = [
    { id: 'b1', name: 'Alpha Base' },
    { id: 'b2', name: 'Bravo Base' },
  ];

  it('shows all bases when selectedBaseIds is empty', () => {
    wrap({ bases, selectedBaseIds: [] });
    expect(screen.getByRole('button', { name: 'Alpha Base' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bravo Base' })).toBeInTheDocument();
  });

  it('shows only selected bases when selectedBaseIds is set', () => {
    wrap({ bases, selectedBaseIds: ['b1'] });
    // Alpha Base appears twice: once in the trigger summary (single-base label),
    // once as the rendered base header. Bravo Base appears nowhere.
    expect(screen.getAllByRole('button', { name: 'Alpha Base' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Bravo Base' })).toBeNull();
  });
});

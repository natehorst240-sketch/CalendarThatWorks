import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import BaseGanttView from '../BaseGanttView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 21); // April 21, 2026

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

// BaseGanttView accesses ctx.colorRules (no optional chain) when rendering bars.
// Provide a minimal context so tests with events don't crash.
const minCtx = { colorRules: [] };

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

// ─── Base picker ──────────────────────────────────────────────────────────────

describe('BaseGanttView — base picker chips', () => {
  const bases = [
    { id: 'b1', name: 'Alpha Base' },
    { id: 'b2', name: 'Bravo Base' },
  ];

  it('renders a chip for each base', () => {
    wrap({ bases });
    expect(screen.getByRole('button', { name: 'Alpha Base' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bravo Base' })).toBeInTheDocument();
  });

  it('calls onBaseSelectionChange when a chip is clicked', () => {
    const onBaseSelectionChange = vi.fn();
    wrap({ bases, selectedBaseIds: [], onBaseSelectionChange });
    fireEvent.click(screen.getByRole('button', { name: 'Alpha Base' }));
    expect(onBaseSelectionChange).toHaveBeenCalledOnce();
    expect(onBaseSelectionChange).toHaveBeenCalledWith(['b1']);
  });

  it('shows a Clear button when selectedBaseIds is non-empty', () => {
    wrap({ bases, selectedBaseIds: ['b1'] });
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
  });

  it('does not show a Clear button when selectedBaseIds is empty', () => {
    wrap({ bases, selectedBaseIds: [] });
    expect(screen.queryByRole('button', { name: /Clear/i })).toBeNull();
  });

  it('calls onBaseSelectionChange([]) when Clear is clicked', () => {
    const onBaseSelectionChange = vi.fn();
    wrap({ bases, selectedBaseIds: ['b1'], onBaseSelectionChange });
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
    expect(onBaseSelectionChange).toHaveBeenCalledWith([]);
  });
});

// ─── Base group rendering ─────────────────────────────────────────────────────

describe('BaseGanttView — base groups', () => {
  const bases = [{ id: 'b1', name: 'Alpha Base' }];

  it('renders the base name in the header', () => {
    wrap({ bases });
    expect(screen.getByText('Alpha Base')).toBeInTheDocument();
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
    expect(screen.getByText('Site Manager')).toBeInTheDocument();
  });

  it('renders a tel: link for an employee phone number', () => {
    const employees = [{ id: 'e1', name: 'Carol', base: 'b1', phone: '5550001234' }];
    wrap({ bases, employees });
    const link = screen.getByRole('link', { name: /Call Carol/i });
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
    expect(onEventClick).toHaveBeenCalledWith(events[0]);
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
    expect(screen.getByText('Alpha Base')).toBeInTheDocument();
    expect(screen.getByText('Bravo Base')).toBeInTheDocument();
  });

  it('shows only selected bases when selectedBaseIds is set', () => {
    wrap({ bases, selectedBaseIds: ['b1'] });
    expect(screen.getByText('Alpha Base')).toBeInTheDocument();
    expect(screen.queryByText('Bravo Base')).toBeNull();
  });
});

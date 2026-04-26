// @vitest-environment happy-dom
/**
 * AssetsView + BaseGanttView — `label` / `assetsLabel` prop renames "Asset"
 * everywhere it surfaces. Mirrors the existing `locationLabel` pattern so
 * owners can rename "Asset" → "Aircraft" / "Vehicle" / "Equipment" without
 * a code change.
 *
 * Pluralization is naive (`${label}s`) — same convention as `locationLabel`,
 * so "Aircraft" pluralizes to "Aircrafts." Owners pick a label that
 * pluralizes cleanly.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetsView from '../AssetsView';
import BaseGanttView from '../BaseGanttView';
import DispatchView from '../DispatchView';
import { CalendarContext } from '../../core/CalendarContext';
import { DEFAULT_CONFIG } from '../../core/configSchema';

// ─── Default ──────────────────────────────────────────────────────────────────

describe('config default — team.assetsLabel', () => {
  it('ships "Asset" as the default label', () => {
    expect(DEFAULT_CONFIG['team']?.['assetsLabel']).toBe('Asset');
  });
});

// ─── AssetsView ───────────────────────────────────────────────────────────────

describe('AssetsView — label prop', () => {
  function renderView(props: Record<string, unknown> = {}) {
    return render(
      <CalendarContext.Provider value={null}>
        <AssetsView
          currentDate={new Date(2026, 3, 1)}
          events={[]}
          onEventClick={vi.fn()}
          onEditAssets={vi.fn()}
          onRequestAsset={vi.fn()}
          {...props}
        />
      </CalendarContext.Provider>,
    );
  }

  it('shows "Edit assets" by default', () => {
    renderView();
    expect(screen.getByRole('button', { name: /Edit assets/i })).toBeInTheDocument();
  });

  it('renames toolbar buttons when label="Vehicle" is passed', () => {
    renderView({ label: 'Vehicle' });
    expect(screen.getByRole('button', { name: /Edit vehicles/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request Vehicle/i })).toBeInTheDocument();
  });

  it('renames the empty-state copy when label is set', () => {
    renderView({ label: 'Vehicle' });
    expect(screen.getByText(/No vehicles to display/i)).toBeInTheDocument();
  });

  it('renames the toolbar aria-label', () => {
    renderView({ label: 'Vehicle' });
    expect(screen.getByRole('toolbar', { name: /Vehicles view controls/i })).toBeInTheDocument();
  });
});

// ─── BaseGanttView ────────────────────────────────────────────────────────────

describe('BaseGanttView — assetsLabel prop', () => {
  function renderBase(props: Record<string, unknown> = {}) {
    return render(
      <CalendarContext.Provider value={null}>
        <BaseGanttView
          currentDate={new Date(2026, 3, 21)}
          events={[]}
          bases={[{ id: 'b1', name: 'Alpha Base' }]}
          assets={[{ id: 'a1', label: 'Truck 1', meta: { base: 'b1' } }]}
          employees={[]}
          {...props}
        />
      </CalendarContext.Provider>,
    );
  }

  it('shows "Asset" row kind by default', () => {
    renderBase();
    expect(screen.getByText('Asset')).toBeInTheDocument();
  });

  it('renames the row kind when assetsLabel="Vehicle"', () => {
    renderBase({ assetsLabel: 'Vehicle' });
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
    expect(screen.queryByText('Asset')).toBeNull();
  });

  it('renames the corner header when assetsLabel="Vehicle"', () => {
    renderBase({ assetsLabel: 'Vehicle' });
    expect(screen.getByText(/Base · People · Vehicles/i)).toBeInTheDocument();
  });

  it('renames the per-base counts ("N vehicles · N people")', () => {
    renderBase({ assetsLabel: 'Vehicle' });
    expect(screen.getByText(/1 vehicles · 0 people/i)).toBeInTheDocument();
  });

  it('renames the empty-row message when no assets/people', () => {
    render(
      <CalendarContext.Provider value={null}>
        <BaseGanttView
          currentDate={new Date(2026, 3, 21)}
          events={[]}
          bases={[{ id: 'b1', name: 'Alpha Base' }]}
          assets={[]}
          employees={[]}
          assetsLabel="Vehicle"
        />
      </CalendarContext.Provider>,
    );
    expect(screen.getByText(/No vehicles or people assigned/i)).toBeInTheDocument();
  });
});

// ─── DispatchView ─────────────────────────────────────────────────────────────

describe('DispatchView — label prop', () => {
  function renderDispatch(props: Record<string, unknown> = {}) {
    return render(
      <DispatchView
        events={[]}
        employees={[]}
        assets={[]}
        bases={[]}
        {...props}
      />,
    );
  }

  it('shows the default "No assets configured" empty state', () => {
    renderDispatch();
    expect(screen.getByText(/No assets configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Add assets in Settings/i)).toBeInTheDocument();
  });

  it('renames the empty state when label="Vehicle"', () => {
    renderDispatch({ label: 'Vehicle' });
    expect(screen.getByText(/No vehicles configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Add vehicles in Settings/i)).toBeInTheDocument();
  });

  it('renames the table header column and aria-label when label is set', () => {
    renderDispatch({
      label: 'Vehicle',
      assets: [{ id: 'a1', label: 'Truck 1', meta: { base: 'b1' } }],
      bases: [{ id: 'b1', name: 'Alpha' }],
    });
    expect(screen.getByRole('grid', { name: /Vehicle readiness/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Vehicle' })).toBeInTheDocument();
  });

  it('renames the footer count ("N vehicles") when label is set', () => {
    renderDispatch({
      label: 'Vehicle',
      assets: [
        { id: 'a1', label: 'Truck 1', meta: { base: 'b1' } },
        { id: 'a2', label: 'Truck 2', meta: { base: 'b1' } },
      ],
      bases: [{ id: 'b1', name: 'Alpha' }],
    });
    expect(screen.getByText(/2 vehicles/i)).toBeInTheDocument();
  });
});

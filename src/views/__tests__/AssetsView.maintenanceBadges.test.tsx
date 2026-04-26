// @vitest-environment happy-dom
/**
 * AssetsView — `renderAssetBadges` slot. Mirrors the `renderAssetLocation`
 * slot pattern: per-asset, render-prop-controlled, scoped to the sticky
 * asset cell, only invoked for non-pool rows.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1);

function renderView(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AssetsView
        currentDate={currentDate}
        events={[]}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AssetsView — renderAssetBadges', () => {
  it('renders the slot output inside each asset row', () => {
    renderView({
      assets: [
        { id: 'truck-12', label: 'Truck 12' },
        { id: 'truck-13', label: 'Truck 13' },
      ],
      renderAssetBadges: (asset: { id: string }) => (
        <span data-testid={`badge-${asset.id}`}>BADGES:{asset.id}</span>
      ),
    });
    expect(screen.getByTestId('badge-truck-12').textContent).toBe('BADGES:truck-12');
    expect(screen.getByTestId('badge-truck-13').textContent).toBe('BADGES:truck-13');
  });

  it('does not call the slot when the prop is omitted', () => {
    renderView({ assets: [{ id: 'truck-12', label: 'Truck 12' }] });
    expect(screen.queryByTestId('asset-badges')).toBeNull();
  });

  it('passes the asset id through to the slot', () => {
    const seen = new Set<string>();
    renderView({
      assets: [{ id: 'unit-7', label: 'Unit 7' }, { id: 'unit-8', label: 'Unit 8' }],
      renderAssetBadges: (asset: { id: string }) => {
        seen.add(asset.id);
        return null;
      },
    });
    expect(seen).toEqual(new Set(['unit-7', 'unit-8']));
  });

  it('renders the slot inside the sticky asset rowheader, not the event zone', () => {
    renderView({
      assets: [{ id: 'truck-12', label: 'Truck 12' }],
      renderAssetBadges: (asset: { id: string }) => <span data-testid="b">x</span>,
    });
    const header = screen.getByRole('rowheader', { name: 'Truck 12' });
    expect(within(header).getByTestId('b')).toBeInTheDocument();
  });
});

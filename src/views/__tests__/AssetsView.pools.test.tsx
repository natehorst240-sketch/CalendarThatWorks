// @vitest-environment happy-dom
/**
 * AssetsView — resource pool rows (#212).
 *
 * Pins the surface described in the issue: pools render as virtual
 * rows at the top of the Assets view, the row label shows a POOL
 * chip and hover-tooltips the member list, and a click on an empty
 * pool cell fires `onPoolDateSelect` with the pool id (not
 * `onDateSelect`, since the pool resolves to a concrete member
 * downstream via the engine).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1); // April 2026
const evOn = (day) => new Date(2026, 3, day);

function renderView(props = {}) {
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

const basicAssets = [
  { id: 'N121AB', label: 'N121AB', meta: {} },
  { id: 'N505CD', label: 'N505CD', meta: {} },
  { id: 'N88QR',  label: 'N88QR',  meta: {} },
];

describe('AssetsView — resource pools (issue #212)', () => {
  it('renders a POOL row at the top for each pool', () => {
    renderView({
      assets: basicAssets,
      pools:  [
        { id: 'fleet-west',    name: 'West Fleet',    memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' },
        { id: 'fleet-central', name: 'Central Fleet', memberIds: ['N88QR'],            strategy: 'first-available' },
      ],
    });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    // Pool rows come first, then asset rows in declared order.
    expect(labels.slice(0, 2)).toEqual(['Pool: West Fleet', 'Pool: Central Fleet']);
    expect(labels.slice(2)).toEqual(['N121AB', 'N505CD', 'N88QR']);
  });

  it('tooltips member labels on the pool row label', () => {
    renderView({
      assets: basicAssets,
      pools:  [{ id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' }],
    });
    const header = screen.getByRole('rowheader', { name: 'Pool: West Fleet' });
    expect(header.getAttribute('title')).toContain('N121AB');
    expect(header.getAttribute('title')).toContain('N505CD');
  });

  it('clicking an empty pool cell fires onPoolDateSelect with the pool id', () => {
    const onPoolDateSelect = vi.fn();
    const onDateSelect     = vi.fn();
    renderView({
      assets: basicAssets,
      pools:  [{ id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' }],
      onPoolDateSelect,
      onDateSelect,
    });

    const poolRow = screen.getByRole('rowheader', { name: 'Pool: West Fleet' }).closest('[role=row]') as HTMLElement;
    const firstCell = poolRow.querySelector('[role=gridcell]') as HTMLElement;
    fireEvent.click(firstCell);

    expect(onPoolDateSelect).toHaveBeenCalledTimes(1);
    expect(onPoolDateSelect.mock.calls[0][2]).toBe('fleet-west');
    expect(onDateSelect).not.toHaveBeenCalled();
  });

  it('shows member-held events on the pool row (aggregate utilization view)', () => {
    renderView({
      assets: basicAssets,
      pools:  [{ id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' }],
      events: [
        { id: 'e1', title: 'Charter',  start: evOn(3),  end: evOn(4),  resource: 'N121AB' },
        { id: 'e2', title: 'A-check',  start: evOn(10), end: evOn(12), resource: 'N505CD' },
        { id: 'e3', title: 'Unrelated', start: evOn(3), end: evOn(4),  resource: 'N88QR'  },
      ],
    });
    const poolRow = screen.getByRole('rowheader', { name: 'Pool: West Fleet' }).closest('[role=row]') as HTMLElement;
    // Member events appear on the pool row; non-member events don't.
    expect(poolRow.textContent).toContain('Charter');
    expect(poolRow.textContent).toContain('A-check');
    expect(poolRow.textContent).not.toContain('Unrelated');
  });

  it('renders no pool rows when pools is empty or absent', () => {
    renderView({ assets: basicAssets });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    expect(labels.some(l => l?.startsWith('Pool:'))).toBe(false);
  });

  it('still books via onPoolDateSelect when a member event occupies the cell', () => {
    // Regression for the P1 review: the pool row aggregates member events,
    // so clicking a "busy" cell must still create a pool booking — the
    // resolver picks whichever member is actually free at submit time.
    const onPoolDateSelect = vi.fn();
    const onEventClick     = vi.fn();
    renderView({
      assets: basicAssets,
      pools:  [{ id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' }],
      events: [
        // Member N121AB is busy on the 3rd; N505CD is still free.
        { id: 'e1', title: 'Charter', start: evOn(3), end: evOn(4), resource: 'N121AB' },
      ],
      onPoolDateSelect,
      onEventClick,
    });
    const poolRow = screen.getByRole('rowheader', { name: 'Pool: West Fleet' }).closest('[role=row]') as HTMLElement;
    const cells = poolRow.querySelectorAll('[role=gridcell]');
    // Day index 2 → April 3rd (month starts on the 1st).
    fireEvent.click(cells[2] as HTMLElement);

    expect(onPoolDateSelect).toHaveBeenCalledTimes(1);
    expect(onPoolDateSelect.mock.calls[0][2]).toBe('fleet-west');
    expect(onEventClick).not.toHaveBeenCalled();
  });

  it('shows the resolved member in the hover title on pool-row pills', () => {
    // Pool-row pills aggregate member bookings, so a viewer can't tell by
    // looking which concrete member is on the pill. The hover title must
    // disclose the assigned member so operators can audit utilization at
    // a glance (#212 acceptance: "show resolved member on hover").
    renderView({
      assets: basicAssets,
      pools:  [{ id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' }],
      events: [
        { id: 'e1', title: 'Charter', start: evOn(3), end: evOn(4), resource: 'N121AB' },
      ],
    });
    const poolRow = screen.getByRole('rowheader', { name: 'Pool: West Fleet' }).closest('[role=row]') as HTMLElement;
    const pill = poolRow.querySelector('button[aria-label*="Charter"]') as HTMLElement;
    expect(pill).toBeTruthy();
    expect(pill.getAttribute('title')).toContain('Charter');
    expect(pill.getAttribute('title')).toContain('N121AB');
    expect(pill.getAttribute('aria-label')).toContain('assigned to N121AB');
  });

  it('surfaces pool lineage on pills for pool-resolved events', () => {
    // Events whose meta.resolvedFromPoolId is set were drawn from a pool;
    // the hover title should disclose which pool they came from so the
    // audit trail is visible without opening the event.
    renderView({
      assets: basicAssets,
      pools:  [{ id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB', 'N505CD'], strategy: 'round-robin' }],
      events: [
        {
          id: 'e1',
          title: 'Charter',
          start: evOn(3),
          end: evOn(4),
          resource: 'N121AB',
          meta: { resolvedFromPoolId: 'fleet-west' },
        },
      ],
    });
    // Asset-row pill for N121AB carries the pool lineage.
    const assetRow = screen.getByRole('rowheader', { name: 'N121AB' }).closest('[role=row]') as HTMLElement;
    const pill = assetRow.querySelector('button[aria-label*="Charter"]') as HTMLElement;
    expect(pill.getAttribute('title')).toContain('West Fleet');
    expect(pill.getAttribute('aria-label')).toContain('resolved from pool West Fleet');
  });

  it('does not render disabled pools as rows', () => {
    // Disabled pools stay in history but can't accept new bookings — the
    // resolver rejects them as POOL_DISABLED — so they must not render as
    // interactive rows either.
    renderView({
      assets: basicAssets,
      pools: [
        { id: 'fleet-west', name: 'West Fleet', memberIds: ['N121AB'], strategy: 'round-robin' },
        { id: 'fleet-old',  name: 'Retired Fleet', memberIds: ['N505CD'], strategy: 'round-robin', disabled: true },
      ],
    });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    expect(labels).toContain('Pool: West Fleet');
    expect(labels).not.toContain('Pool: Retired Fleet');
  });
});

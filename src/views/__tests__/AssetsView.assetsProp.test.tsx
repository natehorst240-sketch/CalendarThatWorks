// @vitest-environment happy-dom
/**
 * AssetsView — first-class `assets` prop (ticket #134-9).
 *
 * When the owner has registered assets (via ConfigPanel → Assets tab, or the
 * host app passes an `assets` prop), AssetsView renders one row per entry in
 * declared order. Event.resource values that don't match any registry id
 * fall into a trailing "(Unassigned)" row. When the registry is empty or
 * absent the view preserves its legacy derived-from-events behavior.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1); // April 2026
const evOn = (day: number) => new Date(2026, 3, day);

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

describe('AssetsView — assets registry prop', () => {
  it('renders one row per registry entry in declared order', () => {
    renderView({
      assets: [
        { id: 'n100aa', label: 'N100AA', meta: {} },
        { id: 'n200bb', label: 'N200BB', meta: {} },
        { id: 'n300cc', label: 'N300CC', meta: {} },
      ],
      events: [],
    });
    const rowheaders = screen.getAllByRole('rowheader');
    const labels = rowheaders.map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['N100AA', 'N200BB', 'N300CC']);
  });

  it('uses the registry label, not the id, for the rowheader', () => {
    renderView({
      assets: [{ id: 'emp-sarah', label: 'Sarah Chen', meta: {} }],
      events: [],
    });
    expect(screen.getByRole('rowheader', { name: 'Sarah Chen' })).toBeInTheDocument();
  });

  it('shows registry meta.sublabel when no event provides one', () => {
    renderView({
      assets: [{ id: 'n100aa', label: 'N100AA', meta: { sublabel: 'CJ3' } }],
      events: [],
    });
    expect(screen.getByText('CJ3')).toBeInTheDocument();
  });

  it('adds a trailing (Unassigned) row when events reference unknown resources', () => {
    renderView({
      assets: [{ id: 'n100aa', label: 'N100AA', meta: {} }],
      events: [
        {
          id: 'orphan',
          title: 'Unknown flight',
          start: evOn(3),
          end: evOn(4),
          resource: 'mystery-asset',
        },
      ],
    });
    const rowheaders = screen.getAllByRole('rowheader');
    const labels = rowheaders.map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['N100AA', '(Unassigned)']);
  });

  it('does NOT add (Unassigned) when every event matches a registered id', () => {
    renderView({
      assets: [{ id: 'n100aa', label: 'N100AA', meta: {} }],
      events: [
        { id: 'e1', title: 'flight', start: evOn(3), end: evOn(4), resource: 'n100aa' },
      ],
    });
    const rowheaders = screen.getAllByRole('rowheader');
    expect(rowheaders).toHaveLength(1);
    expect(rowheaders[0].getAttribute('aria-label')).toBe('N100AA');
  });

  it('falls back to event.resource-derived rows when the registry is absent', () => {
    renderView({
      events: [
        { id: 'e1', title: 'a', start: evOn(3), end: evOn(4), resource: 'N999ZZ' },
        { id: 'e2', title: 'b', start: evOn(5), end: evOn(6), resource: 'N100AA' },
      ],
    });
    // Legacy behavior: alphabetical order, id rendered as the label.
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['N100AA', 'N999ZZ']);
  });

  it('falls back to legacy behavior when the registry is empty []', () => {
    renderView({
      assets: [],
      events: [
        { id: 'e1', title: 'a', start: evOn(3), end: evOn(4), resource: 'N500XX' },
      ],
    });
    expect(screen.getByRole('rowheader', { name: 'N500XX' })).toBeInTheDocument();
  });

  describe('strictAssetFiltering', () => {
    it('drops events whose resource is not in the registry', () => {
      renderView({
        assets: [{ id: 'n100aa', label: 'N100AA', meta: {} }],
        strictAssetFiltering: true,
        events: [
          { id: 'asset-ev', title: 'keeps',   start: evOn(3), end: evOn(4), resource: 'n100aa'   },
          { id: 'emp-ev',   title: 'dropped', start: evOn(5), end: evOn(6), resource: 'emp-sarah' },
        ],
      });
      // Foreign-id event must not create an Unassigned row.
      const rowheaders = screen.getAllByRole('rowheader');
      expect(rowheaders).toHaveLength(1);
      expect(rowheaders[0].getAttribute('aria-label')).toBe('N100AA');
    });

    it('also drops null-resource events (no leaked (Unassigned) row)', () => {
      renderView({
        assets: [{ id: 'n100aa', label: 'N100AA', meta: {} }],
        strictAssetFiltering: true,
        events: [
          { id: 'orphan', title: 'team-wide', start: evOn(3), end: evOn(4), resource: null },
        ],
      });
      const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
      expect(labels).toEqual(['N100AA']);
    });

    it('is a no-op when the registry is absent', () => {
      renderView({
        strictAssetFiltering: true,
        events: [
          { id: 'e1', title: 'a', start: evOn(3), end: evOn(4), resource: 'whatever' },
        ],
      });
      // No registry → legacy derived rows, nothing filtered.
      expect(screen.getByRole('rowheader', { name: 'whatever' })).toBeInTheDocument();
    });
  });
});

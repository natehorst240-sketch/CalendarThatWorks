// @vitest-environment happy-dom
/**
 * AssetsView — on-page toolbar (ticket #134-10).
 *
 * The toolbar surfaces three controls without a ConfigPanel detour:
 *   - "Group by" dropdown (asset fields + meta.* keys harvested from the
 *     registry, plus "None"),
 *   - "Sort by" dropdown (Registry order / Label / Group / Last event date),
 *   - "Edit assets" button that deep-links to ConfigPanel's Assets tab.
 *
 * The toolbar only renders when there's something to control — either a
 * registry is present (so Group/Sort make sense) or an onEditAssets callback
 * was wired (so owners can jump to the registry). The legacy derived-row
 * fallback keeps its minimal chrome.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
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

describe('AssetsView toolbar — visibility', () => {
  it('does not render the toolbar when no registry and no onEditAssets', () => {
    renderView({
      events: [{ id: 'e1', title: 'a', start: evOn(3), end: evOn(4), resource: 'X' }],
    });
    expect(screen.queryByRole('toolbar', { name: /Assets view controls/ })).not.toBeInTheDocument();
  });

  it('renders the toolbar when assets registry is provided', () => {
    renderView({
      assets: [{ id: 'a', label: 'Alpha', meta: {} }],
      events: [],
    });
    expect(screen.getByRole('toolbar', { name: /Assets view controls/ })).toBeInTheDocument();
  });

  it('renders the toolbar when onEditAssets is provided even without a registry', () => {
    renderView({ events: [], onEditAssets: vi.fn() });
    expect(screen.getByRole('toolbar', { name: /Assets view controls/ })).toBeInTheDocument();
  });
});

describe('AssetsView toolbar — Group by', () => {
  it('includes "None", "Group", and one entry per distinct meta.* key', () => {
    renderView({
      assets: [
        { id: 'a1', label: 'A1', meta: { sublabel: 'CJ3', region: 'W' } },
        { id: 'a2', label: 'A2', meta: { sublabel: 'G5' } },
      ],
      events: [],
    });
    const select = screen.getByLabelText('Group by');
    const values = within(select).getAllByRole('option').map(o => o.getAttribute('value'));
    expect(values).toEqual(['', 'group', 'meta.region', 'meta.sublabel']);
  });

  it('calls onGroupByChange(null) when "None" is selected', () => {
    const onGroupByChange = vi.fn();
    renderView({
      assets: [{ id: 'a', label: 'A', meta: {} }],
      events: [],
      groupBy: 'group',
      onGroupByChange,
    });
    const select = screen.getByLabelText('Group by');
    fireEvent.change(select, { target: { value: '' } });
    expect(onGroupByChange).toHaveBeenCalledWith(null);
  });

  it('calls onGroupByChange("meta.region") when a meta option is chosen', () => {
    const onGroupByChange = vi.fn();
    renderView({
      assets: [{ id: 'a', label: 'A', meta: { region: 'W' } }],
      events: [],
      onGroupByChange,
    });
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'meta.region' } });
    expect(onGroupByChange).toHaveBeenCalledWith('meta.region');
  });

  it('reflects the current groupBy string as the selected value', () => {
    renderView({
      assets: [{ id: 'a', label: 'A', meta: { sublabel: 'x' } }],
      events: [],
      groupBy: 'meta.sublabel',
      onGroupByChange: vi.fn(),
    });
    expect(screen.getByLabelText('Group by')).toHaveValue('meta.sublabel');
  });

  it('disables the Group by select when onGroupByChange is absent', () => {
    renderView({
      assets: [{ id: 'a', label: 'A', meta: {} }],
      events: [],
    });
    expect(screen.getByLabelText('Group by')).toBeDisabled();
  });
});

describe('AssetsView toolbar — Sort by', () => {
  const assets = [
    { id: 'c', label: 'Charlie', group: 'East', meta: {} },
    { id: 'a', label: 'Alpha',   group: 'West', meta: {} },
    { id: 'b', label: 'Bravo',   group: 'East', meta: {} },
  ];

  it('defaults to Registry order (declared order preserved)', () => {
    renderView({ assets, events: [] });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('Label sort reorders rows alphabetically by display label', () => {
    renderView({ assets, events: [] });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'label' } });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('Group sort clusters by group then label within group', () => {
    renderView({ assets, events: [] });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'group' } });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    // East: Bravo, Charlie; West: Alpha
    expect(labels).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('Last event date sort orders by most recent event end descending', () => {
    renderView({
      assets,
      events: [
        { id: 'e1', title: '1', start: evOn(3), end: evOn(3), resource: 'a' },
        { id: 'e2', title: '2', start: evOn(10), end: evOn(10), resource: 'b' },
        { id: 'e3', title: '3', start: evOn(20), end: evOn(20), resource: 'c' },
      ],
    });
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'lastEvent' } });
    const labels = screen.getAllByRole('rowheader').map(el => el.getAttribute('aria-label'));
    expect(labels).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('disables Sort by when no registry is present', () => {
    renderView({ events: [], onEditAssets: vi.fn() });
    expect(screen.getByLabelText('Sort by')).toBeDisabled();
  });
});

describe('AssetsView toolbar — Edit assets', () => {
  it('renders the Edit assets button when onEditAssets is provided', () => {
    const onEditAssets = vi.fn();
    renderView({
      assets: [{ id: 'a', label: 'A', meta: {} }],
      events: [],
      onEditAssets,
    });
    expect(screen.getByRole('button', { name: 'Edit assets' })).toBeInTheDocument();
  });

  it('fires the callback on click', () => {
    const onEditAssets = vi.fn();
    renderView({
      assets: [{ id: 'a', label: 'A', meta: {} }],
      events: [],
      onEditAssets,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit assets' }));
    expect(onEditAssets).toHaveBeenCalledTimes(1);
  });

  it('hides the button when onEditAssets is absent', () => {
    renderView({
      assets: [{ id: 'a', label: 'A', meta: {} }],
      events: [],
    });
    expect(screen.queryByRole('button', { name: 'Edit assets' })).not.toBeInTheDocument();
  });
});

/**
 * AssetsView — grouping behaviour under the TS engine (ticket #134-1).
 *
 * Covers 1- and 2-level trees, collapse/expand, aria parity with AgendaView
 * (treeitem + aria-level + aria-expanded), and the render-prop controlled
 * collapsedGroups round-trip that ticket #134-2 relies on.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React, { useState } from 'react';
import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1); // April 2026

const evOn = (day) => new Date(2026, 3, day);

const events = [
  {
    id: 'e1', title: 'Training', category: 'training',
    start: evOn(3), end: evOn(4),
    resource: 'N100AA',
    meta: { region: 'West',    sublabel: 'CJ3' },
  },
  {
    id: 'e2', title: 'Maintenance', category: 'maintenance',
    start: evOn(6), end: evOn(7),
    resource: 'N100AA',
    meta: { region: 'West',    sublabel: 'CJ3' },
  },
  {
    id: 'e3', title: 'PR flight', category: 'pr',
    start: evOn(8), end: evOn(9),
    resource: 'N200BB',
    meta: { region: 'East',    sublabel: 'PC-24' },
  },
  {
    id: 'e4', title: 'Training', category: 'training',
    start: evOn(10), end: evOn(11),
    resource: 'N300CC',
    meta: { region: 'East',    sublabel: 'King Air' },
  },
];

function renderAssets(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AssetsView
        currentDate={currentDate}
        events={events}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AssetsView grouping — 1-level tree', () => {
  it('renders a GroupHeader treeitem per group value', () => {
    renderAssets({ groupBy: 'region' });
    const items = screen.getAllByRole('treeitem');
    const labels = items.map(i => i.getAttribute('aria-label'));
    expect(labels.some(l => l?.startsWith('region: East'))).toBe(true);
    expect(labels.some(l => l?.startsWith('region: West'))).toBe(true);
  });

  it('headers are depth-0 and report event counts via aria-label', () => {
    renderAssets({ groupBy: 'region' });
    const items = screen.getAllByRole('treeitem');
    for (const item of items) {
      expect(item.getAttribute('aria-level')).toBe('1');
    }
    const west = items.find(i => i.getAttribute('aria-label')?.startsWith('region: West'));
    // West has 2 events (training + maintenance on N100AA)
    expect(west?.getAttribute('aria-label')).toMatch(/2 events/);
    const east = items.find(i => i.getAttribute('aria-label')?.startsWith('region: East'));
    // East has 2 events (PR on N200BB + training on N300CC)
    expect(east?.getAttribute('aria-label')).toMatch(/2 events/);
  });

  it('renders one asset rowheader per resource with events in the group', () => {
    renderAssets({ groupBy: 'region' });
    expect(screen.getByRole('rowheader', { name: 'N100AA' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'N200BB' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'N300CC' })).toBeInTheDocument();
  });

  it('clicking a group header toggles collapse state', () => {
    renderAssets({ groupBy: 'region' });
    const west = screen.getAllByRole('treeitem').find(
      i => i.getAttribute('aria-label')?.startsWith('region: West'),
    );
    expect(west).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('rowheader', { name: 'N100AA' })).toBeInTheDocument();

    fireEvent.click(west);
    expect(west).toHaveAttribute('aria-expanded', 'false');
    // N100AA lives under West — hidden after collapse.
    expect(screen.queryByRole('rowheader', { name: 'N100AA' })).not.toBeInTheDocument();
    // East side unaffected.
    expect(screen.getByRole('rowheader', { name: 'N200BB' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'N300CC' })).toBeInTheDocument();
  });

  it('renders no treeitem headers when groupBy is unset', () => {
    renderAssets();
    expect(screen.queryByRole('treeitem')).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'N100AA' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'N200BB' })).toBeInTheDocument();
  });
});

describe('AssetsView grouping — 2-level tree', () => {
  it('nests depth-1 treeitems beneath depth-0 parents', () => {
    renderAssets({ groupBy: ['region', 'category'] });
    const top = screen.getAllByRole('treeitem').filter(
      i => i.getAttribute('aria-level') === '1',
    );
    expect(top.length).toBe(2); // East, West
    const nested = screen.getAllByRole('treeitem').filter(
      i => i.getAttribute('aria-level') === '2',
    );
    // East has pr + training; West has training + maintenance → 4 total
    expect(nested.length).toBe(4);
  });

  it('collapsing a parent hides its nested headers and asset rows', () => {
    renderAssets({ groupBy: ['region', 'category'] });
    const west = screen.getAllByRole('treeitem').find(
      i => i.getAttribute('aria-label')?.startsWith('region: West')
        && i.getAttribute('aria-level') === '1',
    );
    fireEvent.click(west);
    // Nested training/maintenance under West are gone.
    const remaining = screen.getAllByRole('treeitem').filter(
      i => i.getAttribute('aria-level') === '2',
    );
    // Only East's two nested headers remain.
    expect(remaining.length).toBe(2);
    // East still has its assets.
    expect(screen.getByRole('rowheader', { name: 'N200BB' })).toBeInTheDocument();
  });

  it('an asset appearing under two leaf groups is rendered once per group', () => {
    renderAssets({ groupBy: ['region', 'category'] });
    // N100AA has events in both `training` and `maintenance` under West →
    // it should surface under both nested buckets.
    const rowheaders = screen.getAllByRole('rowheader', { name: 'N100AA' });
    expect(rowheaders.length).toBe(2);
  });
});

describe('AssetsView grouping — controlled collapsedGroups', () => {
  function Controlled(props) {
    const [collapsed, setCollapsed] = useState(() => new Set());
    return (
      <CalendarContext.Provider value={null}>
        <AssetsView
          currentDate={currentDate}
          events={events}
          onEventClick={vi.fn()}
          groupBy="region"
          collapsedGroups={collapsed}
          onCollapsedGroupsChange={setCollapsed}
          {...props}
        />
      </CalendarContext.Provider>
    );
  }

  it('round-trips toggle state through the onCollapsedGroupsChange callback', () => {
    render(<Controlled />);
    const west = screen.getAllByRole('treeitem').find(
      i => i.getAttribute('aria-label')?.startsWith('region: West'),
    );
    expect(west).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(west);
    expect(west).toHaveAttribute('aria-expanded', 'false');
    // Re-expand
    fireEvent.click(west);
    expect(west).toHaveAttribute('aria-expanded', 'true');
  });

  it('honours an initial collapsed prop value', () => {
    render(
      <CalendarContext.Provider value={null}>
        <AssetsView
          currentDate={currentDate}
          events={events}
          onEventClick={vi.fn()}
          groupBy="region"
          collapsedGroups={['West']}
          onCollapsedGroupsChange={vi.fn()}
        />
      </CalendarContext.Provider>,
    );
    const west = screen.getAllByRole('treeitem').find(
      i => i.getAttribute('aria-label')?.startsWith('region: West'),
    );
    expect(west).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('rowheader', { name: 'N100AA' })).not.toBeInTheDocument();
  });
});

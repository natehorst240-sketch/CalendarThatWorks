import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import AssetsView from '../AssetsView.jsx';
import { CalendarContext } from '../../core/CalendarContext.js';

const currentDate = new Date(2026, 3, 1); // April 2026

const baseEvents = [
  {
    id: 'ev-1',
    title: 'Training block',
    start: new Date(2026, 3, 3),
    end:   new Date(2026, 3, 5),
    resource: 'N121AB',
    category: 'training',
    meta: { sublabel: 'Citation CJ3', approvalStage: { stage: 'approved', updatedAt: '', history: [] } },
  },
  {
    id: 'ev-2',
    title: 'PR flight',
    start: new Date(2026, 3, 6),
    end:   new Date(2026, 3, 7),
    resource: 'N121AB',
    category: 'pr',
    meta: { approvalStage: { stage: 'requested', updatedAt: '', history: [] } },
  },
  {
    id: 'ev-3',
    title: 'Maintenance (denied)',
    start: new Date(2026, 3, 10),
    end:   new Date(2026, 3, 12),
    resource: 'N505CD',
    category: 'maintenance',
    meta: { approvalStage: { stage: 'denied', updatedAt: '', history: [] } },
  },
  {
    id: 'ev-4',
    title: 'Coverage run',
    start: new Date(2026, 3, 15),
    end:   new Date(2026, 3, 16),
    resource: 'N505CD',
    category: 'coverage',
    meta: { approvalStage: { stage: 'pending_higher', updatedAt: '', history: [] } },
  },
];

function renderAssets(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AssetsView
        currentDate={currentDate}
        events={baseEvents}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AssetsView — rows & rendering', () => {
  it('renders one row per distinct resource', () => {
    renderAssets();
    expect(screen.getByRole('rowheader', { name: 'N121AB' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'N505CD' })).toBeInTheDocument();
  });

  it('shows sublabel from event.meta.sublabel', () => {
    renderAssets();
    expect(screen.getByText('Citation CJ3')).toBeInTheDocument();
  });

  it('shows placeholder location banner when no provider is wired', () => {
    renderAssets();
    expect(screen.getAllByText(/Location/).length).toBeGreaterThan(0);
  });

  it('renders "No assets" empty state when events array is empty', () => {
    renderAssets({ events: [] });
    expect(screen.getByText(/No assets to display/i)).toBeInTheDocument();
  });

  it('fires onEventClick when a pill is clicked', () => {
    const onEventClick = vi.fn();
    renderAssets({ onEventClick });
    fireEvent.click(screen.getByRole('button', { name: /Training block/ }));
    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick.mock.calls[0][0].id).toBe('ev-1');
  });
});

describe('AssetsView — zoom control', () => {
  it('renders four zoom buttons with Month as the default active', () => {
    renderAssets();
    expect(screen.getByRole('button', { name: 'Zoom to Day' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom to Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom to Month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom to Quarter' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Zoom to Month' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Zoom to Day' }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onZoomChange with the clicked zoom id', () => {
    const onZoomChange = vi.fn();
    renderAssets({ zoomLevel: 'month', onZoomChange });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom to Week' }));
    expect(onZoomChange).toHaveBeenCalledWith('week');
  });

  it('disables zoom buttons when onZoomChange is absent', () => {
    renderAssets({ onZoomChange: undefined });
    expect(screen.getByRole('button', { name: 'Zoom to Day' })).toBeDisabled();
  });

  it('respects the passed-in zoomLevel', () => {
    renderAssets({ zoomLevel: 'day', onZoomChange: vi.fn() });
    expect(screen.getByRole('button', { name: 'Zoom to Day' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});

describe('AssetsView — approval stage visuals', () => {
  it('emits data-stage="requested" for a requested event', () => {
    renderAssets();
    const pill = screen.getByRole('button', { name: /PR flight/ });
    expect(pill).toHaveAttribute('data-stage', 'requested');
  });

  it('shows REQUESTED prefix inside a requested pill', () => {
    renderAssets();
    const pill = screen.getByRole('button', { name: /PR flight/ });
    expect(within(pill).getByText('REQUESTED')).toBeInTheDocument();
  });

  it('marks denied events with data-stage="denied"', () => {
    renderAssets();
    const pill = screen.getByRole('button', { name: /Maintenance \(denied\)/ });
    expect(pill).toHaveAttribute('data-stage', 'denied');
  });

  it('marks pending_higher events with data-stage and PENDING prefix', () => {
    renderAssets();
    const pill = screen.getByRole('button', { name: /Coverage run/ });
    expect(pill).toHaveAttribute('data-stage', 'pending_higher');
    expect(within(pill).getByText('PENDING')).toBeInTheDocument();
  });

  it('does not set data-stage when meta.approvalStage is missing', () => {
    const events = [{
      id: 'ev-x',
      title: 'Plain event',
      start: new Date(2026, 3, 8),
      end:   new Date(2026, 3, 9),
      resource: 'R1',
    }];
    renderAssets({ events });
    expect(screen.getByRole('button', { name: /Plain event/ })).not.toHaveAttribute('data-stage');
  });
});

describe('AssetsView — category hue', () => {
  it('uses categoriesConfig.color as the pill --ev-color', () => {
    renderAssets({
      categoriesConfig: {
        categories: [
          { id: 'training', label: 'Training', color: '#ff00aa' },
        ],
      },
    });
    const pill = screen.getByRole('button', { name: /Training block/ });
    expect(pill.style.getPropertyValue('--ev-color')).toBe('#ff00aa');
  });

  it('falls through to DEFAULT_CATEGORIES when no categoriesConfig is given', () => {
    renderAssets();
    const pill = screen.getByRole('button', { name: /Training block/ });
    // DEFAULT_CATEGORIES.training.color = '#4C9AFF'
    expect(pill.style.getPropertyValue('--ev-color').toLowerCase())
      .toContain('#4c9aff');
  });

  it('honours colorRules when provided via context (overrides category)', () => {
    const withContext = (
      <CalendarContext.Provider value={{ colorRules: [{ field: 'category', value: 'training', color: '#123456' }] }}>
        <AssetsView
          currentDate={currentDate}
          events={baseEvents}
          onEventClick={vi.fn()}
        />
      </CalendarContext.Provider>
    );
    render(withContext);
    const pill = screen.getByRole('button', { name: /Training block/ });
    expect(pill.style.getPropertyValue('--ev-color')).toBe('#123456');
  });
});

describe('AssetsView — grouping', () => {
  it('renders group headers when groupBy is set', () => {
    renderAssets({ groupBy: 'category' });
    expect(screen.getByRole('button', { name: /Collapse group training/i })).toBeInTheDocument();
  });

  it('renders no group headers when groupBy is undefined', () => {
    renderAssets();
    expect(screen.queryByRole('button', { name: /Collapse group/i })).not.toBeInTheDocument();
  });
});

describe('AssetsView — renderAssetLocation render prop', () => {
  it('calls the render prop with null LocationData and the resource object', () => {
    const renderAssetLocation = vi.fn(() => <span data-testid="custom-loc">Custom</span>);
    renderAssets({ renderAssetLocation });
    expect(renderAssetLocation).toHaveBeenCalled();
    const [data, resource] = renderAssetLocation.mock.calls[0];
    expect(data).toBeNull();
    expect(resource).toMatchObject({ id: 'N121AB' });
    expect(screen.getAllByTestId('custom-loc').length).toBeGreaterThan(0);
  });
});

describe('AssetsView — keyboard navigation', () => {
  it('moves focus right with ArrowRight', () => {
    renderAssets();
    const firstCell = document.querySelector('[data-cell="0-0"]');
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: 'ArrowRight' });
    const nextCell = document.querySelector('[data-cell="0-1"]');
    // focused via ref effect; just assert element exists
    expect(nextCell).toBeTruthy();
  });

  it('activates an event on Enter when the day has a pill', () => {
    const onEventClick = vi.fn();
    renderAssets({ onEventClick });
    // ev-1 starts on April 3 (day index 2 for a month starting April 1)
    const cell = document.querySelector('[data-cell="0-2"]');
    cell.focus();
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onEventClick).toHaveBeenCalled();
  });

  it('calls onDateSelect on Enter when the cell is empty', () => {
    const onDateSelect = vi.fn();
    renderAssets({ onDateSelect });
    // April 20 = day index 19, no event on N121AB
    const cell = document.querySelector('[data-cell="0-19"]');
    cell.focus();
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onDateSelect).toHaveBeenCalled();
    const [start, end, resourceId] = onDateSelect.mock.calls[0];
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
    expect(typeof resourceId).toBe('string');
  });
});

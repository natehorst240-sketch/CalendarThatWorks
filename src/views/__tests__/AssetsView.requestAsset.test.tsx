// @vitest-environment happy-dom
/**
 * AssetsView — "Request Asset" button.
 *
 * When the host passes `onRequestAsset`, AssetsView renders a primary
 * toolbar button that invokes the callback. The button is absent when the
 * callback is omitted (default opt-out behavior).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';

import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 1);

function renderView(props = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <AssetsView
        currentDate={currentDate}
        events={[]}
        onEventClick={vi.fn()}
        assets={[{ id: 'n100aa', label: 'N100AA', meta: {} }]}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('AssetsView — Request Asset button', () => {
  it('renders when onRequestAsset is provided', () => {
    renderView({ onRequestAsset: vi.fn() });
    expect(screen.getByRole('button', { name: 'Request asset' })).toBeInTheDocument();
  });

  it('invokes the callback on click', () => {
    const onRequestAsset = vi.fn();
    renderView({ onRequestAsset });
    fireEvent.click(screen.getByRole('button', { name: 'Request asset' }));
    expect(onRequestAsset).toHaveBeenCalledTimes(1);
  });

  it('is hidden when onRequestAsset is omitted', () => {
    renderView();
    expect(screen.queryByRole('button', { name: 'Request asset' })).not.toBeInTheDocument();
  });

  it('shows the toolbar (so the button is reachable) even with no registry', () => {
    // Edge case: host passes onRequestAsset without an assets registry. Button
    // should still render so the host doesn't silently drop the flow.
    render(
      <CalendarContext.Provider value={null}>
        <AssetsView
          currentDate={currentDate}
          events={[]}
          onEventClick={vi.fn()}
          onRequestAsset={vi.fn()}
        />
      </CalendarContext.Provider>,
    );
    expect(screen.getByRole('button', { name: 'Request asset' })).toBeInTheDocument();
  });
});

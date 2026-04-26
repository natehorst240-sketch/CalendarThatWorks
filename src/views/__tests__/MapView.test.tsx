/**
 * MapView smoke tests.
 *
 * Map runtime deps (`react-map-gl`, `maplibre-gl`) are intentionally NOT
 * installed in this repo — MapView is shipped as an opt-in view, with the
 * peers loaded lazily by the host app. These tests therefore exercise the
 * graceful fallback paths (missing deps, no-coords hint) rather than the
 * actual map rendering.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import MapView from '../MapView';
import { CalendarContext } from '../../core/CalendarContext';

function d(year: number, month: number, day: number) {
  return new Date(year, month - 1, day);
}

function wrap(props: Record<string, any> = {}) {
  return render(
    <CalendarContext.Provider value={null}>
      <MapView events={[]} {...props} />
    </CalendarContext.Provider>,
  );
}

describe('MapView — fallback when map deps are not installed', () => {
  it('renders an install hint when react-map-gl is not resolvable', async () => {
    wrap({ events: [] });
    await waitFor(() => {
      expect(screen.getByText(/Map view requires/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/npm install maplibre-gl react-map-gl/)).toBeInTheDocument();
  });

  it('does not crash with an event list that has no coordinates', async () => {
    const events = [
      { id: 'e1', title: 'No coords', start: d(2026, 4, 21) },
    ];
    wrap({ events });
    await waitFor(() => {
      expect(screen.getByText(/Map view requires/i)).toBeInTheDocument();
    });
  });

  it('accepts events with meta.coords without throwing', async () => {
    const events = [
      {
        id: 'e1',
        title: 'KPHX',
        start: d(2026, 4, 21),
        meta: { coords: { lat: 33.43, lon: -112.01 } },
      },
    ];
    expect(() => wrap({ events })).not.toThrow();
  });
});

// @vitest-environment happy-dom
/**
 * RightPanel — docked aside in <AppShell>'s rightPanel slot.
 *
 * Pins the section/widget rendering contract so the WorksCalendar wiring
 * (events → map, employees → crew list) is safe to refactor.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

import {
  RightPanel,
  RightPanelSection,
  RegionMapWidget,
  CrewOnShiftList,
} from '../RightPanel';

describe('RightPanelSection', () => {
  it('renders a section with the title as accessible name + visible header', () => {
    render(
      <RightPanelSection title="Region map">
        <span>body</span>
      </RightPanelSection>,
    );
    expect(screen.getByRole('region', { name: 'Region map' })).toBeInTheDocument();
    expect(screen.getByText('Region map')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});

describe('RegionMapWidget', () => {
  it('renders an empty-state note when no events carry coordinates', () => {
    render(<RegionMapWidget events={[{ id: 'a' }, { id: 'b', meta: { title: 'no coords' } }]} />);
    expect(screen.getByRole('note')).toHaveTextContent(/no events with coordinates/i);
  });

  it('plots one circle per event with coords (canonical meta.coords shape)', () => {
    const { container } = render(
      <RegionMapWidget
        events={[
          { id: 'a', meta: { coords: { lat: 40, lon: -74 } } },
          { id: 'b', meta: { coords: { lat: 41, lon: -73 } } },
          { id: 'c', meta: { coords: { lat: 42, lon: -72 } } },
        ]}
      />,
    );
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    expect(screen.getByRole('img', { name: /3 events on the region map/i })).toBeInTheDocument();
  });

  it('accepts the loose meta.lat / meta.lon shape too', () => {
    const { container } = render(
      <RegionMapWidget
        events={[{ id: 'a', meta: { lat: 40, lon: -74 } }]}
      />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.getByRole('img', { name: /1 event on the region map/i })).toBeInTheDocument();
  });

  it('accepts meta.lng as a synonym for lon', () => {
    const { container } = render(
      <RegionMapWidget
        events={[
          { id: 'a', meta: { coords: { lat: 40, lng: -74 } } },
          { id: 'b', meta: { lat: 41, lng: -73 } },
        ]}
      />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('skips events whose coords are not numeric', () => {
    const { container } = render(
      <RegionMapWidget
        events={[
          { id: 'good', meta: { coords: { lat: 40, lon: -74 } } },
          { id: 'bad',  meta: { coords: { lat: 'forty', lon: -74 } } },
          { id: 'no-meta' },
        ]}
      />,
    );
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });
});

describe('CrewOnShiftList', () => {
  it('renders an empty-state note when no employees are configured', () => {
    render(<CrewOnShiftList employees={[]} />);
    expect(screen.getByRole('note')).toHaveTextContent(/no team members configured/i);
  });

  it('renders one row per employee with the full name visible', () => {
    render(
      <CrewOnShiftList
        employees={[
          { id: 1, name: 'Sarah Chen' },
          { id: 2, name: 'Jordan Pace' },
          { id: 3, name: 'Avery' },
        ]}
      />,
    );
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('Jordan Pace')).toBeInTheDocument();
    expect(screen.getByText('Avery')).toBeInTheDocument();
  });

  it('shows initials in the avatar (first + last for two-word names)', () => {
    render(<CrewOnShiftList employees={[{ id: 1, name: 'Sarah Chen' }]} />);
    expect(screen.getByText('SC')).toBeInTheDocument();
  });

  it('shows the first two letters as initials for single-word names', () => {
    render(<CrewOnShiftList employees={[{ id: 1, name: 'Avery' }]} />);
    expect(screen.getByText('AV')).toBeInTheDocument();
  });

  it('falls back to the id when name is missing', () => {
    render(<CrewOnShiftList employees={[{ id: 'emp-42' }]} />);
    expect(screen.getByText('emp-42')).toBeInTheDocument();
  });

  it('narrows to employees whose id is in onShiftIds when provided', () => {
    render(
      <CrewOnShiftList
        employees={[
          { id: 1, name: 'Sarah Chen' },
          { id: 2, name: 'Jordan Pace' },
          { id: 3, name: 'Avery Kim' },
        ]}
        onShiftIds={new Set(['1', '3'])}
      />,
    );
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.queryByText('Jordan Pace')).toBeNull();
    expect(screen.getByText('Avery Kim')).toBeInTheDocument();
  });

  it('renders an empty-state when onShiftIds filters everyone out', () => {
    render(
      <CrewOnShiftList
        employees={[{ id: 1, name: 'Sarah Chen' }]}
        onShiftIds={new Set()}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/nobody is on shift right now/i);
  });

  it('renders the full roster when onShiftIds is null (legacy mode)', () => {
    render(
      <CrewOnShiftList
        employees={[
          { id: 1, name: 'Sarah Chen' },
          { id: 2, name: 'Jordan Pace' },
        ]}
        onShiftIds={null}
      />,
    );
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('Jordan Pace')).toBeInTheDocument();
  });
});

describe('RightPanel', () => {
  it('renders children inside the panel', () => {
    render(
      <RightPanel>
        <RightPanelSection title="A">
          <span>alpha</span>
        </RightPanelSection>
        <RightPanelSection title="B">
          <span>bravo</span>
        </RightPanelSection>
      </RightPanel>,
    );
    expect(screen.getByRole('region', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'B' })).toBeInTheDocument();
  });
});

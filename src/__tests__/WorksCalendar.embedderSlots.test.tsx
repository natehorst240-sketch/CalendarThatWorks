// @vitest-environment happy-dom
/**
 * Integration tests for the embedder slot props added in 0.6.0:
 *
 *   - `leftRailExtras?: LeftRailAction[]`     — extra icon buttons appended
 *                                                to the LeftRail after the
 *                                                built-in saved-views /
 *                                                focus / settings actions.
 *   - `rightPanelExtras?: ReactNode`          — extra ReactNode appended
 *                                                to the RightPanel after
 *                                                Region map + Crew on
 *                                                shift sections.
 *
 * Both are additive and non-breaking. These tests pin:
 *   1. extras render alongside the stock chrome (don't replace it),
 *   2. extras land AFTER the built-in items (stable ordering),
 *   3. extras' `onClick` actually fires when the rendered button is
 *      clicked (so the rail wires up the handler, not just the icon),
 *   4. id collisions with reserved built-in ids (saved-views / focus /
 *      settings) are filtered out so a typo can't shadow the chrome.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';
import { RightPanelSection } from '../ui/RightPanel';
import type { LeftRailAction } from '../ui/LeftRail';

describe('WorksCalendar embedder slots', () => {
  it('renders leftRailExtras alongside the built-in saved-views / focus actions', () => {
    const onExportClick = vi.fn();
    const extras: LeftRailAction[] = [
      {
        id: 'export',
        label: 'Export CSV',
        hint: 'Download visible events',
        icon: <span data-testid="export-icon" aria-hidden="true">↓</span>,
        onClick: onExportClick,
      },
    ];

    render(
      <WorksCalendar
        calendarId="test-slots-1"
        events={[]}
        leftRailExtras={extras}
      />,
    );

    // Built-ins still present.
    expect(screen.getByRole('button', { name: 'Saved views' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Focus filters' })).toBeInTheDocument();

    // Extra is rendered, accessible-named via the action's `label`, and
    // wired to the supplied onClick.
    const exportBtn = screen.getByRole('button', { name: 'Export CSV' });
    expect(exportBtn).toBeInTheDocument();
    expect(screen.getByTestId('export-icon')).toBeInTheDocument();

    fireEvent.click(exportBtn);
    expect(onExportClick).toHaveBeenCalledTimes(1);
  });

  it('reserved built-in ids in leftRailExtras are filtered out', () => {
    // Defensive: an embedder typo passing { id: 'settings', ... } must not
    // shadow the chrome's settings button. The extras list ignores any
    // entry whose id collides with a built-in.
    const onCollidingClick = vi.fn();
    const extras: LeftRailAction[] = [
      {
        id: 'settings',          // ← reserved
        label: 'Pretender Settings',
        icon: <span aria-hidden="true">!</span>,
        onClick: onCollidingClick,
      },
      {
        id: 'real-extra',
        label: 'Real Extra',
        icon: <span aria-hidden="true">★</span>,
        onClick: vi.fn(),
      },
    ];

    render(
      <WorksCalendar
        calendarId="test-slots-2"
        events={[]}
        leftRailExtras={extras}
      />,
    );

    // The colliding entry must NOT render — its label was bespoke so its
    // absence is detectable. The non-colliding extra DOES render.
    expect(screen.queryByRole('button', { name: 'Pretender Settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Real Extra' })).toBeInTheDocument();
  });

  it('renders rightPanelExtras after the built-in Crew on shift section', () => {
    render(
      <WorksCalendar
        calendarId="test-slots-3"
        events={[]}
        employees={[{ id: 'e1', name: 'Pat Doe' }]}
        rightPanelExtras={
          <RightPanelSection title="Open Tickets">
            <div data-testid="my-ticket-widget">3 open</div>
          </RightPanelSection>
        }
      />,
    );

    // Built-in Crew on shift section renders when a team is configured.
    expect(screen.getByRole('region', { name: 'Crew on shift' })).toBeInTheDocument();

    // Embedder-supplied section + content present.
    expect(screen.getByRole('region', { name: 'Open Tickets' })).toBeInTheDocument();
    expect(screen.getByTestId('my-ticket-widget')).toHaveTextContent('3 open');

    // Pin DOM ordering: extras land AFTER built-ins.
    const regions = screen.getAllByRole('region').map(r => r.getAttribute('aria-label'));
    const crewIndex = regions.indexOf('Crew on shift');
    const extraIndex = regions.indexOf('Open Tickets');
    expect(extraIndex).toBeGreaterThan(crewIndex);
  });

  it('rightPanelExtras render even when no team is configured', () => {
    // The Crew on shift section is gated on having employees, but an
    // embedder-supplied section should still surface the right panel.
    render(
      <WorksCalendar
        calendarId="test-slots-3b"
        events={[]}
        rightPanelExtras={
          <RightPanelSection title="Open Tickets">
            <div data-testid="my-ticket-widget-2">3 open</div>
          </RightPanelSection>
        }
      />,
    );

    expect(screen.getByRole('region', { name: 'Open Tickets' })).toBeInTheDocument();
    // No team → no Crew on shift noise.
    expect(screen.queryByRole('region', { name: 'Crew on shift' })).not.toBeInTheDocument();
  });

  it('omitting both slot props (and with no team) hides the right panel', () => {
    // Embed→app pivot retired the MapLibre Region map widget, and the
    // Crew on shift section is now gated on having a configured team — so a
    // bare embed with no employees and no extras shows no right panel at all
    // instead of a "No team members configured yet" placeholder the embedder
    // can't act on.
    render(<WorksCalendar calendarId="test-slots-4" events={[]} />);

    // queryAllByRole (not getAllByRole) — there may be zero region landmarks
    // now that the right panel is omitted, and getAllByRole throws on none.
    const regions = screen.queryAllByRole('region').map(r => r.getAttribute('aria-label'));
    expect(regions).not.toContain('Crew on shift');
  });
});

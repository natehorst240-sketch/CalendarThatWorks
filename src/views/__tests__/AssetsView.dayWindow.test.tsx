// @vitest-environment happy-dom
/**
 * AssetsView dayWindow — the AppShell sub-toolbar's day-window pill should
 * reflow the asset timeline grid to N days starting from currentDate, with
 * the header label updated to a range. null / undefined / 0 fall back to
 * the legacy calendar-month default.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import AssetsView from '../AssetsView';
import { CalendarContext } from '../../core/CalendarContext';

const minCtx = { colorRules: [] as unknown[] };
const sampleAssets = [
  { id: 'asset-1', name: 'N121AB' },
];

function wrap(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={minCtx as unknown as null}>
      <AssetsView
        currentDate={new Date(2026, 3, 10) /* April 10 2026 */}
        events={[]}
        assets={sampleAssets}
        onEventClick={vi.fn()}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

function gridLabel(container: HTMLElement): string {
  const grid = container.querySelector('[role="grid"]');
  return grid?.getAttribute('aria-label') ?? '';
}

describe('AssetsView dayWindow', () => {
  // AssetsView virtualises its day strip (only days that fit the viewport
  // render), so we pin the contract via the aria-label on the role=grid
  // root rather than a raw cell count. The label encodes the underlying
  // date range either way.
  it('falls back to the full calendar month when dayWindow is absent', () => {
    const { container } = wrap();
    expect(gridLabel(container)).toContain('April 2026');
  });

  it('falls back to the calendar month when dayWindow is null', () => {
    const { container } = wrap({ dayWindow: null });
    expect(gridLabel(container)).toContain('April 2026');
  });

  it('renders the dayWindow range in the grid label when set', () => {
    const { container } = wrap({ dayWindow: 7 });
    expect(gridLabel(container)).toContain('Apr 10 – Apr 16, 2026');
  });

  it('crosses month boundaries when the window extends past month-end', () => {
    const { container } = wrap({
      currentDate: new Date(2026, 3, 28),
      dayWindow: 7,
    });
    expect(gridLabel(container)).toContain('Apr 28 – May 4, 2026');
  });

  it('treats dayWindow=0 as no override (legacy month behaviour)', () => {
    const { container } = wrap({ dayWindow: 0 });
    expect(gridLabel(container)).toContain('April 2026');
  });
});

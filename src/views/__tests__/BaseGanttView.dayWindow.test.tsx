// @vitest-environment happy-dom
/**
 * BaseGanttView dayWindow — when the AppShell sub-toolbar's day-window pill
 * is set externally, the internal 14/90 span toggle should yield to it
 * (and vanish, so users don't see two competing controls).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import BaseGanttView from '../BaseGanttView';
import { CalendarContext } from '../../core/CalendarContext';

const currentDate = new Date(2026, 3, 21);
const minCtx = { colorRules: [] as unknown[] };
const baseFixture = [{ id: 'base-1', name: 'Test Base' }];

function wrap(props: Record<string, unknown> = {}) {
  return render(
    <CalendarContext.Provider value={minCtx as unknown as null}>
      <BaseGanttView
        currentDate={currentDate}
        events={[]}
        bases={baseFixture}
        employees={[]}
        assets={[]}
        {...props}
      />
    </CalendarContext.Provider>,
  );
}

describe('BaseGanttView dayWindow', () => {
  it('shows the internal 14/90 span toggle when no external dayWindow is set', () => {
    wrap();
    expect(screen.getByRole('group', { name: /timeline span/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides the internal span toggle when an external dayWindow is set', () => {
    wrap({ dayWindow: 30 });
    expect(screen.queryByRole('group', { name: /timeline span/i })).toBeNull();
  });

  it('keeps the internal span toggle when dayWindow is null (auto)', () => {
    wrap({ dayWindow: null });
    expect(screen.getByRole('group', { name: /timeline span/i })).toBeInTheDocument();
  });

  it('keeps the internal span toggle when dayWindow is 0 (treated as no window)', () => {
    wrap({ dayWindow: 0 });
    expect(screen.getByRole('group', { name: /timeline span/i })).toBeInTheDocument();
  });

  it('renders the visible day cell count to match the external dayWindow', () => {
    const { container } = wrap({ dayWindow: 7 });
    // Day cells live under the timeline column area; pick the .days strip
    // and count its direct children (one element per day).
    const dayStrips = container.querySelectorAll<HTMLElement>('[class*="days"]');
    // Multiple nested .days-class strips render (header + per-row); they
    // all match the same span. Sample the first (header) row.
    expect(dayStrips.length).toBeGreaterThan(0);
    const firstStrip = dayStrips[0];
    expect(firstStrip!.children.length).toBe(7);
  });

  it('renders 14 day cells when no external dayWindow + internal default', () => {
    const { container } = wrap();
    const dayStrips = container.querySelectorAll<HTMLElement>('[class*="days"]');
    const firstStrip = dayStrips[0];
    expect(firstStrip!.children.length).toBe(14);
  });

  it('reflows when the user clicks the internal span 90 button (internal control still works in null mode)', () => {
    const { container } = wrap();
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    const dayStrips = container.querySelectorAll<HTMLElement>('[class*="days"]');
    const firstStrip = dayStrips[0];
    expect(firstStrip!.children.length).toBe(90);
  });
});

// Quiet vi-mock unused-import lint
void vi;

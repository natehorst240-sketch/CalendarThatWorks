// @vitest-environment happy-dom
/**
 * Integration test for Sprint 6 (PR 5): `sort` prop applies sortEngine across
 * the event pipeline. Verifies that WorksCalendar exposes visibleEvents in
 * the order dictated by the `sort` prop — single field and multi-field.
 *
 * Anchor base date to "today" rather than a hardcoded April 2026 ISO so the
 * events always fall in the calendar's visible range. The earlier hardcoded
 * date drifted out of the range as the system clock moved past April 2026
 * (calendar's month view is `startOfWeek(startOfMonth(today))` →
 * `endOfWeek(endOfMonth(today))`, so events 3 weeks before the current
 * month are silently dropped).
 *
 * Each assertion uses `waitFor` because the calendar's event pipeline is
 * post-commit: `engine.setEvents(...)` runs in a useEffect, fires the
 * engine subscription which bumps `engineVer`, and only then do
 * `expandedEvents` / `visibleEvents` re-memo with real data.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';

// Anchor to a fixed point in the current month so day-offsets never spill
// across month boundaries (which would put some events outside the
// month-view range and back into the original drift bug).
const TODAY = new Date();
const base = new Date(TODAY.getFullYear(), TODAY.getMonth(), 10, 0, 0, 0, 0);
function d(days: number) { return new Date(base.getTime() + days * 86400000); }

const events = [
  { id: 'a', title: 'Charlie', start: d(2), end: d(3), meta: { priority: 1 } },
  { id: 'b', title: 'Alpha',   start: d(0), end: d(1), meta: { priority: 3 } },
  { id: 'c', title: 'Bravo',   start: d(1), end: d(2), meta: { priority: 2 } },
  { id: 'd', title: 'Alpha',   start: d(3), end: d(4), meta: { priority: 3 } },
];

describe('WorksCalendar sort prop', () => {
  it('orders visibleEvents by a single string field ascending', async () => {
    const apiRef = createRef<unknown>();
    render(
      <WorksCalendar
        ref={apiRef}
        events={events}
        sort={{ field: 'title', direction: 'asc' }}
      />,
    );
    await waitFor(() => {
      const titles = apiRef.current.getVisibleEvents().map((e: { title: string }) => e.title);
      expect(titles).toEqual(['Alpha', 'Alpha', 'Bravo', 'Charlie']);
    });
  });

  it('supports multi-field sort with tiebreakers', async () => {
    const apiRef = createRef<unknown>();
    render(
      <WorksCalendar
        ref={apiRef}
        events={events}
        sort={[
          { field: 'title', direction: 'asc' },
          { field: 'start', direction: 'desc' },
        ]}
      />,
    );
    await waitFor(() => {
      const ids = apiRef.current.getVisibleEvents().map((e: { id: string }) => e.id);
      // Alphas are tied by title → the later start date wins ('d' before 'b').
      expect(ids).toEqual(['d', 'b', 'c', 'a']);
    });
  });

  it('defaults to start-date order when sort is omitted (baseline preserved)', async () => {
    const apiRef = createRef<unknown>();
    render(<WorksCalendar ref={apiRef} events={events} />);
    await waitFor(() => {
      const ids = apiRef.current.getVisibleEvents().map((e: { id: string }) => e.id);
      // Pipeline default: events surface in chronological start order.
      expect(ids).toEqual(['b', 'c', 'a', 'd']);
    });
  });
});

// @vitest-environment happy-dom
/**
 * Integration test for Sprint 6 (PR 5): `sort` prop applies sortEngine across
 * the event pipeline. Verifies that WorksCalendar exposes visibleEvents in
 * the order dictated by the `sort` prop — single field and multi-field.
 */
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createRef } from 'react';

import { WorksCalendar } from '../WorksCalendar.tsx';

const base = new Date('2026-04-10T00:00:00.000Z');
function d(days: number) { return new Date(base.getTime() + days * 86400000); }

const events = [
  { id: 'a', title: 'Charlie', start: d(2), end: d(3), meta: { priority: 1 } },
  { id: 'b', title: 'Alpha',   start: d(0), end: d(1), meta: { priority: 3 } },
  { id: 'c', title: 'Bravo',   start: d(1), end: d(2), meta: { priority: 2 } },
  { id: 'd', title: 'Alpha',   start: d(3), end: d(4), meta: { priority: 3 } },
];

describe('WorksCalendar sort prop', () => {
  it('orders visibleEvents by a single string field ascending', () => {
    const apiRef = createRef<any>();
    render(
      <WorksCalendar
        ref={apiRef}
        events={events}
        sort={{ field: 'title', direction: 'asc' }}
      />,
    );
    const titles = apiRef.current.getVisibleEvents().map((e: { title: string }) => e.title);
    expect(titles).toEqual(['Alpha', 'Alpha', 'Bravo', 'Charlie']);
  });

  it('supports multi-field sort with tiebreakers', () => {
    const apiRef = createRef<any>();
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
    const ids = apiRef.current.getVisibleEvents().map((e: { id: string }) => e.id);
    // Alphas are tied by title → the later start date wins ('d' before 'b').
    expect(ids).toEqual(['d', 'b', 'c', 'a']);
  });

  it('defaults to start-date order when sort is omitted (baseline preserved)', () => {
    const apiRef = createRef<any>();
    render(<WorksCalendar ref={apiRef} events={events} />);
    const ids = apiRef.current.getVisibleEvents().map((e: { id: string }) => e.id);
    // Pipeline default: events surface in chronological start order.
    expect(ids).toEqual(['b', 'c', 'a', 'd']);
  });
});

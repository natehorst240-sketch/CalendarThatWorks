// @vitest-environment happy-dom
/**
 * SubToolbar day-window pill scoping — the 7/14/30/90 pills only have
 * meaning on the Gantt-style timeline views (Schedule / Base / Assets);
 * on Month / Week / Day / Agenda the pills used to render but did
 * nothing, which is the worst kind of UI. Verify they're hidden there.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

import { WorksCalendar } from '../WorksCalendar.tsx';

afterEach(() => cleanup());

const VIEWS_WITH_PILLS = ['schedule', 'base', 'assets'] as const;
const VIEWS_WITHOUT_PILLS = ['month', 'week', 'day', 'agenda'] as const;

describe('SubToolbar day-window pills — view scoping', () => {
  for (const view of VIEWS_WITH_PILLS) {
    it(`renders the day-window pills on the ${view} view`, () => {
      render(<WorksCalendar events={[]} initialView={view} />);
      expect(screen.getByRole('group', { name: /day window/i })).toBeInTheDocument();
    });
  }

  for (const view of VIEWS_WITHOUT_PILLS) {
    it(`hides the day-window pills on the ${view} view`, () => {
      render(<WorksCalendar events={[]} initialView={view} />);
      expect(screen.queryByRole('group', { name: /day window/i })).toBeNull();
    });
  }
});

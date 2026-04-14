import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

import CalendarErrorBoundary from '../ui/CalendarErrorBoundary.jsx';

describe('WorksCalendar SSR safety + CalendarErrorBoundary', () => {
  it('renders fallback UI when a child throws', () => {
    const Thrower = () => {
      throw new Error('boom');
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByRole } = render(
      <CalendarErrorBoundary>
        <Thrower />
      </CalendarErrorBoundary>,
    );
    expect(getByRole('alert')).toHaveTextContent('Calendar failed to load');
    spy.mockRestore();
  });
});

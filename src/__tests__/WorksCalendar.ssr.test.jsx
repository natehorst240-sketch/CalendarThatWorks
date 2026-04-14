// @vitest-environment node
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { WorksCalendar } from '../WorksCalendar.jsx';

describe('WorksCalendar SSR safety', () => {
  it('returns null during SSR render', () => {
    const html = renderToString(<WorksCalendar events={[]} />);
    expect(html).toBe('');
  });
});

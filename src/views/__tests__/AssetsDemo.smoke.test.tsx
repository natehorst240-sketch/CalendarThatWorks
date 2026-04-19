// @vitest-environment happy-dom
/**
 * AssetsDemoExample — smoke test for the Sprint 4 PR D fixture
 * (examples/assets-demo.jsx).
 *
 * Proves the 20-resource × 200-event demo mounts without crashing and
 * renders the Assets view by default with rowheaders for the visible
 * tail numbers. Guards against regressions from index.js export shape
 * changes (DEFAULT_CATEGORIES, createManualLocationProvider).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

import { AssetsDemoExample } from '../../../examples/assets-demo';

describe('AssetsDemoExample', () => {
  it('mounts without crashing and renders the Assets view by default', () => {
    render(<AssetsDemoExample />);
    expect(screen.getByRole('grid', { name: /Assets timeline/i })).toBeInTheDocument();
  });

  it('renders rowheaders for visible tail numbers', () => {
    render(<AssetsDemoExample />);
    const rowheaders = screen.getAllByRole('rowheader');
    // Row virtualization may not mount all 20 on first paint; cap the
    // assertion at 5 to stay robust to overscan buffer tweaks.
    expect(rowheaders.length).toBeGreaterThanOrEqual(5);
    // Rowheader's visible text includes registration + sublabel + banner;
    // assert that the registration pattern appears somewhere.
    expect(rowheaders[0].textContent).toMatch(/N\d{3}[A-Z]{2}/);
  });
});

// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThemeCustomizer from '../ThemeCustomizer.jsx';

function renderWithConfig(customTheme = {}) {
  const setConfig = vi.fn();

  render(
    <ThemeCustomizer
      theme={customTheme}
      onChange={(updater) => {
        const next = updater({ customTheme });
        setConfig(next);
      }}
    />,
  );

  return { setConfig };
}

describe('ThemeCustomizer', () => {
  it('updates color controls in customTheme', () => {
    const { setConfig } = renderWithConfig({});

    const accent = screen.getByLabelText('Accent');
    fireEvent.change(accent, { target: { value: '#111111' } });

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme.colors.accent).toBe('#111111');
  });

  it('updates density slider and stores as number', () => {
    const { setConfig } = renderWithConfig({});

    const density = screen.getByLabelText(/Density/);
    fireEvent.change(density, { target: { value: '1.15' } });

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme.spacing.density).toBe(1.15);
  });

  it('resets customTheme to defaults payload', () => {
    const { setConfig } = renderWithConfig({ colors: { accent: '#111111' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme).toEqual({});
  });
});

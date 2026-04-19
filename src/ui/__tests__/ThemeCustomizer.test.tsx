// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThemeCustomizer from '../ThemeCustomizer';

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

  it('updates body font from dropdown selection', () => {
    const { setConfig } = renderWithConfig({});

    fireEvent.change(screen.getByLabelText('Body Font'), {
      target: { value: "'Roboto', 'Helvetica Neue', Arial, sans-serif" },
    });

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme.typography.fontFamily).toBe("'Roboto', 'Helvetica Neue', Arial, sans-serif");
  });


  it('updates heading and monospace fonts independently', () => {
    const heading = renderWithConfig({});

    fireEvent.change(screen.getByLabelText('Heading Font'), {
      target: { value: "Georgia, 'Times New Roman', serif" },
    });

    const headingLatest = heading.setConfig.mock.calls.at(-1)[0];
    expect(headingLatest.customTheme.typography.headingFontFamily).toBe("Georgia, 'Times New Roman', serif");

    cleanup();

    const mono = renderWithConfig({});
    fireEvent.change(screen.getAllByLabelText('Monospace Font')[1], {
      target: { value: "'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace" },
    });

    const monoLatest = mono.setConfig.mock.calls.at(-1)[0];
    expect(monoLatest.customTheme.typography.monoFontFamily).toBe("'JetBrains Mono', 'Roboto Mono', 'Courier New', monospace");
  });

  it('resets customTheme to defaults payload', () => {
    const { setConfig } = renderWithConfig({ colors: { accent: '#111111' } });

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme).toEqual({});
  });

  it('applies quick preset payload', () => {
    const { setConfig } = renderWithConfig({});

    fireEvent.click(screen.getByRole('button', { name: 'Midnight' }));

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme.colors.bg).toBe('#0b1020');
    expect(latest.customTheme.colors.accent).toBe('#8b5cf6');
  });

  it('imports valid JSON theme patch', () => {
    const { setConfig } = renderWithConfig({});

    fireEvent.change(screen.getByLabelText('Import theme JSON'), {
      target: { value: '{"colors":{"accent":"#0ea5e9"}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply imported JSON' }));

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme.colors.accent).toBe('#0ea5e9');
    expect(screen.getByRole('status')).toHaveTextContent('Imported and merged');
  });

  it('replaces the theme when replace import mode is selected', () => {
    const { setConfig } = renderWithConfig({ colors: { accent: '#111111' }, borders: { radius: 14 } });

    fireEvent.click(screen.getByLabelText('Replace current theme'));
    fireEvent.change(screen.getByLabelText('Import theme JSON'), {
      target: { value: '{"colors":{"accent":"#0ea5e9"}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply imported JSON' }));

    const latest = setConfig.mock.calls.at(-1)[0];
    expect(latest.customTheme).toEqual({ colors: { accent: '#0ea5e9' } });
    expect(screen.getByRole('status')).toHaveTextContent('Imported and replaced');
  });

  it('shows error for invalid JSON import', () => {
    const { setConfig } = renderWithConfig({});

    fireEvent.change(screen.getByLabelText('Import theme JSON'), {
      target: { value: '{bad json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply imported JSON' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Could not parse JSON.');
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('copies exported JSON to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderWithConfig({});

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));

    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText('Copied JSON to clipboard.')).toBeInTheDocument();
  });

  it('renders contrast checks and rating badges', () => {
    renderWithConfig({});

    expect(screen.getByText('Contrast checks (WCAG)')).toBeInTheDocument();
    expect(screen.getByText('Body text on background')).toBeInTheDocument();
    expect(screen.getAllByText(/AAA|AA|Large text only|Fail/).length).toBeGreaterThan(0);
  });
});

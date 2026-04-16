// @vitest-environment happy-dom
/**
 * Tests that theme selection in the Setup tab (ConfigPanel) and the
 * Setup Wizard both apply the selected theme's customTheme config,
 * so the live calendar and ThemeCustomizer stay in sync.
 *
 * Issue: Theme application from setup does not affect live calendar (#104)
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { THEMES } from '../../styles/themes.js';

// ─── ConfigPanel / SetupTab ───────────────────────────────────────────────────

// Minimal stub for heavyweight sub-components so we can render ConfigPanel
vi.mock('../ThemeCustomizer.jsx', () => ({ default: () => <div data-testid="theme-customizer" /> }));
vi.mock('../SourcePanel.jsx',     () => ({ default: () => <div data-testid="source-panel" /> }));
vi.mock('../AdvancedFilterBuilder.jsx', () => ({ default: () => <div data-testid="filter-builder" /> }));

import ConfigPanel from '../ConfigPanel.jsx';

function renderSetupTab(config = {}, onUpdate = vi.fn()) {
  render(
    <ConfigPanel
      config={{ setup: { preferredTheme: 'light' }, ...config }}
      categories={[]}
      resources={[]}
      onUpdate={onUpdate}
      onClose={vi.fn()}
      onSaveView={vi.fn()}
    />,
  );
  return { onUpdate };
}

describe('ConfigPanel SetupTab — theme selection updates customTheme', () => {
  it('applies customTheme when a theme card is clicked', () => {
    const onUpdate = vi.fn();
    renderSetupTab({}, onUpdate);

    // Click the "Dark" theme button
    const darkThemeBtn = screen.getByTitle(THEMES.find(t => t.id === 'dark').description);
    fireEvent.click(darkThemeBtn);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updater = onUpdate.mock.calls[0][0];
    const result = updater({ setup: { preferredTheme: 'light' }, customTheme: {} });

    expect(result.setup.preferredTheme).toBe('dark');
    expect(result.customTheme).toEqual(THEMES.find(t => t.id === 'dark').customTheme);
  });

  it('sets customTheme colors matching the selected theme', () => {
    const onUpdate = vi.fn();
    renderSetupTab({}, onUpdate);

    const corporateTheme = THEMES.find(t => t.id === 'corporate');
    const btn = screen.getByTitle(corporateTheme.description);
    fireEvent.click(btn);

    const updater = onUpdate.mock.calls[0][0];
    const result = updater({ setup: {}, customTheme: {} });

    expect(result.customTheme.colors.accent).toBe(corporateTheme.customTheme.colors.accent);
    expect(result.customTheme.colors.bg).toBe(corporateTheme.customTheme.colors.bg);
  });

  it('preserves other config fields when updating theme', () => {
    const onUpdate = vi.fn();
    renderSetupTab({}, onUpdate);

    const softTheme = THEMES.find(t => t.id === 'soft');
    fireEvent.click(screen.getByTitle(softTheme.description));

    const updater = onUpdate.mock.calls[0][0];
    const result = updater({ title: 'My Calendar', setup: { completed: true }, customTheme: {} });

    expect(result.title).toBe('My Calendar');
    expect(result.setup.completed).toBe(true);
    expect(result.setup.preferredTheme).toBe('soft');
    expect(result.customTheme).toEqual(softTheme.customTheme);
  });
});

// ─── SetupWizardModal — finish applies customTheme ────────────────────────────

import SetupWizardModal from '../SetupWizardModal.jsx';

function renderWizard(updateConfig = vi.fn()) {
  render(
    <SetupWizardModal
      isOpen
      onClose={vi.fn()}
      updateConfig={updateConfig}
      categories={[]}
      resources={[]}
      onSaveView={vi.fn()}
    />,
  );
  return { updateConfig };
}

async function advanceToFinish() {
  // Step 1 → 2 → 3 → 4 (Finish)
  for (let i = 0; i < 3; i++) {
    const nextBtn = screen.queryByRole('button', { name: /next|continue/i });
    if (nextBtn) fireEvent.click(nextBtn);
  }
}

describe('SetupWizardModal — finish saves customTheme', () => {
  it('includes customTheme in updateConfig when wizard finishes', async () => {
    const updateConfig = vi.fn();
    renderWizard(updateConfig);

    // Select aviation theme in step 1
    const aviationTheme = THEMES.find(t => t.id === 'aviation');
    fireEvent.click(screen.getByTitle(aviationTheme.description));

    await advanceToFinish();

    const finishBtn = screen.getByRole('button', { name: /finish setup/i });
    fireEvent.click(finishBtn);

    expect(updateConfig).toHaveBeenCalledTimes(1);
    const payload = updateConfig.mock.calls[0][0];
    expect(payload.setup.preferredTheme).toBe('aviation');
    expect(payload.customTheme).toEqual(aviationTheme.customTheme);
  });

  it('uses the default theme customTheme when no theme is changed', async () => {
    const updateConfig = vi.fn();
    renderWizard(updateConfig);

    await advanceToFinish();

    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    const payload = updateConfig.mock.calls[0][0];
    // Default is 'corporate' per the wizard initial state
    const corporateTheme = THEMES.find(t => t.id === 'corporate');
    expect(payload.customTheme).toEqual(corporateTheme.customTheme);
  });
});

// ─── THEMES data integrity check ─────────────────────────────────────────────

describe('THEMES — each entry has a valid customTheme', () => {
  const colorKeys = ['accent', 'accentDim', 'bg', 'surface', 'surface2', 'border', 'borderDark', 'text', 'textMuted'];

  THEMES.forEach((theme) => {
    it(`${theme.id} has all required customTheme color fields`, () => {
      expect(theme.customTheme).toBeDefined();
      expect(theme.customTheme.colors).toBeDefined();
      colorKeys.forEach(key => {
        expect(theme.customTheme.colors[key]).toMatch(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, `${theme.id}.colors.${key} should be a hex color`);
      });
    });
  });
});

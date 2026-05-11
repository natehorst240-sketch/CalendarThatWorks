import { describe, it, expect } from 'vitest';
import {
  buildThemeId,
  normalizeTheme,
  resolveCssTheme,
  THEMES,
  THEME_FAMILIES,
  THEME_META,
  DEFAULT_THEME,
} from '../themes';

// ─── THEMES / THEME_FAMILIES ──────────────────────────────────────────────────

describe('THEMES', () => {
  it('contains 12 themes (6 families × 2 modes)', () => {
    expect(THEMES).toHaveLength(12);
  });

  it('every theme id matches family-mode pattern', () => {
    expect(THEMES.every(t => /^[a-z]+-(?:light|dark)$/.test(t))).toBe(true);
  });
});

describe('THEME_FAMILIES', () => {
  it('contains 6 families', () => {
    expect(THEME_FAMILIES).toHaveLength(6);
  });

  it('each family has id, label, description', () => {
    for (const f of THEME_FAMILIES) {
      expect(typeof f.id).toBe('string');
      expect(typeof f.label).toBe('string');
      expect(typeof f.description).toBe('string');
    }
  });
});

// ─── buildThemeId ─────────────────────────────────────────────────────────────

describe('buildThemeId', () => {
  it('combines family and mode with a hyphen', () => {
    expect(buildThemeId('ops', 'dark')).toBe('ops-dark');
    expect(buildThemeId('canvas', 'light')).toBe('canvas-light');
  });
});

// ─── normalizeTheme ───────────────────────────────────────────────────────────

describe('normalizeTheme', () => {
  it('returns DEFAULT_THEME when input is undefined', () => {
    expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
  });

  it('returns DEFAULT_THEME when input is empty string', () => {
    expect(normalizeTheme('')).toBe(DEFAULT_THEME);
  });

  it('maps legacy "light" to "canvas-light"', () => {
    expect(normalizeTheme('light')).toBe('canvas-light');
  });

  it('maps legacy "dark" to "canvas-dark"', () => {
    expect(normalizeTheme('dark')).toBe('canvas-dark');
  });

  it('maps legacy "aviation" to "ops-dark"', () => {
    expect(normalizeTheme('aviation')).toBe('ops-dark');
  });

  it('maps legacy "minimal" to "grid-light"', () => {
    expect(normalizeTheme('minimal')).toBe('grid-light');
  });

  it('maps legacy "corporate" to "corporate-light"', () => {
    expect(normalizeTheme('corporate')).toBe('corporate-light');
  });

  it('maps legacy "soft" to "neon-light"', () => {
    expect(normalizeTheme('soft')).toBe('neon-light');
  });

  it('maps legacy "forest" to "industrial-light"', () => {
    expect(normalizeTheme('forest')).toBe('industrial-light');
  });

  it('maps legacy "ocean" to "corporate-dark"', () => {
    expect(normalizeTheme('ocean')).toBe('corporate-dark');
  });

  it('passes through valid new-style ThemeId', () => {
    expect(normalizeTheme('neon-dark')).toBe('neon-dark');
    expect(normalizeTheme('grid-dark')).toBe('grid-dark');
  });

  it('returns DEFAULT_THEME for unrecognized input', () => {
    expect(normalizeTheme('unknown-theme-xyz')).toBe(DEFAULT_THEME);
  });

  it('returns DEFAULT_THEME for "ops-dark" (the default)', () => {
    expect(normalizeTheme('ops-dark')).toBe('ops-dark');
  });
});

// ─── THEME_META ───────────────────────────────────────────────────────────────

describe('THEME_META', () => {
  it('has an entry for every theme', () => {
    for (const id of THEMES) {
      expect(THEME_META[id]).toBeDefined();
    }
  });

  it('each entry has required fields', () => {
    for (const [id, meta] of Object.entries(THEME_META)) {
      expect(typeof meta.label).toBe('string');
      expect(typeof meta.description).toBe('string');
      expect(typeof meta.dark).toBe('boolean');
      expect(typeof meta.cssTheme).toBe('string');
      expect(meta.id).toBe(id);
    }
  });

  it('dark mode themes have dark=true', () => {
    const darkThemes = THEMES.filter(t => t.endsWith('-dark'));
    for (const id of darkThemes) {
      expect(THEME_META[id].dark).toBe(true);
    }
  });

  it('light mode themes have dark=false', () => {
    const lightThemes = THEMES.filter(t => t.endsWith('-light'));
    for (const id of lightThemes) {
      expect(THEME_META[id].dark).toBe(false);
    }
  });
});

// ─── resolveCssTheme ──────────────────────────────────────────────────────────

describe('resolveCssTheme', () => {
  it('returns default cssTheme when input is undefined', () => {
    const expected = THEME_META[DEFAULT_THEME].cssTheme;
    expect(resolveCssTheme(undefined)).toBe(expected);
  });

  it('passes through legacy CSS names directly', () => {
    expect(resolveCssTheme('aviation')).toBe('aviation');
    expect(resolveCssTheme('corporate')).toBe('corporate');
    expect(resolveCssTheme('soft')).toBe('soft');
    expect(resolveCssTheme('minimal')).toBe('minimal');
    expect(resolveCssTheme('forest')).toBe('forest');
    expect(resolveCssTheme('ocean')).toBe('ocean');
    expect(resolveCssTheme('light')).toBe('light');
    expect(resolveCssTheme('dark')).toBe('dark');
  });

  it('resolves new-style theme id to cssTheme via THEME_META', () => {
    expect(resolveCssTheme('canvas-light')).toBe(THEME_META['canvas-light'].cssTheme);
    expect(resolveCssTheme('ops-dark')).toBe(THEME_META['ops-dark'].cssTheme);
  });

  it('normalizes unknown input before resolving', () => {
    // 'unknown' normalizes to DEFAULT_THEME
    const expected = THEME_META[DEFAULT_THEME].cssTheme;
    expect(resolveCssTheme('unknown-xyz')).toBe(expected);
  });
});

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CUSTOM_THEME,
  mergeTheme,
  normalizeCustomTheme,
  customThemeToCssVars,
} from '../themeSchema';

// ─── DEFAULT_CUSTOM_THEME ─────────────────────────────────────────────────────

describe('DEFAULT_CUSTOM_THEME', () => {
  it('has expected color keys', () => {
    const keys = Object.keys(DEFAULT_CUSTOM_THEME.colors);
    expect(keys).toContain('accent');
    expect(keys).toContain('bg');
    expect(keys).toContain('text');
  });

  it('has typography with baseSize 14', () => {
    expect(DEFAULT_CUSTOM_THEME.typography.baseSize).toBe(14);
  });

  it('has spacing density 1', () => {
    expect(DEFAULT_CUSTOM_THEME.spacing.density).toBe(1);
  });
});

// ─── mergeTheme ───────────────────────────────────────────────────────────────

describe('mergeTheme', () => {
  it('returns base copy when patch is null', () => {
    const base = { a: 1 };
    const result = mergeTheme(base, null);
    expect(result).toEqual({ a: 1 });
    expect(result).not.toBe(base);
  });

  it('returns base copy when patch is undefined', () => {
    const result = mergeTheme({ a: 1 }, undefined);
    expect(result).toEqual({ a: 1 });
  });

  it('shallow-merges primitive values', () => {
    const result = mergeTheme({ a: 1, b: 2 }, { b: 99 });
    expect(result).toEqual({ a: 1, b: 99 });
  });

  it('deep-merges nested objects', () => {
    const base = { colors: { accent: '#000', bg: '#fff' } };
    const patch = { colors: { accent: '#f00' } };
    const result = mergeTheme(base, patch);
    expect(result.colors.accent).toBe('#f00');
    expect(result.colors.bg).toBe('#fff');
  });

  it('does not merge arrays — replaces them', () => {
    const base = { items: [1, 2, 3] };
    const patch = { items: [4, 5] };
    const result = mergeTheme(base, patch);
    expect(result.items).toEqual([4, 5]);
  });

  it('skips patch keys with undefined value', () => {
    const result = mergeTheme({ a: 1 }, { a: undefined });
    expect(result.a).toBe(1);
  });

  it('adds new keys from patch', () => {
    const result = mergeTheme({ a: 1 }, { b: 2 });
    expect(result.b).toBe(2);
  });

  it('handles patch key whose base value is missing (nested)', () => {
    const result = mergeTheme({}, { colors: { accent: '#abc' } });
    expect((result as any).colors.accent).toBe('#abc');
  });
});

// ─── normalizeCustomTheme ─────────────────────────────────────────────────────

describe('normalizeCustomTheme', () => {
  it('returns defaults when called with null', () => {
    const result = normalizeCustomTheme(null);
    expect(result.colors).toBeDefined();
    expect((result as any).typography.baseSize).toBe(14);
  });

  it('returns defaults when called with undefined', () => {
    const result = normalizeCustomTheme(undefined);
    expect((result as any).spacing.density).toBe(1);
  });

  it('merges partial overrides onto defaults', () => {
    const result = normalizeCustomTheme({ colors: { accent: '#123456' } });
    expect((result as any).colors.accent).toBe('#123456');
    expect((result as any).colors.bg).toBe('#ffffff');
  });
});

// ─── customThemeToCssVars ─────────────────────────────────────────────────────

describe('customThemeToCssVars', () => {
  it('returns undefined for null input', () => {
    expect(customThemeToCssVars(null)).toBeUndefined();
  });

  it('returns undefined for empty object input', () => {
    expect(customThemeToCssVars({})).toBeUndefined();
  });

  it('returns a CSS vars map for a valid theme', () => {
    const vars = customThemeToCssVars({ colors: { accent: '#ff0000' } });
    expect(vars).toBeDefined();
    expect(vars!['--wc-accent']).toBe('#ff0000');
  });

  it('includes --wc-bg from defaults when not overridden', () => {
    const vars = customThemeToCssVars({ colors: { accent: '#aaa' } });
    expect(vars!['--wc-bg']).toBe('#ffffff');
  });

  it('outputs --wc-radius with px suffix', () => {
    const vars = customThemeToCssVars({ borders: { radius: 8 } });
    expect(vars!['--wc-radius']).toBe('8px');
  });

  it('outputs --wc-radius-sm with px suffix', () => {
    const vars = customThemeToCssVars({ borders: { radiusSm: 4 } });
    expect(vars!['--wc-radius-sm']).toBe('4px');
  });

  it('outputs --wc-border-width with px suffix', () => {
    const vars = customThemeToCssVars({ borders: { borderWidth: 2 } });
    expect(vars!['--wc-border-width']).toBe('2px');
  });

  it('outputs --wc-base-font-size with px suffix', () => {
    const vars = customThemeToCssVars({ typography: { baseSize: 16 } });
    expect(vars!['--wc-base-font-size']).toBe('16px');
  });

  it('outputs --wc-font-scale as baseSize/14', () => {
    const vars = customThemeToCssVars({ typography: { baseSize: 14 } });
    expect(vars!['--wc-font-scale']).toBe('1.0000');
  });

  it('clamps density to 0.8 when below minimum', () => {
    const vars = customThemeToCssVars({ spacing: { density: 0.1 } });
    expect(vars!['--wc-density']).toBe(0.8);
  });

  it('clamps density to 1.2 when above maximum', () => {
    const vars = customThemeToCssVars({ spacing: { density: 5 } });
    expect(vars!['--wc-density']).toBe(1.2);
  });

  it('uses elevation=0 when negative shadow elevation is given', () => {
    const vars = customThemeToCssVars({ shadows: { elevation: -100 } });
    // elevation is clamped to 0 via Math.max(0, ...)
    expect(vars!['--wc-shadow']).toContain('rgba(0,0,0,0.08)');
  });

  it('falls back to fontFamily when headingFontFamily is absent', () => {
    const vars = customThemeToCssVars({ typography: { fontFamily: 'Arial', headingFontFamily: '' } });
    expect(vars!['--wc-font-heading']).toBe('Arial');
  });

  it('falls back to default mono font when monoFontFamily is absent', () => {
    const vars = customThemeToCssVars({ typography: { monoFontFamily: '' } });
    expect(vars!['--wc-font-mono']).toContain('ui-monospace');
  });

  it('uses provided headingFontFamily when set', () => {
    const vars = customThemeToCssVars({ typography: { headingFontFamily: 'Georgia' } });
    expect(vars!['--wc-font-heading']).toBe('Georgia');
  });

  it('uses provided monoFontFamily when set', () => {
    const vars = customThemeToCssVars({ typography: { monoFontFamily: 'Courier' } });
    expect(vars!['--wc-font-mono']).toBe('Courier');
  });

  it('falls back to 0 via || when elevation is exactly 0', () => {
    // Number(0) || 0 hits the right-hand side of || (elevation is falsy)
    const vars = customThemeToCssVars({ shadows: { elevation: 0 } });
    expect(vars!['--wc-shadow']).toContain('rgba(0,0,0,0.08)');
  });

  it('falls back to 1 via || when density is exactly 0', () => {
    // Number(0) || 1 hits the right-hand side; density defaults to 1 → clamps to 1.0
    const vars = customThemeToCssVars({ spacing: { density: 0 } });
    expect(vars!['--wc-density']).toBe(1);
  });

  it('outputs empty string via ?? when color values are null', () => {
    // Passing null colors through normalizeCustomTheme preserves them
    // (mergeTheme skips undefined, not null), so ?? '' fires
    const vars = customThemeToCssVars({
      colors: {
        accent: null as unknown as string,
        accentDim: null as unknown as string,
        bg: null as unknown as string,
        surface: null as unknown as string,
        surface2: null as unknown as string,
        border: null as unknown as string,
        borderDark: null as unknown as string,
        text: null as unknown as string,
        textMuted: null as unknown as string,
      },
    });
    expect(vars!['--wc-accent']).toBe('');
    expect(vars!['--wc-bg']).toBe('');
    expect(vars!['--wc-text']).toBe('');
  });
});

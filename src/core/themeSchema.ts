export const DEFAULT_CUSTOM_THEME = {
  colors: {
    accent: '#3b82f6',
    accentDim: '#eff6ff',
    bg: '#ffffff',
    surface: '#f8fafc',
    surface2: '#f1f5f9',
    border: '#e2e8f0',
    borderDark: '#cbd5e1',
    text: '#0f172a',
    textMuted: '#64748b',
  },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    headingFontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    monoFontFamily: "ui-monospace, 'Cascadia Code', 'SFMono-Regular', Menlo, monospace",
    baseSize: 14,
  },
  spacing: {
    density: 1,
  },
  borders: {
    radius: 10,
    radiusSm: 6,
    borderWidth: 1,
  },
  shadows: {
    elevation: 10,
  },
};

type ThemeObject = Record<string, unknown>;

export function mergeTheme(base: ThemeObject, patch: ThemeObject | null | undefined): ThemeObject {
  const next: ThemeObject = { ...base };
  for (const key of Object.keys(patch || {})) {
    const value = (patch as ThemeObject)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = mergeTheme((base[key] as ThemeObject) ?? {}, value as ThemeObject);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

export function normalizeCustomTheme(theme: ThemeObject | null | undefined): ThemeObject {
  return mergeTheme(DEFAULT_CUSTOM_THEME as ThemeObject, theme || {});
}

export function customThemeToCssVars(themeInput: ThemeObject | null | undefined): Record<string, string | number> | undefined {
  if (!themeInput || (typeof themeInput === 'object' && Object.keys(themeInput).length === 0)) return undefined;
  const theme = normalizeCustomTheme(themeInput) as {
    colors: Record<string, string>;
    typography: { fontFamily: string; headingFontFamily?: string; monoFontFamily?: string; baseSize: number };
    spacing: { density: number };
    borders: { radius: number; radiusSm: number; borderWidth: number };
    shadows: { elevation: number };
  };
  const e = Math.max(0, Number(theme.shadows.elevation) || 0);
  const density = Math.max(0.8, Math.min(1.2, Number(theme.spacing.density) || 1));

  return {
    '--wc-accent': theme.colors.accent,
    '--wc-accent-dim': theme.colors.accentDim,
    '--wc-bg': theme.colors.bg,
    '--wc-surface': theme.colors.surface,
    '--wc-surface-2': theme.colors.surface2,
    '--wc-border': theme.colors.border,
    '--wc-border-dark': theme.colors.borderDark,
    '--wc-text': theme.colors.text,
    '--wc-text-muted': theme.colors.textMuted,
    '--wc-font': theme.typography.fontFamily,
    '--wc-font-heading': theme.typography.headingFontFamily || theme.typography.fontFamily,
    '--wc-font-mono': theme.typography.monoFontFamily || "ui-monospace, 'Cascadia Code', 'SFMono-Regular', Menlo, monospace",
    '--wc-radius': `${theme.borders.radius}px`,
    '--wc-radius-sm': `${theme.borders.radiusSm}px`,
    '--wc-border-width': `${theme.borders.borderWidth}px`,
    '--wc-shadow': `0 4px ${12 + Math.round(e)}px rgba(0,0,0,${(0.08 + e / 200).toFixed(2)})`,
    '--wc-shadow-sm': `0 1px ${3 + Math.round(e / 3)}px rgba(0,0,0,${(0.05 + e / 250).toFixed(2)})`,
    '--wc-base-font-size': `${theme.typography.baseSize}px`,
    '--wc-font-scale': (theme.typography.baseSize / 14).toFixed(4),
    '--wc-density': density,
  };
}

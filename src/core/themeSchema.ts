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

// Theme shape: nested object whose leaves may be primitives or nested
// objects. Indexed permissively so ThemeCustomizer / customThemeToCssVars
// can access by string key.
type ThemeObject = Record<string, unknown> & {
  colors?: Record<string, string>;
  typography?: Record<string, string | number | undefined>;
  spacing?: Record<string, number | undefined>;
  borders?: Record<string, number | undefined>;
  shadows?: Record<string, number | undefined>;
};

export function mergeTheme(base: ThemeObject, patch: ThemeObject | null | undefined): ThemeObject {
  const next: ThemeObject = { ...base };
  for (const key of Object.keys(patch || {})) {
    const value = (patch as ThemeObject)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const baseChild = (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]))
        ? (base[key] as ThemeObject)
        : {};
      next[key] = mergeTheme(baseChild, value as ThemeObject);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

type DefaultTheme = typeof DEFAULT_CUSTOM_THEME;

export function normalizeCustomTheme(theme: ThemeObject | null | undefined): DefaultTheme {
  return mergeTheme(DEFAULT_CUSTOM_THEME as ThemeObject, theme || {}) as unknown as DefaultTheme;
}

const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|transparent|currentColor|inherit|initial)$/;

function safeColor(value: string | null | undefined, fallback: string): string {
  if (value === null) return '';
  if (!value) return fallback;
  const v = value.trim();
  if (SAFE_COLOR.test(v) || v.startsWith('rgb(') || v.startsWith('rgba(') || v.startsWith('hsl(') || v.startsWith('hsla(')) return v;
  return fallback;
}

function safeFontFamily(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  // Strip anything that could be a CSS injection: semicolons, braces, url(), expression()
  const stripped = value.replace(/[{}]|url\s*\(|expression\s*\(/gi, '').replace(/;/g, '');
  return stripped.trim() || fallback;
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
  const c = theme.colors;

  return {
    '--wc-accent':       safeColor(c['accent'],     '#3b82f6'),
    '--wc-accent-dim':   safeColor(c['accentDim'],  '#eff6ff'),
    '--wc-bg':           safeColor(c['bg'],          '#ffffff'),
    '--wc-surface':      safeColor(c['surface'],     '#f8fafc'),
    '--wc-surface-2':    safeColor(c['surface2'],    '#f1f5f9'),
    '--wc-border':       safeColor(c['border'],      '#e2e8f0'),
    '--wc-border-dark':  safeColor(c['borderDark'],  '#cbd5e1'),
    '--wc-text':         safeColor(c['text'],         '#0f172a'),
    '--wc-text-muted':   safeColor(c['textMuted'],   '#64748b'),
    '--wc-font':         safeFontFamily(theme.typography.fontFamily, "'Inter', system-ui, sans-serif"),
    '--wc-font-heading': safeFontFamily(theme.typography.headingFontFamily || theme.typography.fontFamily, "'Inter', system-ui, sans-serif"),
    '--wc-font-mono':    safeFontFamily(theme.typography.monoFontFamily, "ui-monospace, 'Cascadia Code', 'SFMono-Regular', Menlo, monospace"),
    '--wc-radius':       `${theme.borders.radius}px`,
    '--wc-radius-sm':    `${theme.borders.radiusSm}px`,
    '--wc-border-width': `${theme.borders.borderWidth}px`,
    '--wc-shadow':       `0 4px ${12 + Math.round(e)}px rgba(0,0,0,${(0.08 + e / 200).toFixed(2)})`,
    '--wc-shadow-sm':    `0 1px ${3 + Math.round(e / 3)}px rgba(0,0,0,${(0.05 + e / 250).toFixed(2)})`,
    '--wc-base-font-size': `${theme.typography.baseSize}px`,
    '--wc-font-scale':   (theme.typography.baseSize / 14).toFixed(4),
    '--wc-density':      density,
  };
}

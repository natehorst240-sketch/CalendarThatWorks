import { normalizeCustomTheme, customThemeToCssVars } from '../core/themeSchema.js';
import styles from './ThemeCustomizer.module.css';

const COLOR_CONTROLS = [
  ['accent', 'Accent'],
  ['accentDim', 'Accent Soft'],
  ['bg', 'Background'],
  ['surface', 'Surface'],
  ['surface2', 'Surface 2'],
  ['border', 'Border'],
  ['borderDark', 'Strong Border'],
  ['text', 'Text'],
  ['textMuted', 'Muted Text'],
];

const TOKEN_SLIDERS = [
  ['typography', 'baseSize', 'Base Font Size', 12, 20, 1, 'px'],
  ['spacing', 'density', 'Density', 0.8, 1.2, 0.05, 'x'],
  ['borders', 'radius', 'Radius', 0, 24, 1, 'px'],
  ['borders', 'radiusSm', 'Small Radius', 0, 20, 1, 'px'],
  ['borders', 'borderWidth', 'Border Width', 0, 4, 1, 'px'],
  ['shadows', 'elevation', 'Shadow', 0, 32, 1, ''],
];

function valueLabel(value, suffix) {
  if (suffix === 'x') return `${Number(value).toFixed(2)}x`;
  if (!suffix) return String(value);
  return `${value}${suffix}`;
}

export default function ThemeCustomizer({ theme, onChange }) {
  const merged = normalizeCustomTheme(theme);
  const previewVars = customThemeToCssVars(merged);

  function update(path, value) {
    onChange((config) => {
      const current = normalizeCustomTheme(config.customTheme);
      const [group, key] = path;
      return {
        ...config,
        customTheme: {
          ...current,
          [group]: {
            ...current[group],
            [key]: value,
          },
        },
      };
    });
  }

  return (
    <div className={styles.section}>
      <p>Tune colors and core style tokens. Changes are saved to <code>ownerConfig.customTheme</code>.</p>

      <div className={styles.grid}>
        {COLOR_CONTROLS.map(([key, label]) => (
          <label key={key} className={styles.control}>
            <span>{label}</span>
            <input type="color" value={merged.colors[key]} onChange={(e) => update(['colors', key], e.target.value)} />
          </label>
        ))}

        <label className={styles.control}>
          <span>Font Family</span>
          <input
            type="text"
            value={merged.typography.fontFamily}
            onChange={(e) => update(['typography', 'fontFamily'], e.target.value)}
          />
        </label>

        {TOKEN_SLIDERS.map(([group, key, label, min, max, step, suffix]) => (
          <label key={`${group}.${key}`} className={styles.control}>
            <span>{label} ({valueLabel(merged[group][key], suffix)})</span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={merged[group][key]}
              onChange={(e) => update([group, key], Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className={styles.preview} style={previewVars}>
        <div className={styles.previewHeader}>
          <strong>Live Preview</strong>
          <span className={styles.badge}>Mini Calendar</span>
        </div>
        <div className={styles.previewBody}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className={styles.day}>
              {(i === 2 || i === 8) && <div className={styles.event} />}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.btn} onClick={() => onChange((c) => ({ ...c, customTheme: {} }))}>Reset to default</button>
      </div>
    </div>
  );
}

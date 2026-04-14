import { normalizeCustomTheme, customThemeToCssVars } from '../core/themeSchema.js';
import styles from './ThemeCustomizer.module.css';
import { useMemo, useState } from 'react';

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

const PRESET_THEMES = [
  {
    id: 'default',
    label: 'Default',
    customTheme: {},
  },
  {
    id: 'midnight',
    label: 'Midnight',
    customTheme: {
      colors: {
        accent: '#8b5cf6',
        accentDim: '#2e1065',
        bg: '#0b1020',
        surface: '#121a31',
        surface2: '#1c2744',
        border: '#30406a',
        borderDark: '#3f5487',
        text: '#eff4ff',
        textMuted: '#a4b2d8',
      },
      shadows: { elevation: 18 },
    },
  },
  {
    id: 'warm',
    label: 'Warm',
    customTheme: {
      colors: {
        accent: '#ea580c',
        accentDim: '#fff7ed',
        bg: '#fffaf5',
        surface: '#fff1df',
        surface2: '#ffe7cf',
        border: '#fed7aa',
        borderDark: '#fdba74',
        text: '#4a2a12',
        textMuted: '#9a6a43',
      },
      borders: { radius: 12, radiusSm: 8 },
    },
  },
];

function valueLabel(value, suffix) {
  if (suffix === 'x') return `${Number(value).toFixed(2)}x`;
  if (!suffix) return String(value);
  return `${value}${suffix}`;
}

export default function ThemeCustomizer({ theme, onChange }) {
  const [draftImport, setDraftImport] = useState('');
  const [importError, setImportError] = useState('');
  const merged = normalizeCustomTheme(theme);
  const previewVars = customThemeToCssVars(merged);
  const exportJson = useMemo(() => JSON.stringify(merged, null, 2), [merged]);

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

  function applyPreset(preset) {
    onChange((config) => ({ ...config, customTheme: preset.customTheme }));
  }

  function applyImport() {
    try {
      const parsed = JSON.parse(draftImport);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setImportError('Theme JSON must be an object.');
        return;
      }
      setImportError('');
      onChange((config) => ({ ...config, customTheme: parsed }));
    } catch {
      setImportError('Could not parse JSON. Check formatting and try again.');
    }
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

      <div className={styles.presets}>
        <strong className={styles.blockLabel}>Quick presets</strong>
        <div className={styles.presetRow}>
          {PRESET_THEMES.map((preset) => (
            <button key={preset.id} className={styles.btn} onClick={() => applyPreset(preset)}>
              {preset.label}
            </button>
          ))}
        </div>
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

      <div className={styles.ioSection}>
        <strong className={styles.blockLabel}>Export theme JSON</strong>
        <textarea className={styles.textarea} value={exportJson} readOnly aria-label="Export theme JSON" />
      </div>

      <div className={styles.ioSection}>
        <strong className={styles.blockLabel}>Import theme JSON</strong>
        <textarea
          className={styles.textarea}
          value={draftImport}
          onChange={(e) => setDraftImport(e.target.value)}
          aria-label="Import theme JSON"
          placeholder='{"colors":{"accent":"#00bcd4"}}'
        />
        {importError && <div className={styles.importError} role="alert">{importError}</div>}
        <button className={styles.btn} onClick={applyImport}>Apply imported JSON</button>
      </div>
    </div>
  );
}

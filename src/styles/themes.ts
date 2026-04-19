/**
 * WorksCalendar — Theme Metadata
 *
 * Import this to get all available themes with display info and preview colors.
 *
 * Usage:
 *   import { THEMES } from 'works-calendar/themes';
 *   // or for a specific theme CSS:
 *   import 'works-calendar/styles/aviation';
 *   <WorksCalendar theme="aviation" />
 */

export const THEMES = [
  {
    id: 'light',
    label: 'Default',
    description: 'Clean modern light theme. Blue accent on white.',
    dark: false,
    preview: { bg: '#ffffff', surface: '#f8fafc', accent: '#3b82f6', text: '#0f172a', border: '#e2e8f0' },
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Slate dark mode. Easy on the eyes.',
    dark: true,
    preview: { bg: '#0f172a', surface: '#1e293b', accent: '#3b82f6', text: '#f1f5f9', border: '#334155' },
  },
  {
    id: 'aviation',
    label: 'Aviation',
    description: 'Instrument-panel aesthetic. Dark navy with cyan readouts. Monospace font. Sharp corners.',
    dark: true,
    preview: { bg: '#080c16', surface: '#0d1525', accent: '#00d4ff', text: '#c8e8f0', border: '#1a3a4a' },
  },
  {
    id: 'soft',
    label: 'Soft',
    description: 'Warm cream background, violet accent, very rounded corners. Approachable and friendly.',
    dark: false,
    preview: { bg: '#fffbf7', surface: '#fdf6ee', accent: '#7c3aed', text: '#2d1f0e', border: '#e8d5c0' },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Pure white, near-invisible borders, indigo accent. Typography-first.',
    dark: false,
    preview: { bg: '#ffffff', surface: '#ffffff', accent: '#6366f1', text: '#111827', border: '#f0f0f0' },
  },
  {
    id: 'corporate',
    label: 'Corporate',
    description: 'Professional navy blue. Appropriate for enterprise dashboards.',
    dark: false,
    preview: { bg: '#ffffff', surface: '#f0f4f8', accent: '#1d4ed8', text: '#0f2040', border: '#c9d4e0' },
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Earthy greens and warm browns. Natural, calm feel.',
    dark: false,
    preview: { bg: '#fafdf7', surface: '#f2f8ee', accent: '#15803d', text: '#1a2e12', border: '#c6ddb8' },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Deep ocean blue with sky-blue accents. Dark ambient feel.',
    dark: true,
    preview: { bg: '#0a1628', surface: '#0f1f38', accent: '#0ea5e9', text: '#e0f2fe', border: '#1e3a5a' },
  },
];

/** Convenience map: id → theme object */
export const THEMES_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));

/** IDs of all available themes */
export const THEME_IDS = THEMES.map(t => t.id);

/**
 * configSchema.js — Owner config schema, defaults, and localStorage persistence.
 */

export const DEFAULT_CONFIG = {
  // Hover card field visibility
  hoverCard: {
    showTime:     true,
    showCategory: true,
    showResource: true,
    showMeta:     true,
    showNotes:    true,
  },

  // Per-category custom field definitions
  // eventFields: { [category]: [{ name, type, required, options }] }
  eventFields: {},

  // Display settings
  display: {
    defaultView:  'month',  // month | week | day | agenda | schedule
    weekStartDay: 0,        // 0=Sun, 1=Mon
    dayStart:     6,        // hour (0-23)
    dayEnd:       22,       // hour (0-23)
    showWeekNumbers: false,
    enlargeMonthRowOnHover: false,
  },

  // Access control
  access: {
    viewerPassword: '',   // empty = no viewer lock
  },
};

function mergeDeep(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = mergeDeep(target[key] ?? {}, source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

export function loadConfig(calendarId) {
  const key = `wc-config-${calendarId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_CONFIG;
    return mergeDeep(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(calendarId, config) {
  const key = `wc-config-${calendarId}`;
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {
    // quota exceeded or SSR — silent fail
  }
}

export const FIELD_TYPES = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'select',   label: 'Select (dropdown)' },
  { value: 'date',     label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Textarea' },
];

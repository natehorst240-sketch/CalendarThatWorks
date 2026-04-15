/**
 * configSchema.js — Owner config schema, defaults, and localStorage persistence.
 */

export const DEFAULT_CONFIG = {
  title: 'My WorksCalendar',

  setup: {
    completed: false,
    preferredTheme: 'corporate',
  },

  team: {
    members: [],
  },

  // Hover card field visibility
  hoverCard: {
    showTime: true,
    showCategory: true,
    showResource: true,
    showMeta: true,
    showNotes: true,
  },

  // Per-category custom field definitions
  // eventFields: { [category]: [{ name, type, required, options }] }
  eventFields: {},

  // Display settings
  display: {
    defaultView: 'month',
    weekStartDay: 0,
    dayStart: 6,
    dayEnd: 22,
    showWeekNumbers: false,
    enlargeMonthRowOnHover: false,
  },

  // Filter UI labels editable by owner/dev
  filterUi: {
    groupLabels: {
      categories: 'Categories',
      resources: 'People',
      sources: 'Sources',
      more: 'More',
    },
  },

  // Full custom theme object applied via CSS variable injection.
  customTheme: {},

  // Access control
  access: {
    viewerPassword: '',
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

    const parsed = JSON.parse(raw);
    const merged = mergeDeep(DEFAULT_CONFIG, parsed);

    // Migrate older setup-only data into live config fields.
    if (parsed?.wizardData?.calendarName && !parsed?.title) {
      merged.title = parsed.wizardData.calendarName;
    }

    if (parsed?.wizardData?.preferredTheme && !parsed?.setup?.preferredTheme) {
      merged.setup.preferredTheme = parsed.wizardData.preferredTheme;
    }

    if (Array.isArray(parsed?.wizardData?.teamMembers) && !parsed?.team?.members?.length) {
      merged.team.members = parsed.wizardData.teamMembers;
    }

    if (parsed?.setupCompleted && !parsed?.setup?.completed) {
      merged.setup.completed = true;
    }

    return merged;
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
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'textarea', label: 'Textarea' },
];

/**
 * configSchema.js — Owner config schema, defaults, and localStorage persistence.
 */

/**
 * On-disk schema version for `wc-config-<calendarId>`.
 *
 * History:
 *   (no version)  legacy pre-sprint owner config.
 *   3            implicit version once first-class assets[] landed (#134-9).
 *   4            adds config.approvals block (#134-14). Additive only —
 *                calendars with schemaVersion < 4 auto-merge the defaults on
 *                load so nothing in the UI changes until the owner toggles
 *                `approvals.enabled`.
 */
export const CONFIG_SCHEMA_VERSION = 4;

/** 5-state approval machine shared with AssetsView + AuditDrawer. */
export const APPROVAL_STAGE_IDS = Object.freeze([
  'requested',
  'approved',
  'finalized',
  'pending_higher',
  'denied',
]);

/** Named actions the owner can allow/deny per stage. */
export const APPROVAL_ACTIONS = Object.freeze([
  'approve',
  'deny',
  'finalize',
  'revoke',
]);

function defaultApprovalRules() {
  return {
    requested:      { allow: ['approve', 'deny'], prefix: 'Req' },
    pending_higher: { allow: ['approve', 'deny'], prefix: 'Pend' },
    approved:       { allow: ['finalize', 'revoke'], prefix: '' },
    finalized:      { allow: ['revoke'], prefix: 'Final' },
    denied:         { allow: ['revoke'], prefix: 'Denied' },
  };
}

export const DEFAULT_CONFIG = {
  title: 'My WorksCalendar',
  schemaVersion: CONFIG_SCHEMA_VERSION,

  setup: {
    completed: false,
    preferredTheme: 'corporate',
  },

  team: {
    members: [],
    // Predefined role labels — used as dropdown options when adding/editing employees.
    roles: ['Team Lead', 'DevOps / SRE', 'Software Engineer', 'Site Reliability'],
    // Named locations (bases/buildings/regions). Shape: { id: string, name: string }
    bases: [],
    // UI label for locations — 'Base' or 'Region'. Affects the Base/Region
    // tab label and any other location-facing copy.
    locationLabel: 'Base',
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
    // Which view tabs are visible in the top bar. 'month' and 'week' are
    // always on regardless of this list. Owners toggle the rest from Setup
    // or ConfigPanel → Views.
    enabledViews: ['day', 'agenda', 'schedule', 'base', 'assets'],
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

  // First-class asset registry. When non-empty, AssetsView renders one row
  // per entry (label for display, id matched against event.resource). Empty
  // array preserves the legacy event.resource-derived behavior. Edited from
  // the ConfigPanel → Assets tab; no host redeploy needed to change the fleet.
  // Shape: { id: string, label: string, group?: string, meta?: object }
  assets: [],

  // Owner-configurable RequestForm schema (ticket #134-12). Drives the
  // schema-driven request form in src/ui/RequestForm.jsx. Owners add/
  // remove/reorder fields from ConfigPanel → Request Form with zero
  // host-app redeploy. Host-level validators / onSubmit remain the escape
  // hatch for domain logic.
  //
  // Shape per field: { key, label, type, required?, placeholder?, options? }
  // `options` is a comma-separated string (used by select-type fields).
  // Default ships a minimal three-field schema covering the common case;
  // owners override in place.
  requestForm: {
    fields: [
      { key: 'title',  label: 'Title',  type: 'text',     required: true,  placeholder: 'Short summary' },
      { key: 'start',  label: 'Starts', type: 'datetime', required: true },
      { key: 'notes',  label: 'Notes',  type: 'textarea', required: false, placeholder: 'Optional details' },
    ],
  },

  // Owner-configurable conflict rules (ticket #134-13). Runs via
  // src/core/conflictEngine.ts before an event write. Rules are data, not
  // code — owners add / tune them from ConfigPanel → Conflicts without
  // touching host-app JS. Host callbacks remain the escape hatch.
  //
  // Shape per rule: { id, type, severity?, ...params }. See conflictEngine
  // for the `ConflictRule` union; supported types are 'resource-overlap',
  // 'category-mutex', and 'min-rest'. Default config ships no rules so the
  // engine is a no-op until the owner enables + configures one.
  conflicts: {
    enabled: false,
    rules: [],
  },

  // Owner-configurable approval workflow (ticket #134-14). The runtime
  // machinery (AssetsView pill prefixes, AuditDrawer menus, inline approve
  // actions added later in #134-15) reads this block. `enabled: false`
  // keeps the surface invisible so calendars that never opt in see no
  // behavioral change.
  //
  //   tiers   — ordered approver levels; events promote through this list.
  //             `requires: 'any' | 'all'` decides whether one approver is
  //             enough or every listed role must sign off before promotion.
  //   rules   — per-stage: which actions are allowed and what label prefix
  //             the pill wears (keeps AssetsView prefixes owner-editable).
  //   labels  — button copy shown in the audit drawer + inline pill menu.
  approvals: {
    enabled: false,
    tiers: [
      { id: 'tier-1', label: 'Supervisor', requires: 'any', roles: [] },
      { id: 'tier-2', label: 'Director',   requires: 'any', roles: [] },
    ],
    rules: defaultApprovalRules(),
    labels: {
      approve:  'Approve',
      deny:     'Deny',
      finalize: 'Finalize',
      revoke:   'Revoke',
    },
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

    // Schema-version migration. mergeDeep above already folds in any new
    // DEFAULT_CONFIG keys (e.g. the `approvals` block added in v4), so the
    // migration here is just stamping the current version so we can branch
    // on it in the future without re-scanning every field.
    const storedVersion = typeof parsed.schemaVersion === 'number'
      ? parsed.schemaVersion
      : 3;
    if (storedVersion < CONFIG_SCHEMA_VERSION) {
      merged.schemaVersion = CONFIG_SCHEMA_VERSION;
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

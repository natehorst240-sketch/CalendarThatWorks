// @vitest-environment happy-dom
/**
 * configSchema — schema-version migration + approvals defaults (ticket #134-14).
 *
 * These specs pin the v3 → v4 on-disk migration introduced with the approvals
 * tab. The migration is additive: every calendar loaded from pre-v4 storage
 * must come out with the new `approvals` block seeded to defaults, and the
 * schemaVersion stamp must be bumped so subsequent loads skip the default
 * merge step.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  loadConfig,
  saveConfig,
  DEFAULT_CONFIG,
  CONFIG_SCHEMA_VERSION,
  APPROVAL_STAGE_IDS,
} from '../configSchema';

const CAL_ID = 'test-cal';
const key = `wc-config-${CAL_ID}`;

beforeEach(() => {
  localStorage.clear();
});

describe('configSchema — defaults', () => {
  it('DEFAULT_CONFIG includes an approvals block with all five stages', () => {
    expect(DEFAULT_CONFIG.approvals).toBeTruthy();
    expect(DEFAULT_CONFIG.approvals.enabled).toBe(false);
    for (const stage of APPROVAL_STAGE_IDS) {
      expect(DEFAULT_CONFIG.approvals.rules[stage]).toBeDefined();
      expect(Array.isArray(DEFAULT_CONFIG.approvals.rules[stage].allow)).toBe(true);
    }
  });

  it('DEFAULT_CONFIG carries the current schemaVersion', () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
  });
});

describe('configSchema — v3 → v4 migration', () => {
  it('loads a legacy payload without schemaVersion and stamps the current version', () => {
    // Legacy shape: title + assets only, no schemaVersion.
    localStorage.setItem(key, JSON.stringify({
      title: 'Legacy Cal',
      assets: [{ id: 'a1', label: 'Asset 1' }],
    }));

    const loaded = loadConfig(CAL_ID);
    expect(loaded.title).toBe('Legacy Cal');
    expect(loaded.assets).toEqual([{ id: 'a1', label: 'Asset 1' }]);
    expect(loaded.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
  });

  it('fills in the approvals block on load when the legacy payload lacks it', () => {
    localStorage.setItem(key, JSON.stringify({
      title: 'Legacy Cal',
    }));

    const loaded = loadConfig(CAL_ID);
    expect(loaded.approvals).toBeTruthy();
    expect(loaded.approvals.enabled).toBe(false);
    expect(loaded.approvals.tiers.length).toBeGreaterThan(0);
    for (const stage of APPROVAL_STAGE_IDS) {
      expect(loaded.approvals.rules[stage]).toBeDefined();
    }
  });

  it('preserves an existing approvals block when one is already persisted', () => {
    localStorage.setItem(key, JSON.stringify({
      title: 'Saved Cal',
      schemaVersion: CONFIG_SCHEMA_VERSION,
      approvals: {
        enabled: true,
        tiers: [{ id: 'only-tier', label: 'Only', requires: 'all', roles: ['x'] }],
        rules: { requested: { allow: ['approve'], prefix: 'R' } },
        labels: { approve: 'Sign' },
      },
    }));

    const loaded = loadConfig(CAL_ID);
    expect(loaded.approvals.enabled).toBe(true);
    expect(loaded.approvals.tiers).toHaveLength(1);
    expect(loaded.approvals.tiers[0].id).toBe('only-tier');
    // Default rules merge in for stages the owner didn't override.
    expect(loaded.approvals.rules.requested.allow).toEqual(['approve']);
    expect(loaded.approvals.rules.approved).toBeDefined();
    expect(loaded.approvals.labels.approve).toBe('Sign');
  });

  it('saveConfig round-trips the approvals block through localStorage', () => {
    const next = {
      ...DEFAULT_CONFIG,
      approvals: {
        ...DEFAULT_CONFIG.approvals,
        enabled: true,
        labels: { ...DEFAULT_CONFIG.approvals.labels, approve: 'Okay' },
      },
    };
    saveConfig(CAL_ID, next);
    const loaded = loadConfig(CAL_ID);
    expect(loaded.approvals.enabled).toBe(true);
    expect(loaded.approvals.labels.approve).toBe('Okay');
  });
});

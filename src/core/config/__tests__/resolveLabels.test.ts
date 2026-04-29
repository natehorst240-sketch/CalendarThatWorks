/**
 * resolveLabels — sprint #424 wk5.
 *
 * Single source of truth for the label abstraction layer; views call
 * it to get a fully-defaulted dict back. Resolution order is
 * `config.labels` → profile preset default → built-in fallback.
 */
import { describe, it, expect } from 'vitest';

import { resolveLabels } from '../resolveLabels';

describe('resolveLabels', () => {
  it('falls back to generic labels when no profile + no overrides', () => {
    const out = resolveLabels(null);
    expect(out.resource).toBe('Resource');
    expect(out.event).toBe('Event');
    expect(out.location).toBe('Location');
  });

  it('reads profile preset defaults when no overrides are set', () => {
    const air = resolveLabels({ profile: 'air_medical' });
    expect(air.resource).toBe('Aircraft');
    expect(air.event).toBe('Mission');
    expect(air.location).toBe('Base');

    const equip = resolveLabels({ profile: 'equipment_rental' });
    expect(equip.resource).toBe('Equipment');
    expect(equip.event).toBe('Rental');
    expect(equip.location).toBe('Yard');
  });

  it('explicit overrides win over profile preset defaults', () => {
    const out = resolveLabels({
      profile: 'air_medical',
      labels: { resource: 'Helicopter' },
    });
    expect(out.resource).toBe('Helicopter');
    // Other keys still pull the air-medical preset defaults.
    expect(out.event).toBe('Mission');
  });

  it('pluralizes the canonical labels with sensible defaults', () => {
    expect(resolveLabels({ profile: 'trucking' }).resources).toBe('Trucks');
    expect(resolveLabels({ profile: 'air_medical' }).events).toBe('Missions');
    expect(resolveLabels({ profile: 'equipment_rental' }).locations).toBe('Yards');
  });

  it('honours explicit plural overrides for irregular nouns', () => {
    const out = resolveLabels({ labels: { resource: 'Box', resources: 'Boxen' } });
    expect(out.resource).toBe('Box');
    expect(out.resources).toBe('Boxen');
  });

  it('passes through extra free-form labels from preset and host', () => {
    const out = resolveLabels({
      profile: 'air_medical',
      labels: { aircraft: 'Rotor', mission: 'Run' },
    });
    expect(out['aircraft']).toBe('Rotor');
    expect(out['mission']).toBe('Run');
  });

  /* ── Boundary coercion (Codex feedback on PR #469) ─────────────────────
     Owner config is loaded from raw JSON without runtime validation, so
     a stray `labels.event: 42` must NOT crash callers that downstream
     `.toLowerCase()` the result. Coerce non-strings to fallbacks here. */

  it('coerces non-string canonical labels to the fallback ladder', () => {
    const out = resolveLabels({
      profile: 'air_medical',
      // Intentionally pathological — numbers / nulls / objects.
      labels: { event: 42, resource: null, location: { x: 1 } } as unknown as Record<string, string>,
    });
    // Numeric/null/object overrides discarded → fall through to preset.
    expect(out.event).toBe('Mission');
    expect(out.resource).toBe('Aircraft');
    expect(out.location).toBe('Base');
    // The downstream `.toLowerCase()` that the toolbar runs must never throw.
    expect(() => out.event.toLowerCase()).not.toThrow();
  });

  it('treats empty / whitespace-only overrides as missing', () => {
    const out = resolveLabels({
      profile: 'trucking',
      labels: { event: '   ', resource: '' },
    });
    expect(out.event).toBe('Load');
    expect(out.resource).toBe('Truck');
  });

  it('drops non-string free-form keys instead of leaking them through', () => {
    const out = resolveLabels({
      labels: { aircraft: 42, mission: 'Run' } as unknown as Record<string, string>,
    });
    expect(out['mission']).toBe('Run');
    expect(out['aircraft']).toBeUndefined();
  });

  it('survives a non-object labels value at the boundary', () => {
    const out = resolveLabels({
      profile: 'air_medical',
      labels: 'not-an-object' as unknown as Record<string, string>,
    });
    expect(out.event).toBe('Mission');
    expect(out.resource).toBe('Aircraft');
  });
});

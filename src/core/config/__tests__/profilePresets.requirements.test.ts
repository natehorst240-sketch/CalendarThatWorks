/**
 * Multi-industry preset × requirements engine — sprint #424 wk5.
 *
 * Confirms that the new air-medical preset wires up end-to-end: the
 * sample data tagged with the preset's role ids satisfies the
 * preset's requirement template via `evaluateRequirements`. This is
 * the "switching profiles changes terminology and defaults without
 * changing logic" success criterion from the issue.
 */
import { describe, it, expect } from 'vitest';

import { PROFILE_PRESETS, getProfileSampleData } from '../profilePresets';
import { evaluateRequirements } from '../../requirements/evaluateRequirements';
import type { Assignment } from '../../engine/schema/assignmentSchema';
import type { EngineResource } from '../../engine/schema/resourceSchema';

describe('profile presets × requirements engine', () => {
  it('air_medical sample crew satisfies the mission requirement template', () => {
    const config = PROFILE_PRESETS.air_medical.config;
    const sample = getProfileSampleData('air_medical')!;

    // Map sample resources into the engine shape — capabilities
    // promote to `meta.capabilities`, sample meta merges in.
    const resources = new Map<string, EngineResource>(sample.resources.map(r => [
      r.id,
      {
        id: r.id, name: r.name,
        meta: {
          ...(r.capabilities ? { capabilities: r.capabilities } : {}),
          ...(r.meta ?? {}),
        },
      } as EngineResource,
    ]));

    // Assign the sampled crew to a single mission event.
    const assignments = new Map<string, Assignment>([
      ['x1', { id: 'x1', eventId: 'm1', resourceId: 'pic-1', units: 100 }],
      ['x2', { id: 'x2', eventId: 'm1', resourceId: 'fm-1',  units: 100 }],
      ['x3', { id: 'x3', eventId: 'm1', resourceId: 'fn-1',  units: 100 }],
    ]);

    const out = evaluateRequirements({
      event: { id: 'm1', category: 'mission' },
      requirements: config.requirements ?? [],
      resources,
      assignments,
    });

    expect(out.noTemplate).toBe(false);
    expect(out.satisfied).toBe(true);
    expect(out.missing).toEqual([]);
  });

  it('air_medical mission with no flight nurse reports a hard role shortfall', () => {
    const config = PROFILE_PRESETS.air_medical.config;
    const resources = new Map<string, EngineResource>([
      ['pic-1', { id: 'pic-1', name: 'PIC', meta: { roles: ['pilot-in-command'] } } as EngineResource],
      ['fm-1',  { id: 'fm-1',  name: 'FP',  meta: { roles: ['flight-paramedic'] } } as EngineResource],
    ]);
    const assignments = new Map<string, Assignment>([
      ['x1', { id: 'x1', eventId: 'm1', resourceId: 'pic-1', units: 100 }],
      ['x2', { id: 'x2', eventId: 'm1', resourceId: 'fm-1',  units: 100 }],
    ]);

    const out = evaluateRequirements({
      event: { id: 'm1', category: 'mission' },
      requirements: config.requirements ?? [],
      resources,
      assignments,
    });

    expect(out.satisfied).toBe(false);
    const nurseShortfall = out.missing.find(s => s.kind === 'role' && s.role === 'flight-nurse');
    expect(nurseShortfall).toBeDefined();
    expect(nurseShortfall?.severity).toBe('hard');
  });

  it('equipment_rental rental flags soft-only attendant shortfall — still satisfied', () => {
    const config = PROFILE_PRESETS.equipment_rental.config;
    const out = evaluateRequirements({
      event: { id: 'r1', category: 'rental' },
      requirements: config.requirements ?? [],
      resources: new Map(),
      assignments: new Map(),
    });
    // Soft shortfalls leave `satisfied: true` while still surfacing in
    // the missing trail — exactly what soft means in the engine.
    expect(out.satisfied).toBe(true);
    expect(out.missing).toHaveLength(1);
    expect(out.missing[0]?.severity).toBe('soft');
  });
});

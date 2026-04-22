import { describe, it, expect } from 'vitest';
import { toInput, fromInput, buildRrule } from '../ScheduleEditorForm';

describe('ScheduleEditorForm helpers', () => {
  it('toInput returns empty string for invalid date', () => {
    expect(toInput('invalid-date', false)).toBe('');
  });

  it('fromInput returns null for invalid input', () => {
    expect(fromInput('invalid', false)).toBeNull();
  });

  it('buildRrule returns null for missing start date', () => {
    expect(buildRrule('weekly', '')).toBeNull();
  });

  it('buildRrule builds weekly rule when valid', () => {
    const result = buildRrule('weekly', '2026-04-01T10:00');
    expect(result).toContain('FREQ=WEEKLY');
  });
});

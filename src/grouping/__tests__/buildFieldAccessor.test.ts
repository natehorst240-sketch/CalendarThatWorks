import { describe, it, expect } from 'vitest';
import { buildFieldAccessor } from '../buildFieldAccessor';

describe('buildFieldAccessor — employee mode', () => {
  const accessor = buildFieldAccessor('role', 'employee');

  it('extracts emp.role directly', () => {
    expect(accessor({ emp: { role: 'Nurse' } })).toBe('Nurse');
  });

  it('falls back to emp.meta.role', () => {
    expect(accessor({ emp: { meta: { role: 'Doctor' } } })).toBe('Doctor');
  });

  it('returns null when field is missing', () => {
    expect(accessor({ emp: {} })).toBeNull();
  });

  it('returns null when emp is absent', () => {
    expect(accessor({})).toBeNull();
  });
});

describe('buildFieldAccessor — resource mode', () => {
  const accessor = buildFieldAccessor('department', 'resource');

  it('extracts first event department', () => {
    const row = { events: [{ department: 'Engineering' }] };
    expect(accessor(row)).toBe('Engineering');
  });

  it('falls back to first event meta.department', () => {
    const row = { events: [{ meta: { department: 'Design' } }] };
    expect(accessor(row)).toBe('Design');
  });

  it('returns null when no events', () => {
    expect(accessor({ events: [] })).toBeNull();
  });

  it('returns null when field missing from event', () => {
    expect(accessor({ events: [{}] })).toBeNull();
  });
});

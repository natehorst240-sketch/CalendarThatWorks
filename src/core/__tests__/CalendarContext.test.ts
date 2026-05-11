// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveColor } from '../CalendarContext';
import type { NormalizedEvent } from '../../types/events';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'ev-1',
    title: 'Meeting',
    start: new Date('2026-06-10T09:00:00Z'),
    end:   new Date('2026-06-10T10:00:00Z'),
    allDay: false,
    category: 'work',
    color: '#3b82f6',
    resource: null,
    status: 'confirmed',
    lifecycle: null,
    meta: {},
    rrule: null,
    exdates: [],
    _raw: {} as any,
    ...overrides,
  };
}

describe('resolveColor', () => {
  it('returns ev.color when colorRules is undefined', () => {
    const ev = makeEvent({ color: '#ff0000' });
    expect(resolveColor(ev, undefined)).toBe('#ff0000');
  });

  it('returns ev.color when colorRules is empty', () => {
    const ev = makeEvent({ color: '#00ff00' });
    expect(resolveColor(ev, [])).toBe('#00ff00');
  });

  it('applies function rule (when) when it returns true', () => {
    const ev = makeEvent({ category: 'urgent' });
    const rules = [{ when: (e: NormalizedEvent) => e.category === 'urgent', color: '#ff0000' }];
    expect(resolveColor(ev, rules)).toBe('#ff0000');
  });

  it('skips function rule when it returns false, falls back to ev.color', () => {
    const ev = makeEvent({ category: 'normal', color: '#aaaaaa' });
    const rules = [{ when: (e: NormalizedEvent) => e.category === 'urgent', color: '#ff0000' }];
    expect(resolveColor(ev, rules)).toBe('#aaaaaa');
  });

  it('applies declarative rule when field matches value', () => {
    const ev = makeEvent({ category: 'PTO' });
    const rules = [{ field: 'category', value: 'PTO', color: '#22c55e' }];
    expect(resolveColor(ev, rules)).toBe('#22c55e');
  });

  it('skips declarative rule when field does not match, falls back to ev.color', () => {
    const ev = makeEvent({ category: 'Meeting', color: '#bbbbbb' });
    const rules = [{ field: 'category', value: 'PTO', color: '#22c55e' }];
    expect(resolveColor(ev, rules)).toBe('#bbbbbb');
  });

  it('returns undefined when function rule matches but color is not a string', () => {
    const ev = makeEvent();
    const rules = [{ when: () => true, color: 42 }];
    expect(resolveColor(ev, rules)).toBeUndefined();
  });

  it('returns undefined when declarative rule matches but color is not a string', () => {
    const ev = makeEvent({ category: 'PTO' });
    const rules = [{ field: 'category', value: 'PTO', color: 42 }];
    expect(resolveColor(ev, rules)).toBeUndefined();
  });

  it('uses first matching rule (function overrides declarative)', () => {
    const ev = makeEvent({ category: 'PTO' });
    const rules = [
      { when: () => true, color: '#first' },
      { field: 'category', value: 'PTO', color: '#second' },
    ];
    expect(resolveColor(ev, rules)).toBe('#first');
  });

  it('silently ignores rules that throw and continues to next', () => {
    const ev = makeEvent({ category: 'PTO', color: '#fallback' });
    const rules = [
      { when: () => { throw new Error('boom'); }, color: '#error' },
      { field: 'category', value: 'PTO', color: '#ok' },
    ];
    expect(resolveColor(ev, rules)).toBe('#ok');
  });

  it('skips function rule (no match) and tries declarative rule next', () => {
    const ev = makeEvent({ category: 'PTO' });
    const rules = [
      { when: () => false, color: '#no' },
      { field: 'category', value: 'PTO', color: '#yes' },
    ];
    expect(resolveColor(ev, rules)).toBe('#yes');
  });

  it('skips declarative rule when field key is absent in rule', () => {
    const ev = makeEvent({ color: '#default' });
    const rules = [{ value: 'PTO', color: '#no' }]; // no 'field' key
    expect(resolveColor(ev, rules)).toBe('#default');
  });
});

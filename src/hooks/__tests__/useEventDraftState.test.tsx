// @vitest-environment happy-dom
/**
 * useEventDraftState — unit tests for state management, validation,
 * template application, and RRULE generation.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useEventDraftState } from '../useEventDraftState';

const START = new Date('2026-04-14T09:00:00.000Z');
const END   = new Date('2026-04-14T10:00:00.000Z');

function makeEvent(overrides = {}) {
  return { id: 'wc-temp', title: 'Stand-up', start: START, end: END, ...overrides };
}

function renderDraft(event = makeEvent(), categories = ['Ops'], config = { eventFields: {} }) {
  return renderHook(() => useEventDraftState(event, categories, config));
}

/* ═══════════════════════════════════════════════════════════════════════════
   Initial state
═══════════════════════════════════════════════════════════════════════════ */

describe('useEventDraftState — initial state', () => {
  it('initialises values from the event prop', () => {
    const { result } = renderDraft(makeEvent({ title: 'Hello', category: 'Ops' }), ['Ops']);
    expect(result.current.values.title).toBe('Hello');
    expect(result.current.values.category).toBe('Ops');
  });

  it('defaults templateId to "none"', () => {
    const { result } = renderDraft();
    expect(result.current.templateId).toBe('none');
  });

  it('infers recurrence preset from existing rrule', () => {
    const { result } = renderDraft(makeEvent({ rrule: 'FREQ=DAILY' }));
    expect(result.current.recurrencePreset).toBe('daily');
  });

  it('infers custom preset for unrecognised rrule', () => {
    const { result } = renderDraft(makeEvent({ rrule: 'FREQ=HOURLY' }));
    expect(result.current.recurrencePreset).toBe('custom');
    expect(result.current.customRrule).toBe('FREQ=HOURLY');
  });

  it('allCats merges categories prop with config.eventFields keys', () => {
    const { result } = renderDraft(makeEvent(), ['A'], { eventFields: { B: [] } });
    expect(result.current.allCats).toContain('A');
    expect(result.current.allCats).toContain('B');
  });

  it('defaults end to start + 1h when no event is supplied', () => {
    const { result } = renderHook(() => useEventDraftState(null, ['Ops'], { eventFields: {} }));
    const start = new Date(result.current.values.start);
    const end = new Date(result.current.values.end);
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });

  it('defaults end to start + 1h when event has start but no end', () => {
    const event = { title: '', start: START };
    const { result } = renderHook(() => useEventDraftState(event, ['Ops'], { eventFields: {} }));
    const start = new Date(result.current.values.start);
    const end = new Date(result.current.values.end);
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);
  });

  it('preserves the event\'s end when both start and end are supplied', () => {
    const event = {
      title: '',
      start: new Date('2026-04-14T09:00:00'),
      end:   new Date('2026-04-14T11:30:00'),
    };
    const { result } = renderHook(() => useEventDraftState(event, ['Ops'], { eventFields: {} }));
    const start = new Date(result.current.values.start);
    const end = new Date(result.current.values.end);
    expect(end.getTime() - start.getTime()).toBe(2.5 * 60 * 60 * 1000);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   set / setMeta
═══════════════════════════════════════════════════════════════════════════ */

describe('useEventDraftState — set / setMeta', () => {
  it('set updates a top-level field', () => {
    const { result } = renderDraft();
    act(() => result.current.set('title', 'New title'));
    expect(result.current.values.title).toBe('New title');
  });

  it('setMeta merges into the meta object', () => {
    const { result } = renderDraft();
    act(() => result.current.setMeta('flightNo', 'AA123'));
    expect(result.current.values.meta.flightNo).toBe('AA123');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Validation
═══════════════════════════════════════════════════════════════════════════ */

describe('useEventDraftState — validate', () => {
  it('returns true and clears errors for a valid event', () => {
    const { result } = renderDraft();
    let ok;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it('returns false and sets errors.title when title is empty', () => {
    const { result } = renderDraft(makeEvent({ title: '' }));
    let ok;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(result.current.errors.title).toMatch(/required/i);
  });

  it('returns false when end is before start', () => {
    const { result } = renderDraft(makeEvent({ end: new Date('2026-04-14T08:00:00.000Z') }));
    let ok;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(result.current.errors.end).toMatch(/after/i);
  });

  it('returns false when start equals end (issue #144: client/engine parity)', () => {
    // Zero-duration drafts must be rejected client-side so the inline
    // field error fires before the engine alertdialog has a chance to.
    const { result } = renderDraft(makeEvent({ end: START }));
    let ok;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(result.current.errors.end).toMatch(/after/i);
  });

  it('returns false when a required custom field is missing', () => {
    const config = { eventFields: { Ops: [{ name: 'tailNo', type: 'text', required: true }] } };
    const { result } = renderDraft(makeEvent({ category: 'Ops' }), ['Ops'], config);
    let ok;
    act(() => { ok = result.current.validate(); });
    expect(ok).toBe(false);
    expect(result.current.errors['meta_tailNo']).toBeDefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   buildRRule
═══════════════════════════════════════════════════════════════════════════ */

describe('useEventDraftState — buildRRule', () => {
  it('returns null for "none" preset', () => {
    const { result } = renderDraft();
    expect(result.current.buildRRule()).toBeNull();
  });

  it('returns FREQ=DAILY for "daily" preset', () => {
    const { result } = renderDraft(makeEvent({ rrule: 'FREQ=DAILY' }));
    expect(result.current.buildRRule()).toBe('FREQ=DAILY');
  });

  it('returns weekday rrule for "weekdays" preset', () => {
    const { result } = renderDraft();
    act(() => result.current.setRecurrencePreset('weekdays'));
    expect(result.current.buildRRule()).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('returns normalised custom rrule for "custom" preset', () => {
    const { result } = renderDraft(makeEvent({ rrule: 'FREQ=HOURLY' }));
    // preset should be 'custom', customRrule should be 'FREQ=HOURLY'
    expect(result.current.buildRRule()).toBe('FREQ=HOURLY');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   applyTemplate
═══════════════════════════════════════════════════════════════════════════ */

describe('useEventDraftState — applyTemplate', () => {
  it('applies dailyStandup template defaults', () => {
    const { result } = renderDraft(makeEvent({ title: '' }));
    act(() => result.current.applyTemplate('dailyStandup'));
    expect(result.current.values.title).toBe('Daily standup');
    expect(result.current.recurrencePreset).toBe('weekdays');
    expect(result.current.values.meta).toMatchObject({
      templateId: 'dailyStandup',
      templateVersion: 1,
    });
  });

  it('template meta survives a category change that fires in the same tick', () => {
    const { result } = renderDraft(makeEvent({ title: '' }));
    act(() => result.current.applyTemplate('dailyStandup'));
    // The dailyStandup template sets a category; the category-change effect
    // must NOT wipe templateId/templateVersion.
    expect(result.current.values.meta.templateId).toBe('dailyStandup');
  });
});

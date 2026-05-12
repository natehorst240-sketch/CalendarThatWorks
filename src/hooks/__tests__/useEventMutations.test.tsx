/**
 * useEventMutations — runtime-guard regression tests.
 *
 * Covers:
 * - Invalid-date guard in `handleEventSave` (issue #599 P0-5)
 * - Ghost-delete guard in `handleEventDelete` (issue #599 P0-6)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useEventMutations } from '../useEventMutations';
import { CalendarEngine } from '../../core/engine/CalendarEngine';
import { fromLegacyEvents } from '../../core/engine/adapters/fromLegacyEvents';
import type { MutationEventInput } from '../../types/engineOps';

afterEach(() => cleanup());

const NO_EVENTS: never[] = [];
const OWNER_CFG = {};

function setup() {
  const applyEngineOp = vi.fn();
  const applyWithRecurringCheck = vi.fn();
  const engine = new CalendarEngine();
  const getSavedEventPayload = vi.fn(() => null);
  const setFormEvent = vi.fn();
  const setInlineEditTarget = vi.fn();
  const { result } = renderHook(() =>
    useEventMutations({
      applyEngineOp,
      applyWithRecurringCheck,
      getSavedEventPayload,
      engine,
      engineVer: 0,
      expandedEvents: NO_EVENTS,
      ownerConfig: OWNER_CFG,
      inlineEditTarget: null,
      setFormEvent,
      setInlineEditTarget,
    }),
  );
  return { result, applyEngineOp, applyWithRecurringCheck };
}

describe('useEventMutations — handleEventDelete ghost-delete guard (issue #599 P0-6)', () => {
  it('skips and warns when event id not found in engine or expandedEvents', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, applyWithRecurringCheck } = setup();

    act(() => result.current.handleEventDelete('ghost-id'));

    expect(applyWithRecurringCheck).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('event not found'),
      expect.objectContaining({ id: 'ghost-id' }),
    );
    warnSpy.mockRestore();
  });

  it('proceeds when event exists in engine state even if not in expandedEvents', () => {
    // Seed the engine with a real event so engine.state.events.has() returns true.
    const engine = new CalendarEngine();
    engine.setEvents(fromLegacyEvents([{ id: 'e1', title: 'Test', start: new Date(2026, 0, 1), end: new Date(2026, 0, 1, 1), allDay: false }]));
    const applyWithRecurringCheck2 = vi.fn();
    const { result: r2 } = renderHook(() =>
      useEventMutations({
        applyEngineOp: vi.fn(),
        applyWithRecurringCheck: applyWithRecurringCheck2,
        getSavedEventPayload: vi.fn(() => null),
        engine,
        engineVer: 0,
        expandedEvents: [], // NOT in expandedEvents
        ownerConfig: OWNER_CFG,
        inlineEditTarget: null,
        setFormEvent: vi.fn(),
        setInlineEditTarget: vi.fn(),
      }),
    );

    act(() => r2.current.handleEventDelete('e1'));

    expect(applyWithRecurringCheck2).toHaveBeenCalledTimes(1);
  });
});

describe('useEventMutations — handleEventSave invalid-date guard', () => {
  it('drops a save with an unparseable start date (no engine op, logs an error)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, applyEngineOp, applyWithRecurringCheck } = setup();

    act(() => result.current.handleEventSave({ start: 'not a date', end: new Date(2026, 0, 1) } as MutationEventInput));

    expect(applyEngineOp).not.toHaveBeenCalled();
    expect(applyWithRecurringCheck).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('drops a save with an unparseable end date', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, applyEngineOp } = setup();

    act(() => result.current.handleEventSave({ start: new Date(2026, 0, 1), end: 'whenever' } as MutationEventInput));

    expect(applyEngineOp).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('still creates an event when start/end are valid', () => {
    const { result, applyEngineOp } = setup();

    act(() =>
      result.current.handleEventSave({
        title: 'New thing',
        start: new Date(2026, 0, 1, 9, 0),
        end: new Date(2026, 0, 1, 10, 0),
      } as MutationEventInput),
    );

    expect(applyEngineOp).toHaveBeenCalledTimes(1);
    const [op] = applyEngineOp.mock.calls[0] as [{ type: string }];
    expect(op.type).toBe('create');
  });
});

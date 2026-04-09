/**
 * CalendarEngine — framework-agnostic state container.
 *
 * Usage:
 *   const engine = new CalendarEngine({ events: [...], view: 'month' });
 *   const unsub = engine.subscribe(state => console.log(state));
 *   engine.dispatch({ type: 'NAVIGATE_NEXT' });
 *   unsub();
 */

import { applyOperation } from './operations.js';
import type {
  CalendarState,
  CalendarEngineInit,
  EngineEvent,
  FilterState,
  Operation,
  StateListener,
  Unsubscribe,
} from './types.js';

// ─── Initial state ────────────────────────────────────────────────────────────

export function createInitialState(init: CalendarEngineInit = {}): CalendarState {
  const eventMap = new Map<string, EngineEvent>();
  for (const ev of init.events ?? []) {
    eventMap.set(ev.id, ev);
  }

  const defaultFilter: FilterState = {
    search: '',
    categories: new Set(),
    resources: new Set(),
  };

  const filter: FilterState = init.filter
    ? {
        search: init.filter.search ?? '',
        categories: init.filter.categories ?? new Set(),
        resources: init.filter.resources ?? new Set(),
      }
    : defaultFilter;

  return {
    events: eventMap,
    view: init.view ?? 'month',
    cursor: init.cursor ?? new Date(),
    filter,
    config: init.config ?? {},
    selection: new Set(),
  };
}

// ─── Engine class ─────────────────────────────────────────────────────────────

export class CalendarEngine {
  private _state: CalendarState;
  private _listeners: Set<StateListener> = new Set();

  constructor(init: CalendarEngineInit = {}) {
    this._state = createInitialState(init);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get state(): CalendarState {
    return this._state;
  }

  /**
   * Dispatch an operation.  State is updated synchronously; all subscribers
   * are notified immediately after.  Returns the new state.
   */
  dispatch(op: Operation): CalendarState {
    const next = applyOperation(this._state, op);
    if (next !== this._state) {
      this._state = next;
      this._notify();
    }
    return this._state;
  }

  /**
   * Subscribe to state changes.  The listener is called with the new state
   * after every dispatch that produces a state change.
   *
   * Returns an unsubscribe function.
   */
  subscribe(listener: StateListener): Unsubscribe {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  /**
   * Convenience: replace all events in one call (e.g. on remote data refresh).
   * Dispatches CREATE_EVENT for each event; existing events with the same id
   * are overwritten via UPDATE_EVENT.
   */
  setEvents(events: ReadonlyArray<EngineEvent>): void {
    // Build fresh state rather than dispatching N ops to avoid N notifications.
    const map = new Map<string, EngineEvent>(
      events.map(ev => [ev.id, ev]),
    );
    this._state = { ...this._state, events: map };
    this._notify();
  }

  /** Reset to a fresh initial state, optionally preserving config. */
  reset(init: CalendarEngineInit = {}): void {
    this._state = createInitialState({
      config: this._state.config,
      ...init,
    });
    this._notify();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _notify(): void {
    for (const listener of this._listeners) {
      try {
        listener(this._state);
      } catch (err) {
        console.error('[CalendarEngine] Listener threw:', err);
      }
    }
  }
}

/**
 * CalendarContext — shared context threaded through all views.
 * Avoids prop-drilling renderEvent, colorRules, businessHours, etc.
 */
import { createContext, useContext } from 'react';
import type { NormalizedEvent } from '../types/events';

export type CalendarContextValue = {
  renderEvent?: (...args: any[]) => any;
  [key: string]: any;
};

const DEFAULT_CALENDAR_CONTEXT: CalendarContextValue = {};

export const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendarContext(): CalendarContextValue {
  return useContext(CalendarContext) ?? DEFAULT_CALENDAR_CONTEXT;
}

/**
 * Apply colorRules to a normalized event.
 * Rules are checked in order; first match wins.
 * Falls back to ev.color if no rule matches or colorRules is empty.
 */
export function resolveColor(
  ev: NormalizedEvent,
  colorRules: Array<Record<string, unknown>> | undefined,
): string | undefined {
  if (colorRules?.length) {
    for (const rule of colorRules) {
      try {
        // Function rule shape: { when: (event) => boolean, color }
        const when = rule?.when;
        if (typeof when === 'function') {
          if (when(ev)) {
            return typeof rule.color === 'string' ? rule.color : undefined;
          }
          continue;
        }
        // Declarative rule shape: { field: 'category', value: 'Incident', color }
        const field = rule?.field;
        if (typeof field === 'string' && 'value' in rule) {
          const evRecord = ev as unknown as Record<string, unknown>;
          if (evRecord[field] === rule.value) {
            return typeof rule.color === 'string' ? rule.color : undefined;
          }
        }
      } catch (_) { /* ignore rule errors */ }
    }
  }
  return ev.color;
}

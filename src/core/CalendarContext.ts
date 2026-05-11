/**
 * CalendarContext — shared context threaded through all views.
 * Avoids prop-drilling renderEvent, colorRules, businessHours, etc.
 */
import { createContext, useContext } from 'react';
import type { NormalizedEvent } from '../types/events';
import type { CalendarContextValue, ColorRule } from '../types/ui';

export type { CalendarContextValue, ColorRule };
export type { RenderEventOptions } from '../types/ui';

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
  colorRules: ReadonlyArray<ColorRule | Record<string, unknown>> | undefined,
): string | undefined {
  if (colorRules?.length) {
    for (const rule of colorRules) {
      try {
        // Function rule shape: { when: (event) => boolean, color }
        const when = (rule as Record<string, unknown>)['when'];
        if (typeof when === 'function') {
          if (when(ev)) {
            const color = (rule as Record<string, unknown>)['color'];
            return typeof color === 'string' ? color : undefined;
          }
          continue;
        }
        // Declarative rule shape: { field: 'category', value: 'Incident', color }
        const field = (rule as Record<string, unknown>)['field'];
        if (typeof field === 'string' && 'value' in rule) {
          const evRecord = ev as unknown as Record<string, unknown>;
          if (evRecord[field] === (rule as Record<string, unknown>)['value']) {
            const color = (rule as Record<string, unknown>)['color'];
            return typeof color === 'string' ? color : undefined;
          }
        }
      } catch { /* ignore rule errors */ }
    }
  }
  return ev.color;
}

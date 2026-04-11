/**
 * CalendarContext — shared context threaded through all views.
 * Avoids prop-drilling renderEvent, colorRules, businessHours, etc.
 */
import { createContext, useContext } from 'react';

export const CalendarContext = createContext(null);

export function useCalendarContext() {
  return useContext(CalendarContext);
}

/**
 * Apply colorRules to a normalized event.
 * Rules are checked in order; first match wins.
 * Falls back to ev.color if no rule matches or colorRules is empty.
 */
export function resolveColor(ev, colorRules) {
  if (colorRules?.length) {
    for (const rule of colorRules) {
      try {
        // Function rule shape: { when: (event) => boolean, color }
        if (typeof rule?.when === 'function') {
          if (rule.when(ev)) return rule.color;
          continue;
        }
        // Declarative rule shape: { field: 'category', value: 'Incident', color }
        if (rule && typeof rule === 'object' && typeof rule.field === 'string' && 'value' in rule) {
          if (ev?.[rule.field] === rule.value) return rule.color;
        }
      } catch (_) { /* ignore rule errors */ }
    }
  }
  return ev.color;
}

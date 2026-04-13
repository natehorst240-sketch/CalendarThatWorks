import { addMinutes } from 'date-fns';
import type { CalendarEventV1 } from './types.js';

export type TemplateVisibility = 'private' | 'team' | 'org';

export interface EventTemplateV1 {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly visibility?: TemplateVisibility;
  readonly defaults: {
    readonly title?: string;
    readonly durationMinutes?: number;
    readonly allDay?: boolean;
    readonly category?: string;
    readonly resource?: string;
    readonly recurrencePreset?: string;
    readonly rrule?: string;
    readonly color?: string;
    readonly meta?: Record<string, unknown>;
  };
}

export interface ScheduleTemplateEntryV1 {
  readonly id?: string;
  readonly title: string;
  /** Minutes offset from the selected anchor date/time. */
  readonly startOffsetMinutes: number;
  readonly durationMinutes: number;
  readonly allDay?: boolean;
  readonly category?: string;
  readonly resource?: string;
  readonly rrule?: string;
  readonly color?: string;
  readonly meta?: Record<string, unknown>;
}

export interface ScheduleTemplateV1 {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly timezone?: string;
  readonly visibility?: TemplateVisibility;
  readonly entries: readonly ScheduleTemplateEntryV1[];
}

export interface ScheduleInstantiationRequestV1 {
  readonly templateId?: string;
  readonly anchor: Date | string | number;
  readonly resource?: string;
  readonly category?: string;
  readonly timezone?: string;
  readonly meta?: Record<string, unknown>;
}

export interface ScheduleInstantiationResultV1 {
  readonly templateId: string;
  readonly generated: readonly CalendarEventV1[];
}

function asDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

/**
 * Build master events from a schedule template and user-selected anchor.
 * This is pure client-side scaffolding for "Add Schedule" flows.
 */
export function instantiateScheduleTemplate(
  template: ScheduleTemplateV1,
  request: ScheduleInstantiationRequestV1,
): ScheduleInstantiationResultV1 {
  const anchor = asDate(request.anchor);

  const generated = template.entries.map((entry, idx) => {
    const start = addMinutes(anchor, entry.startOffsetMinutes);
    const end = addMinutes(start, Math.max(1, entry.durationMinutes));

    return {
      title: entry.title,
      start,
      end,
      allDay: entry.allDay ?? false,
      category: request.category ?? entry.category,
      resource: request.resource ?? entry.resource,
      timezone: request.timezone ?? template.timezone,
      color: entry.color,
      rrule: entry.rrule,
      meta: {
        scheduleTemplateId: template.id,
        scheduleTemplateEntryId: entry.id ?? `${template.id}:${idx}`,
        ...(entry.meta ?? {}),
        ...(request.meta ?? {}),
      },
    } as CalendarEventV1;
  });

  return {
    templateId: template.id,
    generated,
  };
}

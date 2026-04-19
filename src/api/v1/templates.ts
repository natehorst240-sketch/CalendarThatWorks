import { addMinutes } from 'date-fns';
import type { CalendarEventV1 } from './types';

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

export interface ScheduleTemplateViewerContext {
  readonly isOwner?: boolean;
  readonly role?: 'admin' | 'user' | 'readonly';
  readonly teamId?: string | null;
  readonly userId?: string | null;
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

export function canViewScheduleTemplate(
  template: ScheduleTemplateV1,
  viewer: ScheduleTemplateViewerContext = {},
): boolean {
  const visibility = template.visibility ?? 'org';
  if (visibility === 'org') return true;
  if (visibility === 'team') return viewer.role === 'admin' || viewer.role === 'user' || !!viewer.isOwner;
  return !!viewer.isOwner || viewer.role === 'admin';
}

function asDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

function ensureValidTemplate(template: ScheduleTemplateV1): void {
  if (!template || !Array.isArray(template.entries) || template.entries.length === 0) {
    throw new Error('Schedule template must include at least one entry.');
  }

  template.entries.forEach((entry, idx) => {
    if (!entry || typeof entry.title !== 'string' || !entry.title.trim()) {
      throw new Error(`Schedule template entry ${idx + 1} is missing a valid title.`);
    }
    if (!Number.isFinite(entry.startOffsetMinutes)) {
      throw new Error(`Schedule template entry ${idx + 1} has an invalid start offset.`);
    }
    if (!Number.isFinite(entry.durationMinutes)) {
      throw new Error(`Schedule template entry ${idx + 1} has an invalid duration.`);
    }
  });
}

/**
 * Build master events from a schedule template and user-selected anchor.
 * This is pure client-side scaffolding for "Add Schedule" flows.
 */
export function instantiateScheduleTemplate(
  template: ScheduleTemplateV1,
  request: ScheduleInstantiationRequestV1,
): ScheduleInstantiationResultV1 {
  ensureValidTemplate(template);
  const anchor = asDate(request.anchor);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error('Schedule anchor must be a valid date.');
  }

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

/**
 * useEventDraftState — owns all draft field state, validation, and
 * template-application side-effects for the EventForm modal.
 *
 * Extracted from EventForm.jsx so the form can be split into independently
 * testable section components while sharing a single source of truth for
 * the event being edited.
 */
import { useState, useEffect } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { getEventTemplateById } from '../core/engine/recurrence/templates.ts';

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

type DraftMeta = Record<string, unknown> & {
  templateId?: string;
  templateVersion?: number;
};

type DraftValues = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  category: string;
  resource: string;
  color: string;
  meta: DraftMeta;
};

type EventDraftInput = {
  start?: Date | string | number | null;
  end?: Date | string | number | null;
  title?: string | null;
  allDay?: boolean | null;
  category?: string | null;
  resource?: string | number | null;
  color?: string | null;
  meta?: Record<string, unknown> | null;
  rrule?: string | null;
};

type EventFieldConfig = {
  name: string;
  required?: boolean;
};

type DraftConfig = {
  eventFields?: Record<string, EventFieldConfig[] | undefined> | null;
} | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDraftMeta(value: unknown): DraftMeta {
  return isRecord(value) ? { ...value } : {};
}

function getEventFields(config: DraftConfig): Record<string, EventFieldConfig[] | undefined> {
  return config?.eventFields ?? {};
}

function hasRequiredFieldValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function toDatetimeLocal(date: Date | string | number | null | undefined): string {
  if (!date) return '';
  try {
    const parsed = date instanceof Date ? date : typeof date === 'number' ? new Date(date) : parseISO(date);
    return isValid(parsed) ? format(parsed, "yyyy-MM-dd'T'HH:mm") : '';
  } catch {
    return '';
  }
}

export function fromDatetimeLocal(str: string | null | undefined): Date | null {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? d : null;
}

function inferPresetFromRRule(rrule: string | null | undefined): string {
  if (!rrule) return 'none';
  const normalized = String(rrule).trim().toUpperCase();
  if (normalized === 'FREQ=DAILY') return 'daily';
  if (normalized === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'weekdays';
  if (normalized.startsWith('FREQ=WEEKLY;BYDAY=')) return 'weekly';
  if (normalized.startsWith('FREQ=MONTHLY;BYMONTHDAY=')) return 'monthlyDate';
  return 'custom';
}

function buildRRuleFromPreset(preset: string, startValue: string): string | null {
  const start = fromDatetimeLocal(startValue);
  if (!start) return null;
  if (preset === 'daily') return 'FREQ=DAILY';
  if (preset === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (preset === 'weekly') {
    const weekdayCode = WEEKDAY_CODES[start.getDay()];
    return weekdayCode ? `FREQ=WEEKLY;BYDAY=${weekdayCode}` : null;
  }
  if (preset === 'monthlyDate') return `FREQ=MONTHLY;BYMONTHDAY=${start.getDate()}`;
  return null;
}

/**
 * @param event       Existing event (null for new).
 * @param categories  Available categories from the engine.
 * @param config      Owner config (eventFields, etc.).
 */
export function useEventDraftState(event: EventDraftInput | null | undefined, categories: string[], config: DraftConfig): {
  values: DraftValues;
  templateId: string;
  recurrencePreset: string;
  customRrule: string;
  errors: Record<string, string>;
  customFields: EventFieldConfig[];
  allCats: string[];
  set: (key: keyof DraftValues, val: DraftValues[keyof DraftValues]) => void;
  setMeta: (key: string, val: unknown) => void;
  applyTemplate: (nextTemplateId: string) => void;
  setRecurrencePreset: (value: string) => void;
  setCustomRrule: (value: string) => void;
  validate: () => boolean;
  buildRRule: () => string | null;
} {
  const [values, setValues] = useState<DraftValues>(() => {
    const startDate = event?.start ? new Date(event.start) : new Date();
    const safeStartDate = isValid(startDate) ? startDate : new Date();
    // If the caller didn't supply an end, default to a 1-hour event so the
    // new event has a non-zero duration out of the box.
    const endDate = event?.end
      ? new Date(event.end)
      : new Date(safeStartDate.getTime() + 60 * 60 * 1000);
    const safeEndDate = isValid(endDate)
      ? endDate
      : new Date(safeStartDate.getTime() + 60 * 60 * 1000);

    return {
      title: event?.title ?? '',
      start: toDatetimeLocal(safeStartDate),
      end: toDatetimeLocal(safeEndDate),
      allDay: event?.allDay ?? false,
      category: event?.category ?? categories[0] ?? '',
      resource: event?.resource == null ? '' : String(event.resource),
      color: event?.color ?? '',
      meta: toDraftMeta(event?.meta),
    };
  });
  const [templateId, setTemplateId] = useState('none');
  const [recurrencePreset, setRecurrencePreset] = useState(() => inferPresetFromRRule(event?.rrule ?? null));
  const [customRrule, setCustomRrule] = useState(() => (
    event?.rrule && inferPresetFromRRule(event.rrule) === 'custom' ? event.rrule : ''
  ));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // When category changes, clear category-specific custom field values from
  // meta but preserve system-level keys (templateId, templateVersion) so that
  // template application is not undone by a simultaneous category change.
  useEffect(() => {
    setValues((v) => {
      const nextMeta: DraftMeta = {};
      if (v.meta.templateId !== undefined) nextMeta.templateId = v.meta.templateId;
      if (v.meta.templateVersion !== undefined) nextMeta.templateVersion = v.meta.templateVersion;
      return { ...v, meta: nextMeta };
    });
  }, [values.category]);

  const eventFields = getEventFields(config);
  const customFields = eventFields[values.category] ?? [];
  const allCats = Array.from(new Set([...categories, ...Object.keys(eventFields)]));

  function set(key: keyof DraftValues, val: DraftValues[keyof DraftValues]): void {
    setValues((v) => ({ ...v, [key]: val }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function setMeta(key: string, val: unknown): void {
    setValues((v) => ({ ...v, meta: { ...v.meta, [key]: val } }));
  }

  function applyTemplate(nextTemplateId: string): void {
    setTemplateId(nextTemplateId);
    const template = getEventTemplateById(nextTemplateId);
    if (!template?.defaults) return;
    const defaults = template.defaults;
    setValues((v) => {
      const startDate = fromDatetimeLocal(v.start);
      const next: DraftValues = {
        ...v,
        meta: {
          ...v.meta,
          templateId: template.id,
          templateVersion: template.version,
        },
      };
      if (defaults.title) next.title = defaults.title;
      if (defaults.category) next.category = defaults.category;
      if (defaults.resource) next.resource = String(defaults.resource);
      if (defaults.color) next.color = defaults.color;
      if (typeof defaults.allDay === 'boolean') next.allDay = defaults.allDay;
      if (startDate && Number.isFinite(defaults.durationMinutes)) {
        const durationMinutes = defaults.durationMinutes ?? 0;
        const nextEnd = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
        next.end = toDatetimeLocal(nextEnd);
      }
      return next;
    });
    if (defaults.recurrencePreset) {
      setRecurrencePreset(defaults.recurrencePreset);
      if (defaults.recurrencePreset !== 'custom') setCustomRrule('');
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!values.title.trim()) errs.title = 'Title is required';
    if (!values.start) errs.start = 'Start date is required';
    if (!values.end) errs.end = 'End date is required';
    if (values.start && values.end && new Date(values.start) >= new Date(values.end)) {
      errs.end = 'End must be after start';
    }
    customFields.filter((field) => field.required).forEach((field) => {
      const metaValue = values.meta[field.name];
      if (!hasRequiredFieldValue(metaValue)) {
        errs[`meta_${field.name}`] = `${field.name} is required`;
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /** Returns the final RRULE string (or null) based on current preset/custom state. */
  function buildRRule(): string | null {
    const presetRrule = buildRRuleFromPreset(recurrencePreset, values.start);
    const normalizedCustom = customRrule.trim().toUpperCase();
    return recurrencePreset === 'custom' ? (normalizedCustom || null) : presetRrule;
  }

  return {
    values,
    templateId,
    recurrencePreset,
    customRrule,
    errors,
    customFields,
    allCats,
    set,
    setMeta,
    applyTemplate,
    setRecurrencePreset,
    setCustomRrule,
    validate,
    buildRRule,
  };
}

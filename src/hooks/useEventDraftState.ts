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

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function toDatetimeLocal(date) {
  if (!date) return '';
  try {
    return format(date instanceof Date ? date : parseISO(date), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

export function fromDatetimeLocal(str) {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? d : null;
}

function inferPresetFromRRule(rrule) {
  if (!rrule) return 'none';
  const normalized = String(rrule).trim().toUpperCase();
  if (normalized === 'FREQ=DAILY') return 'daily';
  if (normalized === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'weekdays';
  if (normalized.startsWith('FREQ=WEEKLY;BYDAY=')) return 'weekly';
  if (normalized.startsWith('FREQ=MONTHLY;BYMONTHDAY=')) return 'monthlyDate';
  return 'custom';
}

function buildRRuleFromPreset(preset, startValue) {
  const start = fromDatetimeLocal(startValue);
  if (!start) return null;
  if (preset === 'daily') return 'FREQ=DAILY';
  if (preset === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (preset === 'weekly') return `FREQ=WEEKLY;BYDAY=${WEEKDAY_CODES[start.getDay()]}`;
  if (preset === 'monthlyDate') return `FREQ=MONTHLY;BYMONTHDAY=${start.getDate()}`;
  return null;
}

/**
 * @param {object|null|undefined} event       Existing event (null for new).
 * @param {string[]}              categories  Available categories from the engine.
 * @param {object|null}           config      Owner config (eventFields, etc.).
 */
export function useEventDraftState(event, categories, config) {
  const [values, setValues] = useState(() => {
    const startDate = event?.start ? new Date(event.start) : new Date();
    // If the caller didn't supply an end, default to a 1-hour event so the
    // new event has a non-zero duration out of the box.
    const endDate = event?.end
      ? new Date(event.end)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    return {
      title:    event?.title    ?? '',
      start:    toDatetimeLocal(startDate),
      end:      toDatetimeLocal(endDate),
      allDay:   event?.allDay   ?? false,
      category: event?.category ?? categories[0] ?? '',
      resource: event?.resource ?? '',
      color:    event?.color    ?? '',
      meta:     event?.meta     ?? {},
    };
  });
  const [templateId,        setTemplateId]        = useState('none');
  const [recurrencePreset,  setRecurrencePreset]  = useState(() => inferPresetFromRRule(event?.rrule ?? null));
  const [customRrule,       setCustomRrule]       = useState(() => (
    event?.rrule && inferPresetFromRRule(event.rrule) === 'custom' ? event.rrule : ''
  ));
  const [errors, setErrors] = useState({});

  // When category changes, clear category-specific custom field values from
  // meta but preserve system-level keys (templateId, templateVersion) so that
  // template application is not undone by a simultaneous category change.
  useEffect(() => {
    setValues(v => {
      const { templateId: tid, templateVersion: tv, ...rest } = v.meta ?? {};
      void rest; // custom-field keys are dropped; template keys are kept
      return {
        ...v,
        meta: {
          ...(tid !== undefined ? { templateId: tid, templateVersion: tv } : {}),
        },
      };
    });
  }, [values.category]);

  const customFields = config?.eventFields?.[values.category] || [];
  const allCats = Array.from(
    new Set([...categories, ...Object.keys(config?.eventFields || {})]),
  );

  function set(key, val) {
    setValues(v => ({ ...v, [key]: val }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function setMeta(key, val) {
    setValues(v => ({ ...v, meta: { ...v.meta, [key]: val } }));
  }

  function applyTemplate(nextTemplateId) {
    setTemplateId(nextTemplateId);
    const template = getEventTemplateById(nextTemplateId);
    if (!template?.defaults) return;
    setValues((v) => {
      const startDate = fromDatetimeLocal(v.start);
      const next = {
        ...v,
        meta: {
          ...(v.meta ?? {}),
          templateId: template.id,
          templateVersion: template.version,
        },
      };
      if (template.defaults.title) next.title = template.defaults.title;
      if (template.defaults.category) next.category = template.defaults.category;
      if (template.defaults.resource) next.resource = template.defaults.resource;
      if (template.defaults.color) next.color = template.defaults.color;
      if (typeof template.defaults.allDay === 'boolean') next.allDay = template.defaults.allDay;
      if (startDate && Number.isFinite(template.defaults.durationMinutes)) {
        const nextEnd = new Date(startDate.getTime() + template.defaults.durationMinutes * 60 * 1000);
        next.end = toDatetimeLocal(nextEnd);
      }
      return next;
    });
    if (template.defaults.recurrencePreset) {
      setRecurrencePreset(template.defaults.recurrencePreset);
      if (template.defaults.recurrencePreset !== 'custom') setCustomRrule('');
    }
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!values.title.trim()) errs.title = 'Title is required';
    if (!values.start) errs.start = 'Start date is required';
    if (!values.end) errs.end = 'End date is required';
    if (values.start && values.end && new Date(values.start) > new Date(values.end)) {
      errs.end = 'End must be after start';
    }
    customFields.filter(f => f.required).forEach(f => {
      if (!values.meta[f.name] && values.meta[f.name] !== 0) {
        errs[`meta_${f.name}`] = `${f.name} is required`;
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  /** Returns the final RRULE string (or null) based on current preset/custom state. */
  function buildRRule() {
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

/**
 * EventForm.jsx — Modal for adding / editing events.
 * Uses the owner-configured custom fields per category.
 */
import { useState, useEffect, useRef } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { X, Plus } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { BUILT_IN_EVENT_TEMPLATES, getEventTemplateById } from '../core/engine/recurrence/templates.ts';
import styles from './EventForm.module.css';

const BUILT_IN_CATEGORIES = [];
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const RECURRENCE_PRESETS = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { id: 'weekly', label: 'Weekly on start day' },
  { id: 'monthlyDate', label: 'Monthly on start date' },
  { id: 'custom', label: 'Custom RRULE' },
];
function toDatetimeLocal(date) {
  if (!date) return '';
  try {
    return format(date instanceof Date ? date : parseISO(date), "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

function fromDatetimeLocal(str) {
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

export default function EventForm({ event, config, categories, onSave, onDelete, onClose, permissions, onAddCategory }) {
  const isNew    = !event?.id || event.id.startsWith('wc-');
  const trapRef  = useFocusTrap(onClose);

  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const newCatRef = useRef(null);

  useEffect(() => { if (addCatOpen) newCatRef.current?.focus(); }, [addCatOpen]);

  function submitNewCat() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    onAddCategory?.(trimmed);
    setNewCatName('');
    setAddCatOpen(false);
  }

  const [values, setValues] = useState(() => ({
    title:    event?.title    ?? '',
    start:    toDatetimeLocal(event?.start ?? new Date()),
    end:      toDatetimeLocal(event?.end   ?? new Date()),
    allDay:   event?.allDay   ?? false,
    category: event?.category ?? categories[0] ?? '',
    resource: event?.resource ?? '',
    color:    event?.color    ?? '',
    meta:     event?.meta     ?? {},
  }));
  const [templateId, setTemplateId] = useState('none');
  const [recurrencePreset, setRecurrencePreset] = useState(() => inferPresetFromRRule(event?.rrule ?? null));
  const [customRrule, setCustomRrule] = useState(() => (event?.rrule && inferPresetFromRRule(event.rrule) === 'custom' ? event.rrule : ''));

  const [errors, setErrors] = useState({});

  // When category changes, reset meta to avoid carrying over unrelated fields
  useEffect(() => {
    setValues(v => ({ ...v, meta: {} }));
  }, [values.category]);

  // Get the custom field definitions for the selected category
  const customFields = config?.eventFields?.[values.category] || [];

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
    const errs = {};
    if (!values.title.trim()) errs.title = 'Title is required';
    if (!values.start) errs.start = 'Start date is required';
    if (!values.end) errs.end = 'End date is required';
    if (values.start && values.end && new Date(values.start) > new Date(values.end)) {
      errs.end = 'End must be after start';
    }
    // Custom required fields
    customFields.filter(f => f.required).forEach(f => {
      if (!values.meta[f.name] && values.meta[f.name] !== 0) {
        errs[`meta_${f.name}`] = `${f.name} is required`;
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const presetRrule = buildRRuleFromPreset(recurrencePreset, values.start);
    const normalizedCustom = customRrule.trim().toUpperCase();
    const rrule = recurrencePreset === 'custom'
      ? (normalizedCustom || null)
      : presetRrule;

    onSave({
      ...(event || {}),
      title:    values.title.trim(),
      start:    fromDatetimeLocal(values.start),
      end:      fromDatetimeLocal(values.end),
      allDay:   values.allDay,
      category: values.category || null,
      resource: values.resource.trim() || null,
      color:    values.color || undefined,
      meta:     values.meta,
      rrule,
      exdates:  event?.exdates ?? [],
    });
  }

  const allCats = Array.from(new Set([...categories, ...Object.keys(config?.eventFields || {}), ...BUILT_IN_CATEGORIES]));

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} ref={trapRef} role="dialog" aria-modal="true" aria-label={isNew ? 'Add event' : 'Edit event'}>
        <div className={styles.header}>
          <h2 className={styles.title}>{isNew ? 'Add Event' : 'Edit Event'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label}>Template</label>
            <select className={styles.select} value={templateId} onChange={e => applyTemplate(e.target.value)}>
              {BUILT_IN_EVENT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Title <span className={styles.req}>*</span></label>
            <input
              className={[styles.input, errors.title && styles.inputError].filter(Boolean).join(' ')}
              value={values.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Event title"
              autoFocus
            />
            {errors.title && <span className={styles.error}>{errors.title}</span>}
          </div>

          {/* All day toggle */}
          <label className={styles.checkRow}>
            <input type="checkbox" checked={values.allDay} onChange={e => set('allDay', e.target.checked)} />
            All day event
          </label>

          {/* Start / End */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Start <span className={styles.req}>*</span></label>
              <input
                type={values.allDay ? 'date' : 'datetime-local'}
                className={[styles.input, errors.start && styles.inputError].filter(Boolean).join(' ')}
                value={values.allDay ? values.start.slice(0, 10) : values.start}
                onChange={e => set('start', e.target.value)}
              />
              {errors.start && <span className={styles.error}>{errors.start}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>End <span className={styles.req}>*</span></label>
              <input
                type={values.allDay ? 'date' : 'datetime-local'}
                className={[styles.input, errors.end && styles.inputError].filter(Boolean).join(' ')}
                value={values.allDay ? values.end.slice(0, 10) : values.end}
                onChange={e => set('end', e.target.value)}
              />
              {errors.end && <span className={styles.error}>{errors.end}</span>}
            </div>
          </div>

          {/* Recurrence */}
          <div className={styles.field}>
            <label className={styles.label}>Repeat</label>
            <select
              className={styles.select}
              value={recurrencePreset}
              onChange={(e) => {
                const next = e.target.value;
                setRecurrencePreset(next);
                if (next !== 'custom') setCustomRrule('');
              }}
            >
              {RECURRENCE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {recurrencePreset === 'custom' && (
              <input
                className={styles.input}
                value={customRrule}
                onChange={(e) => setCustomRrule(e.target.value)}
                placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
              />
            )}
            <span className={styles.helperText}>Uses RFC5545 RRULE format internally.</span>
          </div>

          {/* Category */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>
                Category
                {onAddCategory && (
                  <button type="button" className={styles.addCatBtn} onClick={() => setAddCatOpen(v => !v)} title="Add category" aria-label="Add category">
                    <Plus size={11} />
                  </button>
                )}
              </label>
              {addCatOpen && (
                <div className={styles.addCatRow}>
                  <input
                    ref={newCatRef}
                    className={styles.addCatInput}
                    placeholder="New category name"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitNewCat(); } if (e.key === 'Escape') setAddCatOpen(false); }}
                  />
                  <button type="button" className={styles.addCatSave} onClick={submitNewCat}>Add</button>
                </div>
              )}
              <select className={styles.select} value={values.category} onChange={e => set('category', e.target.value)}>
                <option value="">— none —</option>
                {allCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Resource</label>
              <input className={styles.input} value={values.resource}
                onChange={e => set('resource', e.target.value)} placeholder="Tail #, room, person…" />
            </div>
          </div>

          {/* Color override */}
          <div className={styles.field}>
            <label className={styles.label}>Color override</label>
            <div className={styles.colorRow}>
              <input type="color" className={styles.colorPicker} value={values.color || '#3b82f6'}
                onChange={e => set('color', e.target.value)} />
              <input className={styles.input} value={values.color}
                onChange={e => set('color', e.target.value)} placeholder="#3b82f6 or leave blank" />
              {values.color && (
                <button type="button" className={styles.clearColor} onClick={() => set('color', '')}>Clear</button>
              )}
            </div>
          </div>

          {/* Dynamic custom fields */}
          {customFields.length > 0 && (
            <div className={styles.customSection}>
              <div className={styles.customSectionLabel}>
                {values.category} fields
              </div>
              {customFields.map(f => (
                <CustomField
                  key={f.name}
                  field={f}
                  value={values.meta[f.name] ?? ''}
                  error={errors[`meta_${f.name}`]}
                  onChange={val => setMeta(f.name, val)}
                />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            {!isNew && onDelete && (
              <button type="button" className={styles.btnDelete}
                onClick={() => { if (confirm('Delete this event?')) { onDelete(event.id); onClose(); } }}>
                Delete
              </button>
            )}
            <div className={styles.actionRight}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
              <button type="submit" className={styles.btnSave}>{isNew ? 'Add Event' : 'Save Changes'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----- Individual custom field renderer ----- */
function CustomField({ field, value, error, onChange }) {
  const opts = field.options ? field.options.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {field.name}
        {field.required && <span className={styles.req}> *</span>}
      </label>

      {field.type === 'text' && (
        <input className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
          value={value} onChange={e => onChange(e.target.value)} />
      )}
      {field.type === 'number' && (
        <input type="number" className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
          value={value} onChange={e => onChange(e.target.value)} />
      )}
      {field.type === 'date' && (
        <input type="date" className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
          value={value} onChange={e => onChange(e.target.value)} />
      )}
      {field.type === 'checkbox' && (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
          Yes
        </label>
      )}
      {field.type === 'select' && (
        <select className={[styles.select, error && styles.inputError].filter(Boolean).join(' ')}
          value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— select —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'textarea' && (
        <textarea className={[styles.textarea, error && styles.inputError].filter(Boolean).join(' ')}
          value={value} onChange={e => onChange(e.target.value)} rows={3} />
      )}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

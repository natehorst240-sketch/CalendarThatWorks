import { useState } from 'react';
import { format, parseISO, isValid, addDays, addHours } from 'date-fns';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { createId } from '../core/createId.js';
import styles from './ScheduleEditorForm.module.css';

// ─── Shift templates ──────────────────────────────────────────────────────────

const SHIFT_TEMPLATES = [
  {
    id:    'mon-thu',
    label: 'Mon–Thu (4×10)',
    description: 'Monday through Thursday, 10-hour shifts',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH',
    durationHours: 10,
  },
  {
    id:    'weekend-oncall',
    label: 'Weekend On-Call',
    description: 'Saturday and Sunday, 12-hour shifts',
    rrule: 'FREQ=WEEKLY;BYDAY=SA,SU',
    durationHours: 12,
  },
  {
    id:    'every-other-friday',
    label: 'Every Other Friday',
    description: 'Bi-weekly Friday shifts',
    rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
    durationHours: 8,
  },
  {
    id:    '7on7off',
    label: '7 On / 7 Off',
    description: '7 consecutive days on, 7 days off (14-day rotation)',
    rrule: 'FREQ=DAILY;INTERVAL=14;COUNT=7',
    durationHours: 12,
    note: 'Creates a single 7-day block — repeat as needed for each rotation.',
  },
];

const RRULE_PRESETS = [
  { id: 'daily',    label: 'Daily',              rrule: 'FREQ=DAILY' },
  { id: 'weekdays', label: 'Weekdays (Mon–Fri)',  rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'weekly',   label: 'Weekly',              rrule: null }, // computed from start day
  { id: 'biweekly', label: 'Every Two Weeks',     rrule: null }, // computed from start day
  { id: 'custom',   label: 'Custom RRULE…',       rrule: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function toInput(date, allDay) {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : parseISO(date);
    return format(d, allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

function fromInput(str, allDay) {
  if (!str) return null;
  const d = new Date(str + (allDay && str.length === 10 ? 'T00:00:00' : ''));
  return isValid(d) ? d : null;
}

function buildRrule(preset, startStr) {
  const start = fromInput(startStr, false);
  if (preset === 'daily')    return 'FREQ=DAILY';
  if (preset === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (preset === 'weekly' && start)
    return `FREQ=WEEKLY;BYDAY=${WEEKDAY_CODES[start.getDay()]}`;
  if (preset === 'biweekly' && start)
    return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${WEEKDAY_CODES[start.getDay()]}`;
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * ScheduleEditorForm — modal for creating shift events for an employee.
 *
 * Props:
 *   emp          { id, name, role? }
 *   initialStart Date | null       — pre-filled start date
 *   onCallCategory string          — category name for on-call / shift events (default 'on-call')
 *   onSave       (shiftEvent | shiftEvent[]) => void  — may return multiple events for templates
 *   onClose      () => void
 */
export default function ScheduleEditorForm({
  emp,
  initialStart,
  onCallCategory = 'on-call',
  onSave,
  onClose,
}) {
  const trapRef = useFocusTrap(onClose);

  // Mode: 'onetime' | 'recurring' | 'template'
  const [mode, setMode] = useState('onetime');

  const defaultStart = initialStart ?? new Date();
  const defaultEnd   = addHours(defaultStart, 8);

  const [start,       setStart]       = useState(toInput(defaultStart, false));
  const [end,         setEnd]         = useState(toInput(defaultEnd,   false));
  const [title,       setTitle]       = useState('On-Call Shift');
  const [rrulePreset, setRrulePreset] = useState('weekdays');
  const [customRrule, setCustomRrule] = useState('');
  const [templateId,  setTemplateId]  = useState(SHIFT_TEMPLATES[0].id);
  const [errors,      setErrors]      = useState({});

  const selectedTemplate = SHIFT_TEMPLATES.find(t => t.id === templateId) ?? SHIFT_TEMPLATES[0];

  function validate() {
    const errs = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!start)        errs.start = 'Start is required';
    if (mode !== 'template') {
      if (!end) errs.end = 'End is required';
      const s = fromInput(start, false);
      const e = fromInput(end, false);
      if (s && e && s >= e) errs.end = 'End must be after start';
    }
    if (mode === 'recurring' && rrulePreset === 'custom' && !customRrule.trim()) {
      errs.rrule = 'Enter a valid RRULE string';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function buildEvent(startDate, endDate, rrule) {
    return {
      id:       createId('shift'),
      title:    title.trim(),
      start:    startDate,
      end:      endDate,
      category: onCallCategory,
      resource: emp.id,
      meta:     { kind: 'shift', employeeId: emp.id },
      ...(rrule ? { rrule } : {}),
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    if (mode === 'onetime') {
      const s  = fromInput(start, false);
      const en = fromInput(end,   false);
      onSave(buildEvent(s, en, null));
      return;
    }

    if (mode === 'recurring') {
      const s  = fromInput(start, false);
      const en = fromInput(end,   false);
      const rrule = rrulePreset === 'custom'
        ? customRrule.trim().toUpperCase()
        : buildRrule(rrulePreset, start);
      onSave(buildEvent(s, en, rrule));
      return;
    }

    if (mode === 'template') {
      const s = fromInput(start, false);
      if (!s) return;
      const en = addHours(s, selectedTemplate.durationHours);

      if (selectedTemplate.id === '7on7off') {
        // Create 7 consecutive daily events for the first block
        const events = Array.from({ length: 7 }, (_, i) => {
          const dayStart = addDays(s, i);
          const dayEnd   = addHours(dayStart, selectedTemplate.durationHours);
          return buildEvent(dayStart, dayEnd, null);
        });
        onSave(events);
      } else {
        onSave(buildEvent(s, en, selectedTemplate.rrule));
      }
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Add schedule for ${emp.name}`}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.title}>Add Schedule</h2>
            <span className={styles.empName}>{emp.name}{emp.role ? ` · ${emp.role}` : ''}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Mode tabs */}
          <div className={styles.modeTabs} role="group" aria-label="Shift type">
            {(['onetime', 'recurring', 'template']).map(m => (
              <button
                key={m}
                type="button"
                className={[styles.modeTab, mode === m && styles.modeTabActive].filter(Boolean).join(' ')}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
              >
                {m === 'onetime'   ? 'One-Time'  : m === 'recurring' ? 'Recurring' : 'Template'}
              </button>
            ))}
          </div>

          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sef-title">
              Shift Title <span className={styles.req}>*</span>
            </label>
            <input
              id="sef-title"
              className={[styles.input, errors.title && styles.inputError].filter(Boolean).join(' ')}
              value={title}
              onChange={e => { setTitle(e.target.value); setErrors(v => ({ ...v, title: undefined })); }}
              autoFocus
            />
            {errors.title && <span className={styles.error}>{errors.title}</span>}
          </div>

          {/* Start field (shared across modes) */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="sef-start">
              {mode === 'template' ? 'First Shift Start' : 'Start'}
              {' '}<span className={styles.req}>*</span>
            </label>
            <input
              id="sef-start"
              type="datetime-local"
              className={[styles.input, errors.start && styles.inputError].filter(Boolean).join(' ')}
              value={start}
              onChange={e => { setStart(e.target.value); setErrors(v => ({ ...v, start: undefined, end: undefined })); }}
            />
            {errors.start && <span className={styles.error}>{errors.start}</span>}
          </div>

          {/* End field — shown for onetime and recurring modes */}
          {mode !== 'template' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sef-end">
                End <span className={styles.req}>*</span>
              </label>
              <input
                id="sef-end"
                type="datetime-local"
                className={[styles.input, errors.end && styles.inputError].filter(Boolean).join(' ')}
                value={end}
                onChange={e => { setEnd(e.target.value); setErrors(v => ({ ...v, end: undefined })); }}
              />
              {errors.end && <span className={styles.error}>{errors.end}</span>}
            </div>
          )}

          {/* Recurring: RRULE preset */}
          {mode === 'recurring' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sef-rrule">Repeat Pattern</label>
              <select
                id="sef-rrule"
                className={styles.select}
                value={rrulePreset}
                onChange={e => { setRrulePreset(e.target.value); setErrors(v => ({ ...v, rrule: undefined })); }}
              >
                {RRULE_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {rrulePreset === 'custom' && (
                <input
                  className={[styles.input, errors.rrule && styles.inputError].filter(Boolean).join(' ')}
                  value={customRrule}
                  onChange={e => { setCustomRrule(e.target.value); setErrors(v => ({ ...v, rrule: undefined })); }}
                  placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                  aria-label="Custom RRULE string"
                />
              )}
              {errors.rrule && <span className={styles.error}>{errors.rrule}</span>}
              <span className={styles.helperText}>Uses RFC 5545 RRULE format.</span>
            </div>
          )}

          {/* Template: picker */}
          {mode === 'template' && (
            <div className={styles.field}>
              <label className={styles.label}>Schedule Template</label>
              <div className={styles.templateGrid}>
                {SHIFT_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={[
                      styles.templateCard,
                      templateId === t.id && styles.templateCardActive,
                    ].filter(Boolean).join(' ')}
                    onClick={() => setTemplateId(t.id)}
                    aria-pressed={templateId === t.id}
                  >
                    <span className={styles.templateLabel}>{t.label}</span>
                    <span className={styles.templateDesc}>{t.description}</span>
                    {t.note && (
                      <span className={styles.templateNote}>{t.note}</span>
                    )}
                  </button>
                ))}
              </div>
              <p className={styles.helperText}>
                Duration: {selectedTemplate.durationHours}h per shift
              </p>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave}>
              {mode === 'template' && selectedTemplate.id === '7on7off'
                ? 'Create 7-Day Block'
                : 'Add Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

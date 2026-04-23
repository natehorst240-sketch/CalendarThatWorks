import { useState, type FormEvent } from 'react';
import { format, parseISO, isValid, addDays, addHours } from 'date-fns';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { createId } from '../core/createId';
import styles from './ScheduleEditorForm.module.css';
import type { WorksCalendarEvent } from '../types/events';

// ─── Shift templates ──────────────────────────────────────────────────────────

type ShiftTemplate = {
  id: string;
  label: string;
  description: string;
  rrule: string;
  durationHours: number;
  note?: string;
};

const SHIFT_TEMPLATES: ShiftTemplate[] = [
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

type RrulePresetId = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'custom';

const RRULE_PRESETS: Array<{ id: RrulePresetId; label: string; rrule: string | null }> = [
  { id: 'daily',    label: 'Daily',              rrule: 'FREQ=DAILY' },
  { id: 'weekdays', label: 'Weekdays (Mon–Fri)',  rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'weekly',   label: 'Weekly',              rrule: null },
  { id: 'biweekly', label: 'Every Two Weeks',     rrule: null },
  { id: 'custom',   label: 'Custom RRULE…',       rrule: null },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

type ScheduleEditorErrors = Record<string, string>;

type ScheduleEditorFormProps = {
  emp: { id: string; name: string; role?: string };
  initialStart?: Date | null;
  initialEnd?: Date | null;
  onCallCategory?: string;
  onSave: (eventOrEvents: WorksCalendarEvent | WorksCalendarEvent[]) => void;
  onClose: () => void;
};

function getDefaultTemplate(): ShiftTemplate {
  const firstTemplate = SHIFT_TEMPLATES[0];
  if (!firstTemplate) {
    throw new Error('ScheduleEditorForm requires at least one shift template.');
  }
  return firstTemplate;
}

function withoutErrorKeys(errors: ScheduleEditorErrors, ...keys: string[]): ScheduleEditorErrors {
  if (keys.length === 0) return errors;
  const next = { ...errors };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

export function toInput(date: Date | string | null | undefined, allDay: boolean): string {
  if (!date) return '';
  try {
    const parsed = date instanceof Date ? date : parseISO(date);
    if (!isValid(parsed)) return '';
    return format(parsed, allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

export function fromInput(str: string, allDay: boolean): Date | null {
  if (!str) return null;
  const d = new Date(str + (allDay && str.length === 10 ? 'T00:00:00' : ''));
  return isValid(d) ? d : null;
}

export function buildRrule(preset: RrulePresetId, startStr: string): string | null {
  const start = fromInput(startStr, false);
  if (preset === 'daily') return 'FREQ=DAILY';
  if (preset === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (preset === 'weekly' && start) {
    const weekdayCode = WEEKDAY_CODES[start.getDay()];
    return weekdayCode ? `FREQ=WEEKLY;BYDAY=${weekdayCode}` : null;
  }
  if (preset === 'biweekly' && start) {
    const weekdayCode = WEEKDAY_CODES[start.getDay()];
    return weekdayCode ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${weekdayCode}` : null;
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScheduleEditorForm({
  emp,
  initialStart,
  initialEnd,
  onCallCategory = 'on-call',
  onSave,
  onClose,
}: ScheduleEditorFormProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  const [mode, setMode] = useState<'onetime' | 'recurring' | 'template'>('onetime');

  const defaultStart = initialStart ?? new Date();
  const defaultEnd = initialEnd ?? addHours(defaultStart, 8);
  const defaultTemplate = getDefaultTemplate();

  const [start, setStart] = useState(toInput(defaultStart, false));
  const [end, setEnd] = useState(toInput(defaultEnd, false));
  const [title, setTitle] = useState('On-Call Shift');
  const [rrulePreset, setRrulePreset] = useState<RrulePresetId>('weekdays');
  const [customRrule, setCustomRrule] = useState('');
  const [templateId, setTemplateId] = useState(defaultTemplate.id);
  const [errors, setErrors] = useState<ScheduleEditorErrors>({});

  const selectedTemplate = SHIFT_TEMPLATES.find((template) => template.id === templateId) ?? defaultTemplate;

  function validateDateRange(startStr: string, endStr: string): { isValid: boolean; message: string } {
    const s = fromInput(startStr, false);
    const e = fromInput(endStr, false);
    if (!s || !e) return { isValid: false, message: 'Enter valid start and end date/times' };
    if (e <= s) return { isValid: false, message: 'End must be after start' };
    return { isValid: true, message: '' };
  }

  function validate(): boolean {
    const nextErrors: ScheduleEditorErrors = {};
    if (!title.trim()) nextErrors.title = 'Title is required';
    if (!start) {
      nextErrors.start = 'Start is required';
    } else if (!fromInput(start, false)) {
      nextErrors.start = 'Enter a valid start date/time';
    }

    if (mode !== 'template') {
      if (!end) {
        nextErrors.end = 'End is required';
      } else if (!fromInput(end, false)) {
        nextErrors.end = 'Enter a valid end date/time';
      } else {
        const rangeValidation = validateDateRange(start, end);
        if (!rangeValidation.isValid) nextErrors.end = rangeValidation.message;
      }
    }
    if (mode === 'recurring' && rrulePreset === 'custom' && !customRrule.trim()) {
      nextErrors.rrule = 'Enter a valid RRULE string';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildEvent(startDate: Date, endDate: Date, rrule: string | null): WorksCalendarEvent {
    return {
      id: createId('shift'),
      title: title.trim(),
      start: startDate,
      end: endDate,
      category: onCallCategory,
      resource: emp.id,
      meta: { kind: 'shift', employeeId: emp.id },
      ...(rrule ? { rrule } : {}),
    };
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    if (mode === 'onetime') {
      const parsedStart = fromInput(start, false);
      const parsedEnd = fromInput(end, false);
      if (!parsedStart || !parsedEnd) return;
      onSave(buildEvent(parsedStart, parsedEnd, null));
      return;
    }

    if (mode === 'recurring') {
      const parsedStart = fromInput(start, false);
      const parsedEnd = fromInput(end, false);
      const rrule = rrulePreset === 'custom'
        ? customRrule.trim().toUpperCase()
        : buildRrule(rrulePreset, start);
      if (!parsedStart || !parsedEnd) return;
      onSave(buildEvent(parsedStart, parsedEnd, rrule));
      return;
    }

    if (mode === 'template') {
      const parsedStart = fromInput(start, false);
      if (!parsedStart) return;
      const parsedEnd = addHours(parsedStart, selectedTemplate.durationHours);

      if (selectedTemplate.id === '7on7off') {
        const events = Array.from({ length: 7 }, (_, i) => {
          const dayStart = addDays(parsedStart, i);
          const dayEnd = addHours(dayStart, selectedTemplate.durationHours);
          return buildEvent(dayStart, dayEnd, null);
        });
        onSave(events);
      } else {
        onSave(buildEvent(parsedStart, parsedEnd, selectedTemplate.rrule));
      }
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`Create schedule for ${emp.name}`}
      >
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.title}>Create Shift Schedule</h2>
            <span className={styles.empName}>{emp.name}{emp.role ? ` · ${emp.role}` : ''}</span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.modeTabs} role="group" aria-label="Shift type">
            {(['onetime', 'recurring', 'template'] as const).map((tabMode) => (
              <button
                key={tabMode}
                type="button"
                className={[styles.modeTab, mode === tabMode && styles.modeTabActive].filter(Boolean).join(' ')}
                onClick={() => setMode(tabMode)}
                aria-pressed={mode === tabMode}
              >
                {tabMode === 'onetime' ? 'One-Time' : tabMode === 'recurring' ? 'Recurring' : 'Template'}
              </button>
            ))}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="sef-title">
              Shift Title <span className={styles.req}>*</span>
            </label>
            <input
              id="sef-title"
              className={[styles.input, errors.title && styles.inputError].filter(Boolean).join(' ')}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((currentErrors) => withoutErrorKeys(currentErrors, 'title'));
              }}
              autoFocus
            />
            {errors.title && <span className={styles.error}>{errors.title}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="sef-start">
              {mode === 'template' ? 'First Shift Start' : 'Start'}{' '}
              <span className={styles.req}>*</span>
            </label>
            <input
              id="sef-start"
              type="datetime-local"
              className={[styles.input, errors.start && styles.inputError].filter(Boolean).join(' ')}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setErrors((currentErrors) => withoutErrorKeys(currentErrors, 'start', 'end'));
              }}
            />
            {errors.start && <span className={styles.error}>{errors.start}</span>}
          </div>

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
                onChange={(e) => {
                  setEnd(e.target.value);
                  setErrors((currentErrors) => withoutErrorKeys(currentErrors, 'end'));
                }}
              />
              {errors.end && <span className={styles.error}>{errors.end}</span>}
            </div>
          )}

          {mode === 'recurring' && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sef-rrule">Repeat Pattern</label>
              <select
                id="sef-rrule"
                className={styles.select}
                value={rrulePreset}
                onChange={(e) => {
                  setRrulePreset(e.target.value as RrulePresetId);
                  setErrors((currentErrors) => withoutErrorKeys(currentErrors, 'rrule'));
                }}
              >
                {RRULE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
              {rrulePreset === 'custom' && (
                <input
                  className={[styles.input, errors.rrule && styles.inputError].filter(Boolean).join(' ')}
                  value={customRrule}
                  onChange={(e) => {
                    setCustomRrule(e.target.value);
                    setErrors((currentErrors) => withoutErrorKeys(currentErrors, 'rrule'));
                  }}
                  placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                  aria-label="Custom RRULE string"
                />
              )}
              {errors.rrule && <span className={styles.error}>{errors.rrule}</span>}
              <span className={styles.helperText}>Uses RFC 5545 RRULE format.</span>
            </div>
          )}

          {mode === 'template' && (
            <div className={styles.field}>
              <label className={styles.label}>Schedule Template</label>
              <div className={styles.templateGrid}>
                {SHIFT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={[
                      styles.templateCard,
                      templateId === template.id && styles.templateCardActive,
                    ].filter(Boolean).join(' ')}
                    onClick={() => setTemplateId(template.id)}
                    aria-pressed={templateId === template.id}
                  >
                    <span className={styles.templateLabel}>{template.label}</span>
                    <span className={styles.templateDesc}>{template.description}</span>
                    {template.note && (
                      <span className={styles.templateNote}>{template.note}</span>
                    )}
                  </button>
                ))}
              </div>
              <p className={styles.helperText}>
                Duration: {selectedTemplate.durationHours}h per shift
              </p>
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave}>
              {mode === 'template' && selectedTemplate.id === '7on7off'
                ? 'Create 7-Day Block'
                : 'Create Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

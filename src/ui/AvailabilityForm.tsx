import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { createId } from '../core/createId';
import styles from './AvailabilityForm.module.css';

// ─── Kind metadata ────────────────────────────────────────────────────────────

const KIND_META = {
  pto: {
    label:      'PTO / Time Off',
    category:   'pto',
    color:      '#10b981',
    defaultTitle: 'PTO',
    allDayDefault: true,
  },
  unavailable: {
    label:      'Unavailable',
    category:   'unavailable',
    color:      '#ef4444',
    defaultTitle: 'Unavailable',
    allDayDefault: true,
  },
  availability: {
    label:      'Availability',
    category:   'availability',
    color:      '#3b82f6',
    defaultTitle: 'Available',
    allDayDefault: false,
  },
};

type IntentMeta = { heading: string; submitLabel: string; allDayLocked: boolean; allDayHelp: string | null };
const INTENT_META = {
  pto: {
    heading: 'Request PTO',
    submitLabel: 'Save PTO Request',
    allDayLocked: true,
    allDayHelp: 'PTO is tracked as all-day blocks from this action.',
  },
  unavailable: {
    heading: 'Mark Unavailable',
    submitLabel: 'Save Unavailable Time',
    allDayLocked: true,
    allDayHelp: 'Unavailable time from this action is all-day only.',
  },
  availability: {
    heading: 'Set Availability',
    submitLabel: 'Save Availability',
    allDayLocked: false,
    allDayHelp: null,
  },
} satisfies Record<string, IntentMeta>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInput(date: Date | string | null | undefined, allDay: boolean): string {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : parseISO(date);
    return format(d, allDay ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm");
  } catch {
    return '';
  }
}

function fromInput(str: string, allDay: boolean): Date | null {
  if (!str) return null;
  const d = new Date(str + (allDay && str.length === 10 ? 'T00:00:00' : ''));
  return isValid(d) ? d : null;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AvailabilityForm — modal for creating PTO/Unavailable and creating or editing Availability events.
 *
 * Props:
 *   emp        { id, name, role? }       — the employee this record is for
 *   kind       'pto' | 'unavailable' | 'availability'  — pre-selected kind
 *   initialStart  Date | null            — pre-filled start (e.g. from timeline click)
 *   initialEvent  event | null           — optional event to edit (used by Edit Availability)
 *   onSave     (availabilityEvent) => void
 *   onClose    () => void
 */
export default function AvailabilityForm({ emp, kind: initialKind, initialStart, initialEvent = null, onSave, onClose }: any) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  const kind = (initialKind ?? 'pto') as string;
  const meta = KIND_META[kind as keyof typeof KIND_META] ?? KIND_META.pto;
  const isEdit = Boolean(initialEvent?.id);
  const intentMeta: IntentMeta = (INTENT_META as Record<string, IntentMeta>)[kind] ?? INTENT_META.pto;
  const isAllDayLocked = Boolean(intentMeta.allDayLocked);
  const heading = isEdit && kind === 'availability' ? 'Edit Availability' : intentMeta.heading;

  const eventStart = initialEvent?.start ?? initialStart;
  const startDefault = eventStart ?? new Date();
  const endDefault   = initialEvent?.end ?? new Date(startDefault.getTime() + (meta.allDayDefault ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));
  const initialAllDay = isAllDayLocked ? true : (initialEvent?.allDay ?? meta.allDayDefault);
  const initialTitle = kind === 'availability'
    ? (initialEvent?.title ?? meta.defaultTitle)
    : meta.defaultTitle;

  const [allDay, setAllDay] = useState(initialAllDay);
  const [title,  setTitle]  = useState(initialTitle);
  const [start,  setStart]  = useState(toDateInput(startDefault, initialAllDay));
  const [end,    setEnd]    = useState(toDateInput(endDefault, initialAllDay));
  const [notes,  setNotes]  = useState(initialEvent?.meta?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (!title.trim())  errs.title = 'Title is required';
    if (!start)         errs.start = 'Start date is required';
    if (!end)           errs.end   = 'End date is required';
    const s = fromInput(start, allDay);
    const e = fromInput(end, allDay);
    if (start && !s) errs.start = `Enter a valid ${allDay ? 'start date' : 'start date/time'}`;
    if (end && !e) errs.end = `Enter a valid ${allDay ? 'end date' : 'end date/time'}`;
    if (s && e && s >= e) errs.end = 'End must be after start';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    const s = fromInput(start, allDay);
    const en = fromInput(end, allDay);
    if (!s || !en) {
      setErrors((prev) => ({
        ...prev,
        start: prev.start ?? `Enter a valid ${allDay ? 'start date' : 'start date/time'}`,
        end: prev.end ?? `Enter a valid ${allDay ? 'end date' : 'end date/time'}`,
      }));
      return;
    }

    onSave({
      id:         initialEvent?.id ?? createId('avail'),
      employeeId: emp.id,
      kind,
      title:      title.trim(),
      start:      s,
      end:        en,
      allDay,
      color:      meta.color,
      category:   meta.category,
      resource:   emp.id,
      meta:       { ...(initialEvent?.meta ?? {}), kind, ...(notes.trim() ? { notes: notes.trim() } : {}) },
    });
  }

  const kindLabel = meta.label;

  return (
    <div className={styles.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose()}>
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={`${heading} for ${emp.name}`}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.title}>{heading}</h2>
            <span className={styles.empName}>{emp.name}{emp.role ? ` · ${emp.role}` : ''}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="af-title">
              Title <span className={styles.req}>*</span>
            </label>
            <input
              id="af-title"
              className={[styles.input, errors.title && styles.inputError].filter(Boolean).join(' ')}
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setTitle(e.target.value);
                setErrors((v: Record<string, string>) => {
                  const next = { ...v };
                  delete next.title;
                  return next;
                });
              }}
              placeholder="e.g. Vacation, Doctor appointment…"
              autoFocus
            />
            {errors.title && <span className={styles.error}>{errors.title}</span>}
          </div>

          {/* All-day toggle */}
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={allDay}
              disabled={isAllDayLocked}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const next = e.target.checked;
                setAllDay(next);
                // Re-normalise existing start/end values to the new input format
                const s = fromInput(start, allDay);
                const en = fromInput(end, allDay);
                if (s) setStart(toDateInput(s, next));
                if (en) setEnd(toDateInput(en, next));
              }}
            />
            All day
          </label>
          {isAllDayLocked && intentMeta.allDayHelp && (
            <span className={styles.helperText}>{intentMeta.allDayHelp}</span>
          )}

          {/* Start / End */}
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="af-start">
                Start <span className={styles.req}>*</span>
              </label>
              <input
                id="af-start"
                type={allDay ? 'date' : 'datetime-local'}
                className={[styles.input, errors.start && styles.inputError].filter(Boolean).join(' ')}
                value={start}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setStart(e.target.value);
                  setErrors((v: Record<string, string>) => {
                    const next = { ...v };
                    delete next.start;
                    delete next.end;
                    return next;
                  });
                }}
              />
              {errors.start && <span className={styles.error}>{errors.start}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="af-end">
                End <span className={styles.req}>*</span>
              </label>
              <input
                id="af-end"
                type={allDay ? 'date' : 'datetime-local'}
                className={[styles.input, errors.end && styles.inputError].filter(Boolean).join(' ')}
                value={end}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setEnd(e.target.value);
                  setErrors((v: Record<string, string>) => {
                    const next = { ...v };
                    delete next.end;
                    return next;
                  });
                }}
              />
              {errors.end && <span className={styles.error}>{errors.end}</span>}
            </div>
          </div>

          {/* Notes */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="af-notes">Notes</label>
            <textarea
              id="af-notes"
              className={styles.textarea}
              rows={3}
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Optional notes…"
            />
          </div>

          {/* Color swatch preview */}
          <div className={styles.colorPreview}>
            <span
              className={styles.colorSwatch}
              style={{ background: meta.color }}
              aria-hidden="true"
            />
            <span className={styles.colorLabel}>
              {isEdit ? 'Changes will keep this event in' : 'Event will be shown in'} {kindLabel.toLowerCase()} color
            </span>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnSave}>
              {isEdit && kind === 'availability' ? 'Save Availability Changes' : intentMeta.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

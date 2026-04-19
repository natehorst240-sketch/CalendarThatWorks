/**
 * EventForm.jsx — Modal for adding / editing events.
 * Layout and orchestration only; business logic lives in useEventDraftState
 * and the extracted section components.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEventDraftState, fromDatetimeLocal } from '../hooks/useEventDraftState';
import { BUILT_IN_EVENT_TEMPLATES } from '../core/engine/recurrence/templates.ts';
import { RecurrenceSection } from './EventFormSections/RecurrenceSection';
import { CategorySection } from './EventFormSections/CategorySection';
import { CustomFieldsSection } from './EventFormSections/CustomFieldsSection';
import ConfirmDialog from './ConfirmDialog';
import styles from './EventForm.module.css';

export default function EventForm({ event, config, categories, onSave, onDelete, onClose, permissions, onAddCategory }: any) {
  const isNew   = !event?.id || event.id.startsWith('wc-');
  const trapRef = useFocusTrap(onClose);
  const draft   = useEventDraftState(event, categories, config);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!draft.validate()) return;
    const normalizedResource = typeof draft.values.resource === 'string'
      ? draft.values.resource.trim()
      : String(draft.values.resource ?? '').trim();
    onSave({
      ...(event || {}),
      title:    draft.values.title.trim(),
      start:    fromDatetimeLocal(draft.values.start),
      end:      fromDatetimeLocal(draft.values.end),
      allDay:   draft.values.allDay,
      category: draft.values.category || null,
      resource: normalizedResource || null,
      color:    draft.values.color || undefined,
      meta:     draft.values.meta,
      rrule:    draft.buildRRule(),
      exdates:  event?.exdates ?? [],
    });
  }

  const d = draft; // short alias for JSX readability

  return (
    <>
      {confirmDeleteOpen && (
        <ConfirmDialog
          message="Delete this event? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => { onDelete(event.id); onClose(); }}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}
      <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles.modal} ref={trapRef} role="dialog" aria-modal="true" aria-label={isNew ? 'Add event' : 'Edit event'}>
          <div className={styles.header}>
            <h2 className={styles.title}>{isNew ? 'Add Event' : 'Edit Event'}</h2>
            <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ef-template">Template</label>
              <select id="ef-template" className={styles.select} value={d.templateId} onChange={e => d.applyTemplate(e.target.value)}>
                {BUILT_IN_EVENT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ef-title">Title <span className={styles.req}>*</span></label>
              <input id="ef-title"
                className={[styles.input, d.errors.title && styles.inputError].filter(Boolean).join(' ')}
                value={d.values.title} onChange={e => d.set('title', e.target.value)}
                placeholder="Event title" autoFocus />
              {d.errors.title && <span className={styles.error}>{d.errors.title}</span>}
            </div>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={d.values.allDay} onChange={e => d.set('allDay', e.target.checked)} />
              All day event
            </label>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ef-start">Start <span className={styles.req}>*</span></label>
                <input id="ef-start" type={d.values.allDay ? 'date' : 'datetime-local'}
                  className={[styles.input, d.errors.start && styles.inputError].filter(Boolean).join(' ')}
                  value={d.values.allDay ? d.values.start.slice(0, 10) : d.values.start}
                  onChange={e => d.set('start', e.target.value)} />
                {d.errors.start && <span className={styles.error}>{d.errors.start}</span>}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ef-end">End <span className={styles.req}>*</span></label>
                <input id="ef-end" type={d.values.allDay ? 'date' : 'datetime-local'}
                  className={[styles.input, d.errors.end && styles.inputError].filter(Boolean).join(' ')}
                  value={d.values.allDay ? d.values.end.slice(0, 10) : d.values.end}
                  onChange={e => d.set('end', e.target.value)} />
                {d.errors.end && <span className={styles.error}>{d.errors.end}</span>}
              </div>
            </div>
            <RecurrenceSection preset={d.recurrencePreset} customRrule={d.customRrule}
              onPresetChange={d.setRecurrencePreset} onCustomRruleChange={d.setCustomRrule} />
            <div className={styles.row2}>
              <CategorySection value={d.values.category} allCats={d.allCats}
                onAddCategory={onAddCategory} onChange={cat => d.set('category', cat)} />
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ef-resource">Resource</label>
                <input id="ef-resource" className={styles.input} value={d.values.resource}
                  onChange={e => d.set('resource', e.target.value)} placeholder="Tail #, room, person…" />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ef-color-text">Color override</label>
              <div className={styles.colorRow}>
                <input type="color" aria-label="Color picker" className={styles.colorPicker}
                  value={d.values.color || '#3b82f6'} onChange={e => d.set('color', e.target.value)} />
                <input id="ef-color-text" className={styles.input} value={d.values.color}
                  onChange={e => d.set('color', e.target.value)} placeholder="#3b82f6 or leave blank" />
                {d.values.color && (
                  <button type="button" className={styles.clearColor} onClick={() => d.set('color', '')}>Clear</button>
                )}
              </div>
            </div>
            <CustomFieldsSection category={d.values.category} customFields={d.customFields}
              metaValues={d.values.meta} errors={d.errors} onMetaChange={d.setMeta} />
            <div className={styles.actions}>
              {!isNew && onDelete && (
                <button type="button" className={styles.btnDelete} onClick={() => setConfirmDeleteOpen(true)}>Delete</button>
              )}
              <div className={styles.actionRight}>
                <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
                <button type="submit" className={styles.btnSave}>{isNew ? 'Add Event' : 'Save Changes'}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

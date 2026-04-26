/**
 * EventForm.jsx — Modal for adding / editing events.
 * Layout and orchestration only; business logic lives in useEventDraftState
 * and the extracted section components.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEventDraftState, fromDatetimeLocal } from '../hooks/useEventDraftState';
import { BUILT_IN_EVENT_TEMPLATES } from '../core/engine/recurrence/templates.ts';
import { RecurrenceSection } from './EventFormSections/RecurrenceSection';
import { CategorySection } from './EventFormSections/CategorySection';
import { CustomFieldsSection } from './EventFormSections/CustomFieldsSection';
import { MaintenanceSection } from './EventFormSections/MaintenanceSection';
import { completeMaintenance } from '../core/maintenance';
import type { MaintenanceMeta, MaintenanceRule, MeterType } from '../types/maintenance';
import type { WorksCalendarEvent } from '../types/events';
import ConfirmDialog from './ConfirmDialog';
import styles from './EventForm.module.css';

export default function EventForm({
  event, config, categories, onSave, onDelete, onClose, permissions, onAddCategory,
  maintenanceRules,
}: any) {
  const isNew   = !event?.id || event.id.startsWith('wc-');
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);
  const draft   = useEventDraftState(event, categories, config);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.validate()) return;
    const normalizedResource = draft.values.resource == null ? '' : String(draft.values.resource);
    const resource = normalizedResource.trim() || null;
    const start    = fromDatetimeLocal(draft.values.start);
    const end      = fromDatetimeLocal(draft.values.end);

    let meta = draft.values.meta;

    // When the user marks a maintenance event complete, run completeMaintenance
    // so the projected nextDue* fields land on event.meta.maintenance without
    // the consumer having to wire it themselves. No-op when the form had no
    // rules supplied or the section wasn't used.
    const maintMeta = meta?.['maintenance'] as MaintenanceMeta | undefined;
    if (maintMeta?.lifecycle === 'complete' && maintMeta.ruleId && Array.isArray(maintenanceRules)) {
      const rule = (maintenanceRules as readonly MaintenanceRule[]).find(r => r.id === maintMeta.ruleId);
      const meterType = inferMeterType(rule);
      if (rule && (meterType ? maintMeta.meterAtService != null : true)) {
        const partialEvent: WorksCalendarEvent = {
          id:    event?.id,
          title: draft.values.title.trim(),
          start: start as Date,
          ...(end && { end }),
          meta,
        };
        const { event: completed } = completeMaintenance(partialEvent, rule, {
          assetId: resource ?? '',
          type:    meterType ?? 'miles', // arbitrary placeholder for date-only rules
          value:   maintMeta.meterAtService ?? 0,
          asOf:    (end ?? start ?? new Date()).toISOString(),
        });
        meta = completed.meta as Record<string, unknown>;
      }
    }

    onSave({
      ...(event || {}),
      title:    draft.values.title.trim(),
      start,
      end,
      allDay:   draft.values.allDay,
      category: draft.values.category || null,
      resource,
      color:    draft.values.color || undefined,
      meta,
      rrule:    draft.buildRRule(),
      exdates:  event?.exdates ?? [],
    });
  }

  function inferMeterType(rule: MaintenanceRule | undefined): MeterType | null {
    const i = rule?.interval;
    if (!i) return null;
    if (i.miles  != null) return 'miles';
    if (i.hours  != null) return 'hours';
    if (i.cycles != null) return 'cycles';
    return null;
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
      <div className={styles['overlay']} onClick={e => e.target === e.currentTarget && onClose()}>
        <div className={styles['modal']} ref={trapRef} role="dialog" aria-modal="true" aria-label={isNew ? 'Add event' : 'Edit event'}>
          <div className={styles['header']}>
            <h2 className={styles['title']}>{isNew ? 'Add Event' : 'Edit Event'}</h2>
            <button className={styles['closeBtn']} onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <form className={styles['form']} onSubmit={handleSubmit} noValidate>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ef-template">Template</label>
              <select id="ef-template" className={styles['select']} value={d.templateId} onChange={e => d.applyTemplate(e.target.value)}>
                {BUILT_IN_EVENT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ef-title">Title <span className={styles['req']}>*</span></label>
              <input id="ef-title"
                className={[styles['input'], d.errors['title'] && styles['inputError']].filter(Boolean).join(' ')}
                value={d.values.title} onChange={e => d.set('title', e.target.value)}
                placeholder="Event title" autoFocus />
              {d.errors['title'] && <span className={styles['error']}>{d.errors['title']}</span>}
            </div>
            <label className={styles['checkRow']}>
              <input type="checkbox" checked={d.values.allDay} onChange={e => d.set('allDay', e.target.checked)} />
              All day event
            </label>
            <div className={styles['row2']}>
              <div className={styles['field']}>
                <label className={styles['label']} htmlFor="ef-start">Start <span className={styles['req']}>*</span></label>
                <input id="ef-start" type={d.values.allDay ? 'date' : 'datetime-local'}
                  className={[styles['input'], d.errors['start'] && styles['inputError']].filter(Boolean).join(' ')}
                  value={d.values.allDay ? d.values.start.slice(0, 10) : d.values.start}
                  onChange={e => d.set('start', e.target.value)} />
                {d.errors['start'] && <span className={styles['error']}>{d.errors['start']}</span>}
              </div>
              <div className={styles['field']}>
                <label className={styles['label']} htmlFor="ef-end">End <span className={styles['req']}>*</span></label>
                <input id="ef-end" type={d.values.allDay ? 'date' : 'datetime-local'}
                  className={[styles['input'], d.errors['end'] && styles['inputError']].filter(Boolean).join(' ')}
                  value={d.values.allDay ? d.values.end.slice(0, 10) : d.values.end}
                  onChange={e => d.set('end', e.target.value)} />
                {d.errors['end'] && <span className={styles['error']}>{d.errors['end']}</span>}
              </div>
            </div>
            <RecurrenceSection preset={d.recurrencePreset} customRrule={d.customRrule}
              onPresetChange={d.setRecurrencePreset} onCustomRruleChange={d.setCustomRrule} />
            <div className={styles['row2']}>
              <CategorySection value={d.values.category} allCats={d.allCats}
                onAddCategory={onAddCategory} onChange={(cat: string) => d.set('category', cat)} />
              <div className={styles['field']}>
                <label className={styles['label']} htmlFor="ef-resource">Resource</label>
                <input id="ef-resource" className={styles['input']} value={d.values.resource}
                  onChange={e => d.set('resource', e.target.value)} placeholder="Tail #, room, person…" />
              </div>
            </div>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ef-color-text">Color override</label>
              <div className={styles['colorRow']}>
                <input type="color" aria-label="Color picker" className={styles['colorPicker']}
                  value={d.values.color || '#3b82f6'} onChange={e => d.set('color', e.target.value)} />
                <input id="ef-color-text" className={styles['input']} value={d.values.color}
                  onChange={e => d.set('color', e.target.value)} placeholder="#3b82f6 or leave blank" />
                {d.values.color && (
                  <button type="button" className={styles['clearColor']} onClick={() => d.set('color', '')}>Clear</button>
                )}
              </div>
            </div>
            {Array.isArray(maintenanceRules) && maintenanceRules.length > 0 && (() => {
              const completedAt = fromDatetimeLocal(d.values.end)?.toISOString()
                ?? fromDatetimeLocal(d.values.start)?.toISOString();
              return (
                <MaintenanceSection
                  value={d.values.meta?.['maintenance'] as MaintenanceMeta | undefined}
                  rules={maintenanceRules}
                  {...(completedAt && { completedAt })}
                  onChange={(next) => d.setMeta('maintenance', next)}
                />
              );
            })()}
            <CustomFieldsSection category={d.values.category} customFields={d.customFields}
              metaValues={d.values.meta} errors={d.errors} onMetaChange={d.setMeta} />
            <div className={styles['actions']}>
              {!isNew && onDelete && (
                <button type="button" className={styles['btnDelete']} onClick={() => setConfirmDeleteOpen(true)}>Delete</button>
              )}
              <div className={styles['actionRight']}>
                <button type="button" className={styles['btnCancel']} onClick={onClose}>Cancel</button>
                <button type="submit" className={styles['btnSave']}>{isNew ? 'Add Event' : 'Save Changes'}</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

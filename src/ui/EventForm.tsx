/**
 * EventForm.jsx — Modal for adding / editing events.
 * Layout and orchestration only; business logic lives in useEventDraftState
 * and the extracted section components.
 */
import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ShieldCheck, Users, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { useEventDraftState, fromDatetimeLocal } from '../hooks/useEventDraftState';
import { BUILT_IN_EVENT_TEMPLATES } from '../core/engine/recurrence/templates.ts';
import { RecurrenceSection } from './EventFormSections/RecurrenceSection';
import { CategorySection } from './EventFormSections/CategorySection';
import { CustomFieldsSection } from './EventFormSections/CustomFieldsSection';
import { MaintenanceSection } from './EventFormSections/MaintenanceSection';
import { completeMaintenance } from '../core/maintenance';
import type { MaintenanceMeta, MaintenanceRule, MeterType } from '../types/maintenance';
import type { WorksCalendarEvent } from '../types/events';
import type { ConflictEvaluationResult } from '../core/conflictEngine';
import ConfirmDialog from './ConfirmDialog';
import ConflictModal from './ConflictModal';
import styles from './EventForm.module.css';

export default function EventForm({
  event, config, categories, onSave, onDelete, onClose, permissions, onAddCategory,
  maintenanceRules,
  /**
   * Optional pre-save conflict check. When provided, the form runs it on
   * the built payload and gates `onSave` behind ConflictModal whenever
   * the engine returns violations. Hard violations block the save; soft
   * ones surface a Proceed-anyway override. Wired by WorksCalendar from
   * `evaluateConflicts` against the live event set + owner-configured
   * rules; consumers that don't pass it get the previous unchecked path.
   */
  onCheckConflicts,
  /**
   * Categories whose events route through the approval state machine.
   * When the draft's category matches, the form (a) shows an inline
   * banner so users know the save will land in `requested` rather than
   * a confirmed booking, and (b) auto-tags `meta.approvalStage` on
   * submit so the lifecycle starts correctly. Mirrors the tagging
   * AssetRequestForm already does — this closes the silent bypass when
   * an asset-request category is created via the generic Add Event
   * button instead of the Request Asset action.
   */
  approvalCategories = [],
  /**
   * Resource pools the host has configured. Used only for a read-only
   * indicator on pool-seeded drafts ("Booking against the West Fleet
   * pool — system picks a member"); the form itself does not let users
   * edit the pool selection. Closes #386 item #11.
   */
  pools = [],
}: any) {
  const isNew   = !event?.id || event.id.startsWith('wc-');
  const draft   = useEventDraftState(event, categories, config);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [conflictResult, setConflictResult] = useState<ConflictEvaluationResult | null>(null);
  const [pendingPayload,  setPendingPayload]  = useState<any>(null);

  // Approval categories the draft should route through. Recomputed each
  // render because the user can change the category in-form and the
  // banner / auto-tag must follow.
  const approvalCategorySet = useMemo<Set<string>>(
    () => new Set((approvalCategories ?? []).map((c: unknown) => String(c))),
    [approvalCategories],
  );
  const requiresApproval = !!draft.values.category && approvalCategorySet.has(String(draft.values.category));

  // Pool indicator. Only fires for drafts that arrived already bound to
  // a pool (today: WorksCalendar seeds pool-row clicks with
  // `resourcePoolId`). The form does not let users pick a pool here.
  const seededPoolId: string | null = (event?.resourcePoolId as string | undefined) ?? null;
  const seededPool = useMemo(
    () => (seededPoolId ? (pools as Array<{ id: string; name?: string }>).find(p => p.id === seededPoolId) ?? null : null),
    [seededPoolId, pools],
  );

  // Dirty guard: track first user interaction rather than snapshotting
  // draft.values on mount. `useEventDraftState` runs a category-keyed
  // effect that rewrites `values.meta` on first commit for events that
  // already carry meta — a render-time snapshot would permanently
  // disagree with the live draft and prompt to discard on every clean
  // close. The form's `onChange` covers all input edits; the only
  // button-driven state mutation (color clear) calls `markDirty()`
  // explicitly. The Cancel button stays bare (intentional discard).
  const [dirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);
  const { requestClose, pendingClose, confirmDiscard, cancelDiscard } =
    useDirtyGuard({ dirty, onClose });
  const trapRef = useFocusTrap<HTMLDivElement>(requestClose);

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

    // Auto-tag approvalStage when the chosen category routes through the
    // approval state machine. Only seed a *new* stage — never overwrite
    // an existing approvalStage that's already moved past 'requested'
    // (approved / finalized / denied) since editing the event shouldn't
    // rewind the lifecycle.
    const draftCategory = draft.values.category || null;
    const categoryNeedsApproval = !!draftCategory && approvalCategorySet.has(String(draftCategory));
    const existingStage = (meta?.['approvalStage'] as { stage?: string } | undefined)?.stage;
    if (categoryNeedsApproval && !existingStage) {
      meta = {
        ...(meta ?? {}),
        approvalStage: { stage: 'requested', updatedAt: new Date().toISOString() },
      };
    }

    const payload = {
      ...(event || {}),
      title:    draft.values.title.trim(),
      start,
      end,
      allDay:   draft.values.allDay,
      category: draftCategory,
      resource,
      color:    draft.values.color || undefined,
      meta,
      rrule:    draft.buildRRule(),
      exdates:  event?.exdates ?? [],
    };

    // Conflict gate. `evaluateConflicts` returns {violations, severity,
    // allowed} — when severity is 'soft' we still allow the user to
    // proceed via the modal; 'hard' blocks. No-op when the host hasn't
    // wired the checker (legacy hosts are unaffected).
    if (onCheckConflicts) {
      const result: ConflictEvaluationResult | null = onCheckConflicts(payload);
      if (result && result.severity !== 'none' && result.violations.length > 0) {
        setConflictResult(result);
        setPendingPayload(payload);
        return;
      }
    }

    onSave(payload);
  }

  function handleConflictProceed() {
    const payload = pendingPayload;
    setConflictResult(null);
    setPendingPayload(null);
    if (payload) onSave(payload);
  }

  function handleConflictCancel() {
    setConflictResult(null);
    setPendingPayload(null);
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
      {pendingClose && (
        <ConfirmDialog
          message="Discard your changes?"
          confirmLabel="Discard"
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
      )}
      {conflictResult && (
        <ConflictModal
          result={conflictResult}
          onProceed={handleConflictProceed}
          onCancel={handleConflictCancel}
        />
      )}
      <div className={styles['overlay']} onClick={e => e.target === e.currentTarget && requestClose()}>
        <div className={styles['modal']} ref={trapRef} role="dialog" aria-modal="true" aria-label={isNew ? 'Add event' : 'Edit event'}>
          <div className={styles['header']}>
            <h2 className={styles['title']}>{isNew ? 'Add Event' : 'Edit Event'}</h2>
            <button className={styles['closeBtn']} onClick={requestClose} aria-label="Close"><X size={18} /></button>
          </div>
          <form className={styles['form']} onSubmit={handleSubmit} onChange={markDirty} noValidate>
            {seededPool && (
              <div className={styles['inlineNotice']} role="status" data-variant="info">
                <Users size={14} aria-hidden="true" />
                <span>
                  Booking against the <strong>{seededPool.name ?? seededPool.id}</strong> pool — the system picks an available member when you save.
                </span>
              </div>
            )}
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
                  <button type="button" className={styles['clearColor']} onClick={() => { d.set('color', ''); markDirty(); }}>Clear</button>
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
            {requiresApproval && (
              <div className={styles['inlineNotice']} role="status" data-variant="approval">
                <ShieldCheck size={14} aria-hidden="true" />
                <span>This category routes through approval — your save lands as <strong>requested</strong> until approved.</span>
              </div>
            )}
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

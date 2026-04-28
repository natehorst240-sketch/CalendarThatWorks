/**
 * AssetRequestForm — focused modal for submitting an asset request that
 * enters the approvals state machine at stage `requested`.
 *
 * The host opts into this flow by passing `assetRequestCategories` (an
 * ordered array of category ids) on <WorksCalendar>. When present AND an
 * `assets` registry is provided, AssetsView renders a "Request Asset"
 * button that opens this modal. Submission routes through the same
 * `onEventSave` path as EventForm; the only difference is that the event
 * ships with `meta.approvalStage = { stage: 'requested', updatedAt }`.
 */
import { useMemo, useState } from 'react';
import type { FormEvent, ChangeEvent, MouseEvent } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDirtyGuard } from '../hooks/useDirtyGuard';
import { toDatetimeLocal, fromDatetimeLocal } from '../hooks/useEventDraftState';
import ConfirmDialog from './ConfirmDialog';
import styles from './EventForm.module.css';

type AssetEntry = { id: string; label: string; group?: string | undefined; meta?: Record<string, unknown> | undefined };
type CategoryEntry = { id: string; label?: string | undefined; color?: string | undefined };

type RoleEntry = { id: string; label: string };
type RequirementTemplate = { roles: RoleEntry[]; requiresApproval: boolean };

type AssetRequestPayload = {
  title: string;
  start: Date;
  end: Date;
  allDay: false;
  category: string;
  resource: string;
  meta: Record<string, unknown>;
};

type AssetRequestFormProps = {
  assets: AssetEntry[];
  categories: CategoryEntry[];
  initialStart?: Date | undefined;
  initialAssetId?: string | undefined;
  /**
   * Per-asset-type requirement templates. The form looks up the selected
   * asset's `meta.assetTypeId` and renders a slot input per role plus an
   * approval-required banner when requested. Optional — when absent the
   * form behaves exactly like the pre-template version.
   */
  requirementTemplates?: Record<string, RequirementTemplate> | undefined;
  onSubmit: (payload: AssetRequestPayload) => void;
  onClose: () => void;
};

export default function AssetRequestForm({
  assets,
  categories,
  initialStart,
  initialAssetId,
  requirementTemplates,
  onSubmit,
  onClose,
}: AssetRequestFormProps) {
  const start = initialStart instanceof Date ? initialStart : new Date();
  const defaultEnd = new Date(start.getTime() + 60 * 60 * 1000);

  const [assetId,  setAssetId]  = useState(initialAssetId ?? assets[0]?.id ?? '');
  const [category, setCategory] = useState(categories[0]?.id ?? '');
  const [title,    setTitle]    = useState('');
  const [startStr, setStartStr] = useState(toDatetimeLocal(start));
  const [endStr,   setEndStr]   = useState(toDatetimeLocal(defaultEnd));
  const [notes,    setNotes]    = useState('');
  const [requirements, setRequirements] = useState<Record<string, string>>({});
  const [errors,   setErrors]   = useState<Record<string, string>>({});

  // Dirty guard. Cancel button stays bare; X / overlay / Esc route through
  // `requestClose`.
  const initialSnapshot = useMemo(
    () => JSON.stringify({
      assetId: initialAssetId ?? assets[0]?.id ?? '',
      category: categories[0]?.id ?? '',
      title: '',
      startStr: toDatetimeLocal(start),
      endStr: toDatetimeLocal(defaultEnd),
      notes: '',
      requirements: {},
    }),
    [], // eslint-disable-line react-hooks/exhaustive-deps -- mount-only
  );
  const dirty = initialSnapshot !== JSON.stringify({ assetId, category, title, startStr, endStr, notes, requirements });
  const { requestClose, pendingClose, confirmDiscard, cancelDiscard } =
    useDirtyGuard({ dirty, onClose });
  const trapRef = useFocusTrap<HTMLDivElement>(requestClose);

  const assetOptions = useMemo(
    () => assets.map((a) => ({ value: a.id, label: a.label || a.id })),
    [assets],
  );

  const selectedAsset = useMemo(
    () => assets.find(a => a.id === assetId),
    [assets, assetId],
  );

  // The active template is the one keyed by the selected asset's typeId.
  // Anonymous types (assets without `meta.assetTypeId`) get no slots.
  const activeTemplate: RequirementTemplate | null = useMemo(() => {
    if (!requirementTemplates) return null;
    const typeId = typeof selectedAsset?.meta?.['assetTypeId'] === 'string'
      ? (selectedAsset.meta['assetTypeId'] as string)
      : null;
    if (!typeId) return null;
    return requirementTemplates[typeId] ?? null;
  }, [requirementTemplates, selectedAsset]);

  function validate() {
    const e: Record<string, string> = {};
    if (!title.trim()) e['title']    = 'Title is required';
    if (!assetId)      e['assetId']  = 'Select an asset';
    if (!category)     e['category'] = 'Select a category';
    if (!startStr)     e['start']    = 'Start is required';
    if (!endStr)       e['end']      = 'End is required';
    if (startStr && endStr) {
      const s = fromDatetimeLocal(startStr);
      const en = fromDatetimeLocal(endStr);
      if (s && en && en <= s) e['end'] = 'End must be after start';
    }
    if (activeTemplate) {
      for (const role of activeTemplate.roles) {
        if (!requirements[role.id]?.trim()) {
          e[`req:${role.id}`] = `${role.label} is required`;
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
    const s = fromDatetimeLocal(startStr);
    const en = fromDatetimeLocal(endStr);
    if (!s || !en) return;

    // Trim and only emit role keys actually defined by the active template;
    // dropping stale entries keeps the persisted payload clean if the user
    // switched assets after typing.
    const cleanRequirements: Record<string, string> = {};
    if (activeTemplate) {
      for (const role of activeTemplate.roles) {
        const value = requirements[role.id]?.trim();
        if (value) cleanRequirements[role.id] = value;
      }
    }

    onSubmit({
      title:    title.trim(),
      start:    s,
      end:      en,
      allDay:   false,
      category,
      resource: assetId,
      meta: {
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(Object.keys(cleanRequirements).length > 0 ? { requirements: cleanRequirements } : {}),
        approvalStage: { stage: 'requested', updatedAt: new Date().toISOString() },
      },
    });
  }

  return (
    <>
      {pendingClose && (
        <ConfirmDialog
          message="Discard your changes?"
          confirmLabel="Discard"
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
      )}
    <div className={styles['overlay']} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && requestClose()}>
      <div
        className={styles['modal']}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Request asset"
      >
        <div className={styles['header']}>
          <h2 className={styles['title']}>Request Asset</h2>
          <button className={styles['closeBtn']} onClick={requestClose} aria-label="Close"><X size={18} /></button>
        </div>
        <form className={styles['form']} onSubmit={handleSubmit} noValidate>
          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="ar-title">Title <span className={styles['req']}>*</span></label>
            <input
              id="ar-title"
              className={[styles['input'], errors['title'] && styles['inputError']].filter(Boolean).join(' ')}
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="e.g. A-check, VIP charter, CRM training"
              autoFocus
            />
            {errors['title'] && <span className={styles['error']}>{errors['title']}</span>}
          </div>

          <div className={styles['row2']}>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ar-asset">Asset <span className={styles['req']}>*</span></label>
              <select
                id="ar-asset"
                className={styles['select']}
                value={assetId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setAssetId(e.target.value)}
              >
                {assetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors['assetId'] && <span className={styles['error']}>{errors['assetId']}</span>}
            </div>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ar-category">Category <span className={styles['req']}>*</span></label>
              <select
                id="ar-category"
                className={styles['select']}
                value={category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label ?? c.id}</option>
                ))}
              </select>
              {errors['category'] && <span className={styles['error']}>{errors['category']}</span>}
            </div>
          </div>

          <div className={styles['row2']}>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ar-start">Start <span className={styles['req']}>*</span></label>
              <input
                id="ar-start"
                type="datetime-local"
                className={[styles['input'], errors['start'] && styles['inputError']].filter(Boolean).join(' ')}
                value={startStr}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStartStr(e.target.value)}
              />
              {errors['start'] && <span className={styles['error']}>{errors['start']}</span>}
            </div>
            <div className={styles['field']}>
              <label className={styles['label']} htmlFor="ar-end">End <span className={styles['req']}>*</span></label>
              <input
                id="ar-end"
                type="datetime-local"
                className={[styles['input'], errors['end'] && styles['inputError']].filter(Boolean).join(' ')}
                value={endStr}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEndStr(e.target.value)}
              />
              {errors['end'] && <span className={styles['error']}>{errors['end']}</span>}
            </div>
          </div>

          {activeTemplate && activeTemplate.roles.length > 0 && (
            <fieldset className={styles['field']} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className={styles['label']} style={{ padding: 0 }}>
                Required for this {selectedAsset?.meta?.['assetTypeId'] ? 'type' : 'asset'}
              </legend>
              {activeTemplate.roles.map(role => {
                const errKey = `req:${role.id}`;
                const inputId = `ar-req-${role.id}`;
                return (
                  <div key={role.id} className={styles['field']} style={{ marginTop: 8 }}>
                    <label className={styles['label']} htmlFor={inputId}>
                      {role.label} <span className={styles['req']}>*</span>
                    </label>
                    <input
                      id={inputId}
                      className={[styles['input'], errors[errKey] && styles['inputError']].filter(Boolean).join(' ')}
                      value={requirements[role.id] ?? ''}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setRequirements(prev => ({ ...prev, [role.id]: e.target.value }))
                      }
                      placeholder={`Who is the ${role.label.toLowerCase()}?`}
                    />
                    {errors[errKey] && <span className={styles['error']}>{errors[errKey]}</span>}
                  </div>
                );
              })}
            </fieldset>
          )}

          {activeTemplate?.requiresApproval && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                fontSize: 12,
                color: 'var(--wc-text-muted, #475569)',
                background: 'color-mix(in srgb, var(--wc-accent, #3b82f6) 8%, transparent)',
                border: '1px dashed color-mix(in srgb, var(--wc-accent, #3b82f6) 35%, transparent)',
                borderRadius: 8,
              }}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              <span>This request needs approval before it’s confirmed.</span>
            </div>
          )}

          <div className={styles['field']}>
            <label className={styles['label']} htmlFor="ar-notes">Notes</label>
            <textarea
              id="ar-notes"
              className={styles['textarea']}
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Optional — context for the approver"
              rows={3}
            />
          </div>

          <div className={styles['actions']}>
            <div className={styles['actionRight']}>
              <button type="button" className={styles['btnCancel']} onClick={onClose}>Cancel</button>
              <button type="submit" className={styles['btnSave']}>Submit Request</button>
            </div>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}

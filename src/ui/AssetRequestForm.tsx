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
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { toDatetimeLocal, fromDatetimeLocal } from '../hooks/useEventDraftState';
import styles from './EventForm.module.css';

type AssetEntry = { id: string; label: string; group?: string; meta?: Record<string, unknown> };
type CategoryEntry = { id: string; label?: string; color?: string };

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
  initialStart?: Date;
  initialAssetId?: string;
  onSubmit: (payload: AssetRequestPayload) => void;
  onClose: () => void;
};

export default function AssetRequestForm({
  assets,
  categories,
  initialStart,
  initialAssetId,
  onSubmit,
  onClose,
}: AssetRequestFormProps) {
  const trapRef = useFocusTrap<HTMLDivElement>(onClose);

  const start = initialStart instanceof Date ? initialStart : new Date();
  const defaultEnd = new Date(start.getTime() + 60 * 60 * 1000);

  const [assetId,  setAssetId]  = useState(initialAssetId ?? assets[0]?.id ?? '');
  const [category, setCategory] = useState(categories[0]?.id ?? '');
  const [title,    setTitle]    = useState('');
  const [startStr, setStartStr] = useState(toDatetimeLocal(start));
  const [endStr,   setEndStr]   = useState(toDatetimeLocal(defaultEnd));
  const [notes,    setNotes]    = useState('');
  const [errors,   setErrors]   = useState<Record<string, string>>({});

  const assetOptions = useMemo(
    () => assets.map((a) => ({ value: a.id, label: a.label || a.id })),
    [assets],
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title    = 'Title is required';
    if (!assetId)      e.assetId  = 'Select an asset';
    if (!category)     e.category = 'Select a category';
    if (!startStr)     e.start    = 'Start is required';
    if (!endStr)       e.end      = 'End is required';
    if (startStr && endStr) {
      const s = fromDatetimeLocal(startStr);
      const en = fromDatetimeLocal(endStr);
      if (s && en && en <= s) e.end = 'End must be after start';
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
    onSubmit({
      title:    title.trim(),
      start:    s,
      end:      en,
      allDay:   false,
      category,
      resource: assetId,
      meta: {
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        approvalStage: { stage: 'requested', updatedAt: new Date().toISOString() },
      },
    });
  }

  return (
    <div className={styles.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose()}>
      <div
        className={styles.modal}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Request asset"
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Request Asset</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ar-title">Title <span className={styles.req}>*</span></label>
            <input
              id="ar-title"
              className={[styles.input, errors.title && styles.inputError].filter(Boolean).join(' ')}
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="e.g. A-check, VIP charter, CRM training"
              autoFocus
            />
            {errors.title && <span className={styles.error}>{errors.title}</span>}
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ar-asset">Asset <span className={styles.req}>*</span></label>
              <select
                id="ar-asset"
                className={styles.select}
                value={assetId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setAssetId(e.target.value)}
              >
                {assetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.assetId && <span className={styles.error}>{errors.assetId}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ar-category">Category <span className={styles.req}>*</span></label>
              <select
                id="ar-category"
                className={styles.select}
                value={category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label ?? c.id}</option>
                ))}
              </select>
              {errors.category && <span className={styles.error}>{errors.category}</span>}
            </div>
          </div>

          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ar-start">Start <span className={styles.req}>*</span></label>
              <input
                id="ar-start"
                type="datetime-local"
                className={[styles.input, errors.start && styles.inputError].filter(Boolean).join(' ')}
                value={startStr}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStartStr(e.target.value)}
              />
              {errors.start && <span className={styles.error}>{errors.start}</span>}
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ar-end">End <span className={styles.req}>*</span></label>
              <input
                id="ar-end"
                type="datetime-local"
                className={[styles.input, errors.end && styles.inputError].filter(Boolean).join(' ')}
                value={endStr}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEndStr(e.target.value)}
              />
              {errors.end && <span className={styles.error}>{errors.end}</span>}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="ar-notes">Notes</label>
            <textarea
              id="ar-notes"
              className={styles.textarea}
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="Optional — context for the approver"
              rows={3}
            />
          </div>

          <div className={styles.actions}>
            <div className={styles.actionRight}>
              <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
              <button type="submit" className={styles.btnSave}>Submit Request</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

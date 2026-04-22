import { useMemo, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { EventStatus } from '../types/events';
import styles from './ScheduleTemplateDialog.module.css';

type TemplateEntry = {
  title: string;
  startOffsetMinutes: number;
  durationMinutes: number;
};

type ScheduleTemplate = {
  id: string;
  name: string;
  entries: TemplateEntry[];
};

type GeneratedEvent = {
  id?: string;
  title?: string;
  start?: string | number | Date;
  end?: string | Date;
  startOffsetMinutes?: number;
  durationMinutes?: number;
  category?: string | null;
  resource?: string | null;
  status?: EventStatus;
  color?: string | null;
  rrule?: string;
  exdates?: Array<string | Date>;
  meta?: Record<string, unknown>;
};

type PreviewConflict = {
  index?: number;
  violations?: Array<{ rule?: string; message?: string }>;
};

type PreviewResult = {
  generated: GeneratedEvent[];
  conflicts: PreviewConflict[];
  error: string;
};

type InstantiateRequest = {
  templateId?: string;
  anchor: Date;
  resource?: string;
  category?: string;
};

type ScheduleTemplateDialogProps = {
  templates?: ScheduleTemplate[];
  onInstantiate?: (request: InstantiateRequest) => void;
  onPreview?: (request: InstantiateRequest) => { generated?: GeneratedEvent[]; conflicts?: PreviewConflict[]; error?: string };
  onClose?: () => void;
};

function toDatetimeLocal(date: string | number | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateTemplate(template: ScheduleTemplate | null): string {
  if (!template) return 'Please choose a schedule template.';
  if (!Array.isArray(template.entries) || template.entries.length === 0) {
    return 'The selected template has no entries to generate.';
  }
  const hasMalformedEntry = template.entries.some((entry) => (
    !entry
    || typeof entry.title !== 'string'
    || !Number.isFinite(entry.startOffsetMinutes)
    || !Number.isFinite(entry.durationMinutes)
  ));
  if (hasMalformedEntry) {
    return 'The selected template has malformed entries and cannot be instantiated.';
  }
  return '';
}

export default function ScheduleTemplateDialog({
  templates = [],
  onInstantiate,
  onPreview,
  onClose,
}: ScheduleTemplateDialogProps) {
  const [templateId, setTemplateId] = useState(() => templates[0]?.id ?? '');
  const [anchor, setAnchor] = useState(() => toDatetimeLocal(new Date()));
  const [resource, setResource] = useState('');
  const [category, setCategory] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const anchorDate = useMemo(() => new Date(anchor), [anchor]);
  const anchorError = Number.isNaN(anchorDate.getTime()) ? 'Enter a valid anchor start date/time.' : '';
  const templateError = useMemo(() => validateTemplate(selectedTemplate), [selectedTemplate]);

  const request = useMemo(() => ({
    templateId: selectedTemplate?.id,
    anchor: anchorDate,
    resource: resource.trim() || undefined,
    category: category.trim() || undefined,
  }), [anchorDate, category, resource, selectedTemplate]);

  const preview = useMemo(() => {
    if (!selectedTemplate || anchorError || templateError) {
      return { generated: [], conflicts: [], error: anchorError || templateError || '' };
    }
    try {
      const result = onPreview?.(request);
      return { generated: result?.generated ?? [], conflicts: result?.conflicts ?? [], error: result?.error ?? '' };
    } catch {
      return { generated: [], conflicts: [], error: 'Unable to build schedule preview.' };
    }
  }, [anchorError, onPreview, request, selectedTemplate, templateError]);

  const submitDisabled = !!(templateError || anchorError || preview.error);
  const conflictsByIndex = useMemo(() => {
    const map = new Map<number, PreviewConflict>();
    (preview.conflicts ?? []).forEach((conflict: PreviewConflict) => {
      if (typeof conflict?.index !== 'number') return;
      map.set(conflict.index, conflict);
    });
    return map;
  }, [preview.conflicts]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled || !selectedTemplate) return;

    onInstantiate?.(request);
  }

  return (
    <div className={styles.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Add schedule template">
        <div className={styles.header}>
          <h2 className={styles.title}>Add Schedule</h2>
        </div>

        {templates.length === 0 ? (
          <div className={styles.emptyState}>
            No schedule templates are configured yet.
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label}>
              Template
              <select className={styles.select} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((template: ScheduleTemplate) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>

            <label className={styles.label}>
              Anchor start
              <input
                className={styles.input}
                type="datetime-local"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                required
              />
            </label>

            <label className={styles.label}>
              Resource override (optional)
              <input className={styles.input} value={resource} onChange={(e) => setResource(e.target.value)} />
            </label>

            <label className={styles.label}>
              Category override (optional)
              <input className={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>

            <div className={styles.meta} role="status">
              {selectedTemplate ? `${selectedTemplate.entries.length} entries will be generated.` : 'Choose a template.'}
            </div>

            {(templateError || anchorError || preview.error) && (
              <div className={styles.error} role="alert">
                {templateError || anchorError || preview.error}
              </div>
            )}

            {preview.generated.length > 0 && (
              <div className={styles.preview} aria-label="Generated schedule preview">
                <div className={styles.previewHeader}>
                  Preview ({preview.generated.length})
                  {preview.conflicts.length > 0 && (
                    <span className={styles.conflictBadge}>
                      {preview.conflicts.length} conflict{preview.conflicts.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <ul className={styles.previewList}>
                  {preview.generated.map((ev: GeneratedEvent, idx: number) => (
                    <li
                      key={`${ev.title}-${idx}`}
                      className={`${styles.previewItem} ${conflictsByIndex.has(idx) ? styles.previewItemConflict : ''}`}
                    >
                      <div className={styles.previewSummary}>
                        <span>{ev.title ?? '(untitled)'}</span>
                        <span>{toDatetimeLocal(ev.start)}</span>
                      </div>
                      {conflictsByIndex.has(idx) && (
                        <ul className={styles.conflictList}>
                          {conflictsByIndex.get(idx)?.violations?.map((violation, vIdx: number) => (
                            <li key={`${violation.rule}-${vIdx}`} className={styles.conflictItem}>
                              {violation.message ?? 'Conflict'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button type="submit" className={styles.submitBtn} disabled={submitDisabled}>Create schedule</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

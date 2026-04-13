import { useMemo, useState } from 'react';
import styles from './ScheduleTemplateDialog.module.css';

function toDatetimeLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ScheduleTemplateDialog({ templates = [], onInstantiate, onClose }) {
  const [templateId, setTemplateId] = useState(() => templates[0]?.id ?? '');
  const [anchor, setAnchor] = useState(() => toDatetimeLocal(new Date()));
  const [resource, setResource] = useState('');
  const [category, setCategory] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedTemplate) return;
    const anchorDate = new Date(anchor);
    if (Number.isNaN(anchorDate.getTime())) return;

    onInstantiate?.({
      templateId: selectedTemplate.id,
      anchor: anchorDate,
      resource: resource.trim() || undefined,
      category: category.trim() || undefined,
    });
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
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
                {templates.map((template) => (
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

            <div className={styles.meta}>
              {selectedTemplate ? `${selectedTemplate.entries.length} entries will be generated.` : 'Choose a template.'}
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button type="submit" className={styles.submitBtn}>Create schedule</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

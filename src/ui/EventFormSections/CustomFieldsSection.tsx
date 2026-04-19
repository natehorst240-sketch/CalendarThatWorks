import styles from '../EventForm.module.css';

/**
 * CustomFieldsSection — dynamic schema-driven custom field rendering.
 *
 * Renders nothing when the category has no custom fields.
 *
 * Props:
 *   category     string        — label text (e.g. "Ops fields")
 *   customFields object[]      — field definitions from config.eventFields[category]
 *   metaValues   object        — current meta values keyed by field name
 *   errors       object        — validation errors keyed by `meta_<fieldName>`
 *   onMetaChange (key, val) => void
 */
export function CustomFieldsSection({ category, customFields, metaValues, errors, onMetaChange }: any) {
  if (!customFields.length) return null;

  return (
    <div className={styles.customSection}>
      <div className={styles.customSectionLabel}>{category} fields</div>
      {customFields.map(f => (
        <CustomField
          key={f.name}
          field={f}
          value={metaValues[f.name] ?? ''}
          error={errors[`meta_${f.name}`]}
          onChange={val => onMetaChange(f.name, val)}
        />
      ))}
    </div>
  );
}

/* ── Individual field renderer ──────────────────────────────────────────── */

function CustomField({ field, value, error, onChange }: any) {
  const opts = field.options
    ? field.options.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  // checkbox uses the wrapping-label pattern; all other types need an explicit id/htmlFor pair
  const fieldId = field.type === 'checkbox'
    ? undefined
    : `ef-cf-${field.name.replace(/[^a-z0-9]/gi, '-')}`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {field.name}
        {field.required && <span className={styles.req}> *</span>}
      </label>

      {field.type === 'text' && (
        <input
          id={fieldId}
          className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {field.type === 'number' && (
        <input
          id={fieldId}
          type="number"
          className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {field.type === 'date' && (
        <input
          id={fieldId}
          type="date"
          className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {field.type === 'checkbox' && (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
          Yes
        </label>
      )}
      {field.type === 'select' && (
        <select
          id={fieldId}
          className={[styles.select, error && styles.inputError].filter(Boolean).join(' ')}
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'textarea' && (
        <textarea
          id={fieldId}
          className={[styles.textarea, error && styles.inputError].filter(Boolean).join(' ')}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
        />
      )}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}

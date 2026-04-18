/**
 * RequestForm — schema-driven, owner-configurable event request form
 * (ticket #134-12).
 *
 * The form renders one input per entry in `schema.fields`, validates
 * required values, and emits a normalized `{ values }` object on submit.
 * The schema itself lives in `config.requestForm` so owners can add,
 * remove, or rename fields from ConfigPanel → Request Form without
 * redeploying the host app. Host-level validators / onSubmit callbacks
 * remain the escape hatch for domain logic.
 *
 * Field types:
 *   text       single-line input
 *   textarea   multi-line input
 *   number     numeric input
 *   date       date-only input
 *   datetime   datetime-local input
 *   select     dropdown, options parsed from comma-separated string
 *   checkbox   boolean toggle
 */
import { useMemo, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import styles from './RequestForm.module.css';

const INPUT_TYPES = new Set(['text', 'textarea', 'number', 'date', 'datetime', 'select', 'checkbox']);

function normalizeField(field, idx) {
  const key = typeof field?.key === 'string' && field.key.trim()
    ? field.key.trim()
    : `field-${idx + 1}`;
  const type = INPUT_TYPES.has(field?.type) ? field.type : 'text';
  return {
    key,
    label:       typeof field?.label === 'string' ? field.label : key,
    type,
    required:    !!field?.required,
    placeholder: typeof field?.placeholder === 'string' ? field.placeholder : '',
    options:     typeof field?.options === 'string' ? field.options : '',
  };
}

function defaultForField(field) {
  switch (field.type) {
    case 'checkbox': return false;
    case 'number':   return '';
    default:         return '';
  }
}

function parseOptions(raw) {
  return String(raw ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * @param {object}   props
 * @param {{ fields?: Array<object> }} props.schema
 * @param {object}   [props.initialValues]
 * @param {(payload:{values:object}) => void} props.onSubmit
 * @param {() => void} props.onCancel
 * @param {string}   [props.title]
 */
export default function RequestForm({
  schema,
  initialValues = {},
  onSubmit,
  onCancel,
  title = 'New request',
}) {
  const trapRef = useFocusTrap(onCancel);

  const fields = useMemo(() => {
    const raw = Array.isArray(schema?.fields) ? schema.fields : [];
    return raw.map(normalizeField);
  }, [schema]);

  const [values, setValues] = useState(() => {
    const seed = {};
    for (const f of fields) {
      seed[f.key] = initialValues[f.key] ?? defaultForField(f);
    }
    return seed;
  });
  const [errors, setErrors] = useState({});

  const setValue = (key, next) => setValues(prev => ({ ...prev, [key]: next }));

  const validate = () => {
    const next = {};
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.key];
      if (f.type === 'checkbox') {
        if (!v) next[f.key] = 'Required';
      } else if (v == null || String(v).trim() === '') {
        next[f.key] = 'Required';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit?.({ values });
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-form-title"
        className={styles.panel}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className={styles.head}>
          <h2 id="request-form-title" className={styles.title}>{title}</h2>
        </div>

        <div className={styles.body}>
          {fields.length === 0 && (
            <p className={styles.empty} role="note">
              No request fields configured. Ask your owner to add fields in
              ConfigPanel → Request Form.
            </p>
          )}

          {fields.map(field => {
            const err = errors[field.key];
            const ariaInvalid = err ? 'true' : undefined;

            if (field.type === 'textarea') {
              return (
                <label key={field.key} className={styles.formRow}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <textarea
                    className={styles.textarea}
                    value={values[field.key] ?? ''}
                    onChange={e => setValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    aria-label={field.label}
                    aria-invalid={ariaInvalid}
                    rows={3}
                  />
                  {err && <span className={styles.err} role="alert">{err}</span>}
                </label>
              );
            }

            if (field.type === 'select') {
              const opts = parseOptions(field.options);
              return (
                <label key={field.key} className={styles.formRow}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <select
                    className={styles.select}
                    value={values[field.key] ?? ''}
                    onChange={e => setValue(field.key, e.target.value)}
                    aria-label={field.label}
                    aria-invalid={ariaInvalid}
                  >
                    <option value="">{field.placeholder || 'Select…'}</option>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {err && <span className={styles.err} role="alert">{err}</span>}
                </label>
              );
            }

            if (field.type === 'checkbox') {
              return (
                <label key={field.key} className={styles.toggle}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <input
                    type="checkbox"
                    checked={!!values[field.key]}
                    onChange={e => setValue(field.key, e.target.checked)}
                    aria-label={field.label}
                    aria-invalid={ariaInvalid}
                  />
                  {err && <span className={styles.err} role="alert">{err}</span>}
                </label>
              );
            }

            const htmlType =
              field.type === 'number'   ? 'number'
              : field.type === 'date'   ? 'date'
              : field.type === 'datetime' ? 'datetime-local'
              : 'text';

            return (
              <label key={field.key} className={styles.formRow}>
                <span>{field.label}{field.required ? ' *' : ''}</span>
                <input
                  type={htmlType}
                  className={styles.input}
                  value={values[field.key] ?? ''}
                  onChange={e => setValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  aria-label={field.label}
                  aria-invalid={ariaInvalid}
                />
                {err && <span className={styles.err} role="alert">{err}</span>}
              </label>
            );
          })}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={onCancel}
          >Cancel</button>
          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={fields.length === 0}
          >Submit request</button>
        </div>
      </form>
    </div>
  );
}

import { useMemo, useState } from 'react';
import styles from './CalendarExternalForm.module.css';

const DEFAULT_FIELDS = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'start', label: 'Start', type: 'datetime-local', required: true },
  { name: 'end', label: 'End', type: 'datetime-local', required: true },
  { name: 'allDay', label: 'All day', type: 'checkbox', required: false },
  { name: 'category', label: 'Category', type: 'text', required: false },
  { name: 'resource', label: 'Resource', type: 'text', required: false },
  { name: 'description', label: 'Description', type: 'textarea', required: false },
];

function defaultValidate(values, fields) {
  const errors = {};
  fields.forEach((field) => {
    if (!field.required) return;
    if (field.type === 'checkbox') return;
    const value = values[field.name];
    if (value === '' || value === null || value === undefined) {
      errors[field.name] = `${field.label ?? field.name} is required.`;
    }
  });

  if (values.start && values.end && new Date(values.start) > new Date(values.end)) {
    errors.end = 'End must be after start.';
  }

  return errors;
}

/**
 * Backend-agnostic external event form.
 *
 * Adapter contract:
 *   await adapter.submitEvent(payload, { values, fields })
 */
export default function CalendarExternalForm({
  adapter,
  fields = DEFAULT_FIELDS,
  initialValues = {},
  validate = defaultValidate,
  transform = (values) => values,
  submitLabel = 'Submit event',
  onSuccess,
  onError,
}) {
  const mergedInitialValues = useMemo(() => {
    const fromFields = fields.reduce((acc, field) => {
      acc[field.name] = field.type === 'checkbox' ? false : '';
      return acc;
    }, {});
    return { ...fromFields, ...initialValues };
  }, [fields, initialValues]);

  const [values, setValues] = useState(mergedInitialValues);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setValue(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setSubmitError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationErrors = validate(values, fields);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload = transform(values);
      const result = await adapter.submitEvent(payload, { values, fields });
      onSuccess?.(result, values);
      setValues(mergedInitialValues);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit event.';
      setSubmitError(message);
      onError?.(err, values);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {fields.map((field) => {
          const inputId = `external-${field.name}`;
          const value = values[field.name];
          return (
            <div className={styles.row} key={field.name}>
              <label className={styles.label} htmlFor={inputId}>{field.label}</label>
              {field.type === 'textarea' && (
                <textarea
                  id={inputId}
                  className={styles.textarea}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  rows={3}
                />
              )}
              {field.type === 'select' && (
                <select
                  id={inputId}
                  className={styles.select}
                  value={value}
                  onChange={(e) => setValue(field.name, e.target.value)}
                >
                  <option value="">Select…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
              {field.type === 'checkbox' && (
                <input
                  id={inputId}
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => setValue(field.name, e.target.checked)}
                />
              )}
              {!['textarea', 'select', 'checkbox'].includes(field.type) && (
                <input
                  id={inputId}
                  className={styles.input}
                  type={field.type || 'text'}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(e) => setValue(field.name, e.target.value)}
                />
              )}
              {errors[field.name] && <span className={styles.error}>{errors[field.name]}</span>}
            </div>
          );
        })}

        {submitError && <div className={styles.globalError} role="alert">{submitError}</div>}

        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export { DEFAULT_FIELDS };

import { useMemo, useState, type FormEvent } from 'react';
import styles from './CalendarExternalForm.module.css';

const SUPPORTED_FIELD_TYPES = new Set(['text', 'textarea', 'datetime-local', 'date', 'checkbox', 'select']);

type ExternalFormFieldType = 'text' | 'textarea' | 'datetime-local' | 'date' | 'checkbox' | 'select';

type ExternalFormOption = {
  value: string;
  label: string;
};

type ExternalFormField = {
  name: string;
  label?: string;
  type?: ExternalFormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: ExternalFormOption[];
};

type ExternalFormValues = Record<string, string | number | boolean | Date | null | undefined>;

type ExternalFormSubmitContext = {
  values: ExternalFormValues;
  fields: ExternalFormField[];
};

type ExternalFormAdapter = {
  submitEvent: (payload: unknown, context: ExternalFormSubmitContext) => Promise<unknown> | unknown;
};

const DEFAULT_FIELDS: ExternalFormField[] = [
  { name: 'title', label: 'Title', type: 'text', required: true },
  { name: 'start', label: 'Start', type: 'datetime-local', required: true },
  { name: 'end', label: 'End', type: 'datetime-local', required: true },
  { name: 'allDay', label: 'All day', type: 'checkbox', required: false },
  { name: 'category', label: 'Category', type: 'text', required: false },
  { name: 'resource', label: 'Resource', type: 'text', required: false },
  { name: 'description', label: 'Description', type: 'textarea', required: false },
];

function normalizeFields(fields: ExternalFormField[]): ExternalFormField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('CalendarExternalForm requires at least one field.');
  }

  const names = new Set();
  return fields.map((field) => {
    if (!field?.name || typeof field.name !== 'string') {
      throw new Error('Each field requires a string `name`.');
    }

    if (names.has(field.name)) {
      throw new Error(`Duplicate field name: ${field.name}`);
    }
    names.add(field.name);

    const type = field.type ?? 'text';
    if (!SUPPORTED_FIELD_TYPES.has(type)) {
      throw new Error(`Unsupported field type: ${type}`);
    }

    return {
      ...field,
      type,
      label: field.label ?? field.name,
      required: Boolean(field.required),
      options: field.options ?? [],
    };
  });
}

function ensureAdapter(adapter: unknown): ExternalFormAdapter {
  if (!adapter || typeof (adapter as { submitEvent?: unknown }).submitEvent !== 'function') {
    throw new Error('CalendarExternalForm adapter must define submitEvent(payload, context).');
  }
  return adapter as ExternalFormAdapter;
}

function defaultValidate(values: ExternalFormValues, fields: ExternalFormField[]): Record<string, string> {
  const errors: Record<string, string> = {};
  fields.forEach((field) => {
    if (!field.required) return;
    if (field.type === 'checkbox') return;
    const value = values[field.name];
    if (value === '' || value === null || value === undefined) {
      errors[field.name] = `${field.label ?? field.name} is required.`;
    }
  });

  const toDate = (value: ExternalFormValues[string]): Date | null => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string' || typeof value === 'number') {
      if (value === '') return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  const start = toDate(values.start);
  const end = toDate(values.end);
  if (start && end && start > end) {
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
}: {
  adapter: unknown;
  fields?: ExternalFormField[];
  initialValues?: ExternalFormValues;
  validate?: (values: ExternalFormValues, fields: ExternalFormField[]) => Record<string, string>;
  transform?: (values: ExternalFormValues) => unknown;
  submitLabel?: string;
  onSuccess?: (result: unknown, values: ExternalFormValues) => void;
  onError?: (error: unknown, values: ExternalFormValues) => void;
}) {
  // Validate eagerly in the component body (before hooks) so errors throw
  // synchronously from render() and are catchable by tests / error boundaries.
  const safeAdapter = ensureAdapter(adapter);
  const normalizedFields = normalizeFields(fields);

  const mergedInitialValues = useMemo(() => {
    const fromFields = normalizeFields(fields).reduce<ExternalFormValues>((acc, field) => {
      acc[field.name] = field.type === 'checkbox' ? false : '';
      return acc;
    }, {});
    return { ...fromFields, ...initialValues };
  }, [fields, initialValues]);

  const [values, setValues] = useState(mergedInitialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toInputValue = (value: string | number | boolean | Date | null | undefined): string => {
    if (typeof value === 'boolean' || value == null) return '';
    return String(value);
  };

  function setValue(name: string, value: string | boolean) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setSubmitError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validate(values, normalizedFields);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload = transform(values);
      const result = await safeAdapter.submitEvent(payload, { values, fields: normalizedFields });
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
        {normalizedFields.map((field) => {
          const inputId = `external-${field.name}`;
          const value = values[field.name];
          return (
            <div className={styles.row} key={field.name}>
              <label className={styles.label} htmlFor={inputId}>{field.label}</label>
              {field.type === 'textarea' && (
                <textarea
                  id={inputId}
                  className={styles.textarea}
                  value={toInputValue(value)}
                  placeholder={field.placeholder}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  rows={3}
                />
              )}
              {field.type === 'select' && (
                <select
                  id={inputId}
                  className={styles.select}
                  value={toInputValue(value)}
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
                  value={toInputValue(value)}
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

export { DEFAULT_FIELDS, SUPPORTED_FIELD_TYPES as SUPPORTED_EXTERNAL_FORM_FIELD_TYPES };

// @vitest-environment happy-dom
/**
 * RequestForm — ticket #134-12.
 *
 * Schema-driven, owner-configurable event request form. The schema is
 * `config.requestForm` (edited via ConfigPanel → Request Form); the form
 * renders one input per entry, validates required values, and emits a
 * normalized `{ values }` object on submit.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';

import RequestForm from '../RequestForm';

const baseSchema = {
  fields: [
    { key: 'title',  label: 'Title',  type: 'text',     required: true },
    { key: 'start',  label: 'Starts', type: 'datetime', required: true },
    { key: 'notes',  label: 'Notes',  type: 'textarea' },
  ],
};

function renderForm(props: any = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  const result = render(
    <RequestForm
      schema={props.schema ?? baseSchema}
      initialValues={props.initialValues}
      onSubmit={onSubmit}
      onCancel={onCancel}
      title={props.title}
    />,
  );
  return { ...result, onSubmit, onCancel };
}

describe('RequestForm — rendering', () => {
  it('renders one input per schema field with the configured label', () => {
    renderForm();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Starts')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('shows empty-state when schema has no fields', () => {
    renderForm({ schema: { fields: [] } });
    expect(screen.getByText(/No request fields configured/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit request/ })).toBeDisabled();
  });

  it('renders all supported input types', () => {
    renderForm({
      schema: {
        fields: [
          { key: 'a', label: 'A', type: 'text' },
          { key: 'b', label: 'B', type: 'textarea' },
          { key: 'c', label: 'C', type: 'number' },
          { key: 'd', label: 'D', type: 'date' },
          { key: 'e', label: 'E', type: 'datetime' },
          { key: 'f', label: 'F', type: 'select', options: 'x, y, z' },
          { key: 'g', label: 'G', type: 'checkbox' },
        ],
      },
    });
    expect(screen.getByLabelText('A')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('B').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('C')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('D')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('E')).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('F').tagName).toBe('SELECT');
    expect(screen.getByLabelText('G')).toHaveAttribute('type', 'checkbox');
  });

  it('parses select options from the comma-separated string', () => {
    renderForm({
      schema: {
        fields: [{ key: 'pick', label: 'Pick', type: 'select', options: 'one, two, three' }],
      },
    });
    const select = screen.getByLabelText('Pick');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);
    // First option is the empty "Select…" placeholder.
    expect(options).toEqual(['', 'one', 'two', 'three']);
  });

  it('seeds values from initialValues', () => {
    renderForm({
      initialValues: { title: 'Hello', notes: 'World' },
    });
    expect(screen.getByLabelText('Title')).toHaveValue('Hello');
    expect(screen.getByLabelText('Notes')).toHaveValue('World');
  });
});

describe('RequestForm — validation + submit', () => {
  it('marks required fields with a trailing asterisk', () => {
    renderForm();
    expect(screen.getByText('Title *')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('blocks submit when a required text field is empty', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    // Error row appears for Title.
    const titleInput = screen.getByLabelText('Title');
    expect(titleInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('blocks submit when a required checkbox is unchecked', () => {
    const { onSubmit } = renderForm({
      schema: { fields: [{ key: 'agree', label: 'Agree', type: 'checkbox', required: true }] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Agree')).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits { values } when all required fields are filled', () => {
    const { onSubmit } = renderForm({
      initialValues: { title: 'Flight 202', start: '2026-04-20T09:00', notes: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      values: expect.objectContaining({
        title: 'Flight 202',
        start: '2026-04-20T09:00',
      }),
    });
  });

  it('reflects user edits in the submitted values', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-05-01T08:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit request/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0][0];
    expect(call.values.title).toBe('New');
    expect(call.values.start).toBe('2026-05-01T08:00');
  });

  it('Cancel fires onCancel', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('RequestForm — robustness', () => {
  it('handles schema=null by showing the empty state', () => {
    render(
      <RequestForm schema={null} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(/No request fields configured/)).toBeInTheDocument();
  });

  it('normalizes fields with missing keys', () => {
    renderForm({
      schema: {
        fields: [{ label: 'Unlabeled', type: 'text' }],
      },
    });
    // Falls back to auto-generated key-derived label when missing.
    expect(screen.getByLabelText('Unlabeled')).toBeInTheDocument();
  });

  it('rejects unknown field types by rendering as text', () => {
    renderForm({
      schema: {
        fields: [{ key: 'x', label: 'X', type: 'color' }],
      },
    });
    expect(screen.getByLabelText('X')).toHaveAttribute('type', 'text');
  });
});

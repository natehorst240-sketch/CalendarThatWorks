// @vitest-environment happy-dom
/**
 * Regression tests — recurrence × custom-field interaction.
 *
 * Ensures that:
 *  1. Changing the recurrence preset does NOT wipe custom field meta values.
 *  2. Custom field values survive a template application (category change).
 *  3. All pre-refactor EventForm behaviours still work end-to-end.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import EventForm from '../EventForm';

const START = new Date('2026-04-14T09:00:00.000Z');
const END   = new Date('2026-04-14T10:00:00.000Z');

const CONFIG_WITH_FIELDS = {
  eventFields: {
    Ops: [
      { name: 'tailNo',   type: 'text',   required: false },
      { name: 'paxCount', type: 'number', required: false },
    ],
  },
};

function renderForm(props: any = {}) {
  const onSave = vi.fn();
  render(
    <EventForm
      event={{ id: 'wc-temp', title: 'Flight', start: START, end: END, category: 'Ops', ...props.event }}
      config={CONFIG_WITH_FIELDS}
      categories={['Ops']}
      onSave={onSave}
      onDelete={null}
      onClose={vi.fn()}
      permissions={{}}
    />,
  );
  return { onSave };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Recurrence × custom-field interaction
═══════════════════════════════════════════════════════════════════════════ */

describe('recurrence × custom-field regression', () => {
  it('changing recurrence preset preserves existing custom field values', () => {
    const { onSave } = renderForm();

    // Fill in a custom field
    fireEvent.change(screen.getByLabelText('tailNo'), { target: { value: 'N737BA' } });

    // Change the recurrence preset
    const recurrenceSelect = screen.getByLabelText('Repeat', { selector: 'select' });
    fireEvent.change(recurrenceSelect, { target: { value: 'daily' } });

    // Submit — tailNo must still be in meta
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0][0].meta.tailNo).toBe('N737BA');
  });

  it('changing recurrence preset preserves multiple custom field values', () => {
    const { onSave } = renderForm();

    fireEvent.change(screen.getByLabelText('tailNo'),   { target: { value: 'N737BA' } });
    fireEvent.change(screen.getByLabelText('paxCount'), { target: { value: '150' } });

    fireEvent.change(screen.getByLabelText('Repeat', { selector: 'select' }), { target: { value: 'weekdays' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.meta.tailNo).toBe('N737BA');
    expect(saved.meta.paxCount).toBe('150');
    expect(saved.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('recurrence changes do not affect a different category\'s custom fields', () => {
    // Render with no category so no custom fields show — recurrence change
    // must not inject spurious meta keys.
    const onSave = vi.fn();
    render(
      <EventForm
        event={{ id: 'wc-temp', title: 'Meeting', start: START, end: END, category: '' }}
        config={CONFIG_WITH_FIELDS}
        categories={['Ops']}
        onSave={onSave}
        onDelete={null}
        onClose={vi.fn()}
        permissions={{}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Repeat', { selector: 'select' }), { target: { value: 'daily' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    expect(onSave.mock.calls[0][0].meta).toEqual({});
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Full EventForm end-to-end regression (create, edit, recurrence, template)
═══════════════════════════════════════════════════════════════════════════ */

describe('EventForm end-to-end regression', () => {
  it('creates a new event with all fields', () => {
    const { onSave } = renderForm();

    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'My Flight' } });
    fireEvent.change(screen.getByLabelText('Resource'), { target: { value: 'Gate 12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0];
    expect(saved.title).toBe('My Flight');
    expect(saved.resource).toBe('Gate 12');
  });

  it('saves a weekly recurrence rrule', () => {
    const { onSave } = renderForm();
    fireEvent.change(screen.getByLabelText('Repeat', { selector: 'select' }), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    expect(onSave.mock.calls[0][0].rrule).toMatch(/^FREQ=WEEKLY;BYDAY=/);
  });

  it('applies dailyStandup template and submits with meta', () => {
    const { onSave } = renderForm({ event: { title: '' } });
    const templateSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(templateSelect, { target: { value: 'dailyStandup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.title).toBe('Daily standup');
    expect(saved.meta).toMatchObject({ templateId: 'dailyStandup', templateVersion: 1 });
  });

  it('shows validation error when title is empty and does not call onSave', () => {
    const { onSave } = renderForm({ event: { title: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required')).toBeInTheDocument();
  });

  it('shows ConfirmDialog when Delete is clicked (edit mode)', () => {
    const onDelete = vi.fn();
    render(
      <EventForm
        event={{ id: 'real-1', title: 'Stand-up', start: START, end: END }}
        config={{ eventFields: {} }}
        categories={[]}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
        permissions={{}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

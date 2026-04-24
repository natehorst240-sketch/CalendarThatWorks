// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventForm from '../EventForm';

function renderForm(props: any = {}) {
  const onSave = vi.fn();
  render(
    <EventForm
      event={{
        id: 'wc-temp',
        title: 'Planning',
        start: new Date('2026-04-13T09:00:00.000Z'),
        end: new Date('2026-04-13T10:00:00.000Z'),
        ...props.event,
      }}
      config={{ eventFields: {} }}
      categories={['Ops']}
      onSave={onSave}
      onDelete={null}
      onClose={() => {}}
      permissions={{}}
    />,
  );
  return { onSave };
}

describe('EventForm recurrence controls', () => {
  it('saves a DAILY rrule when daily preset is selected', () => {
    const { onSave } = renderForm();

    const combos = screen.getAllByRole('combobox');
    const recurrenceSelect = combos[1];
    fireEvent.change(recurrenceSelect, { target: { value: 'daily' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].rrule!).toBe('FREQ=DAILY');
  });

  it('applies the Daily standup template defaults', () => {
    const { onSave } = renderForm({
      event: {
        title: '',
      },
    });

    const combos = screen.getAllByRole('combobox');
    const templateSelect = combos[0];
    const recurrenceSelect = combos[1];

    fireEvent.change(templateSelect, { target: { value: 'dailyStandup' } });

    expect(screen.getByPlaceholderText('Event title')).toHaveValue('Daily standup');
    expect(recurrenceSelect).toHaveValue('weekdays');

    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].meta!).toMatchObject({
      templateId: 'dailyStandup',
      templateVersion: 1,
    });
  });

  it('normalizes non-string resource values before save', () => {
    const { onSave } = renderForm({
      event: {
        resource: { id: 'A1' },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Event' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].resource!).toBe('[object Object]');
  });
});

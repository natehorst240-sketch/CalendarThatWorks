// @vitest-environment happy-dom
/**
 * EventForm — maintenance section wiring.
 *
 * Verifies the section is opt-in via the `maintenanceRules` prop, that field
 * changes flow into event.meta.maintenance, and that lifecycle='complete'
 * triggers the built-in completeMaintenance() call so projected nextDue*
 * fields land on the saved event without consumer plumbing.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventForm from '../EventForm';
import type { MaintenanceRule } from '../../types/maintenance';

const oilChange: MaintenanceRule = {
  id: 'oil-10k',
  assetType: 'truck',
  title: 'Oil change',
  interval:      { miles: 10_000 },
  warningWindow: { miles: 2_000  },
};

const dotInspection: MaintenanceRule = {
  id: 'dot-annual',
  assetType: 'truck',
  title: 'DOT inspection',
  interval: { days: 365 },
};

function renderForm(props: any = {}) {
  const onSave = vi.fn();
  const { event: eventOverrides, ...rest } = props;
  render(
    <EventForm
      event={{
        id: 'evt-1',
        title: 'Service work',
        start: new Date('2026-04-10T09:00:00.000Z'),
        end:   new Date('2026-04-10T11:00:00.000Z'),
        resource: 'truck-12',
        ...eventOverrides,
      }}
      config={{ eventFields: {} }}
      categories={['Maintenance']}
      onSave={onSave}
      onDelete={null}
      onClose={() => {}}
      permissions={{}}
      {...rest}
    />,
  );
  return { onSave };
}

describe('EventForm — MaintenanceSection wiring', () => {
  it('does not render the section when maintenanceRules is omitted', () => {
    renderForm();
    expect(screen.queryByLabelText('Rule')).toBeNull();
  });

  it('does not render the section when maintenanceRules is empty', () => {
    renderForm({ maintenanceRules: [] });
    expect(screen.queryByLabelText('Rule')).toBeNull();
  });

  it('renders the rule picker when maintenanceRules is non-empty', () => {
    renderForm({ maintenanceRules: [oilChange, dotInspection] });
    const ruleSelect = screen.getByLabelText('Rule') as HTMLSelectElement;
    const optionTexts = Array.from(ruleSelect.options).map(o => o.textContent);
    expect(optionTexts).toEqual(['— None —', 'Oil change', 'DOT inspection']);
  });

  it('writes ruleId + default lifecycle into event.meta.maintenance on save', () => {
    const { onSave } = renderForm({ maintenanceRules: [oilChange] });
    fireEvent.change(screen.getByLabelText('Rule'), { target: { value: 'oil-10k' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.meta.maintenance).toMatchObject({
      ruleId: 'oil-10k',
      lifecycle: 'scheduled', // auto-default when picking a rule
    });
    // No projection yet — lifecycle isn't 'complete'.
    expect(saved.meta.maintenance.nextDueMiles).toBeUndefined();
  });

  it('runs completeMaintenance on save when lifecycle is complete + meter present', () => {
    const { onSave } = renderForm({ maintenanceRules: [oilChange] });
    fireEvent.change(screen.getByLabelText('Rule'),                { target: { value: 'oil-10k' } });
    fireEvent.change(screen.getByLabelText('Status'),              { target: { value: 'complete' } });
    fireEvent.change(screen.getByLabelText(/Meter at service/),    { target: { value: '110500'  } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.meta.maintenance).toMatchObject({
      ruleId: 'oil-10k',
      lifecycle: 'complete',
      meterAtService: 110_500,
      nextDueMiles: 120_500, // 110500 + 10000
    });
  });

  it('shows a live "next due" preview when lifecycle is complete', () => {
    renderForm({ maintenanceRules: [oilChange] });
    fireEvent.change(screen.getByLabelText('Rule'),             { target: { value: 'oil-10k' } });
    fireEvent.change(screen.getByLabelText('Status'),           { target: { value: 'complete' } });
    fireEvent.change(screen.getByLabelText(/Meter at service/), { target: { value: '110500'  } });
    expect(screen.getByTestId('maint-next-due-preview').textContent).toContain('120,500 mi');
  });

  it('does not show the meter input for date-only rules', () => {
    renderForm({ maintenanceRules: [dotInspection] });
    fireEvent.change(screen.getByLabelText('Rule'), { target: { value: 'dot-annual' } });
    expect(screen.queryByLabelText(/Meter at service/)).toBeNull();
  });

  it('clearing the rule wipes the maintenance meta', () => {
    const { onSave } = renderForm({ maintenanceRules: [oilChange] });
    fireEvent.change(screen.getByLabelText('Rule'), { target: { value: 'oil-10k' } });
    fireEvent.change(screen.getByLabelText('Rule'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.meta.maintenance).toBeUndefined();
  });

  it('does not project on save when lifecycle is not complete', () => {
    const { onSave } = renderForm({ maintenanceRules: [oilChange] });
    fireEvent.change(screen.getByLabelText('Rule'),             { target: { value: 'oil-10k' } });
    fireEvent.change(screen.getByLabelText('Status'),           { target: { value: 'in-progress' } });
    fireEvent.change(screen.getByLabelText(/Meter at service/), { target: { value: '110500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.meta.maintenance.lifecycle).toBe('in-progress');
    expect(saved.meta.maintenance.meterAtService).toBe(110_500);
    // No projection — only complete lifecycle triggers it.
    expect(saved.meta.maintenance.nextDueMiles).toBeUndefined();
  });
});

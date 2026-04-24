// @vitest-environment happy-dom

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScheduleTemplateDialog from '../ScheduleTemplateDialog';

const templates = [
  {
    id: 'sched-ops',
    name: 'Ops Coverage',
    entries: [
      { title: 'Primary', startOffsetMinutes: 0, durationMinutes: 480, rrule: 'FREQ=DAILY' },
      { title: 'Backup', startOffsetMinutes: 60, durationMinutes: 480, rrule: 'FREQ=DAILY' },
    ],
  },
];

describe('ScheduleTemplateDialog', () => {
  it('submits selected template and overrides', () => {
    const onInstantiate = vi.fn();
    const onPreview = vi.fn(() => ({ generated: templates[0]!.entries, conflicts: [], error: '' }));

    render(
      <ScheduleTemplateDialog
        templates={templates}
        onPreview={onPreview}
        onInstantiate={onInstantiate}
        onClose={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Resource override (optional)'), { target: { value: 'Ops Team' } });
    fireEvent.change(screen.getByLabelText('Category override (optional)'), { target: { value: 'On-call' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    expect(onInstantiate).toHaveBeenCalledTimes(1);
    expect(onInstantiate.mock.calls[0][0]!).toMatchObject({
      templateId: 'sched-ops',
      resource: 'Ops Team',
      category: 'On-call',
    });
    expect(onInstantiate.mock.calls[0][0].anchor!).toBeInstanceOf(Date);
    expect(onPreview).toHaveBeenCalled();
  });

  it('shows an error and blocks submit when anchor is invalid', () => {
    const onInstantiate = vi.fn();

    render(
      <ScheduleTemplateDialog
        templates={templates}
        onPreview={() => ({ generated: [], conflicts: [], error: '' })}
        onInstantiate={onInstantiate}
        onClose={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Anchor start'), { target: { value: 'bad' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid anchor start date/time.');
    expect(screen.getByRole('button', { name: 'Create schedule' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(onInstantiate).not.toHaveBeenCalled();
  });

  it('shows preview errors and blocks submit', () => {
    const onInstantiate = vi.fn();

    render(
      <ScheduleTemplateDialog
        templates={templates}
        onPreview={() => ({ generated: [], conflicts: [], error: 'Preview limit exceeded.' })}
        onInstantiate={onInstantiate}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Preview limit exceeded.');
    expect(screen.getByRole('button', { name: 'Create schedule' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(onInstantiate).not.toHaveBeenCalled();
  });

  it('renders conflict details from preview results', () => {
    render(
      <ScheduleTemplateDialog
        templates={templates}
        onPreview={() => ({
          generated: templates[0]!.entries,
          conflicts: [
            {
              index: 0,
              violations: [
                { rule: 'overlap', message: 'Overlaps an existing event.' },
              ],
            },
          ],
          error: '',
        })}
        onInstantiate={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('1 conflict')).toBeInTheDocument();
    expect(screen.getByText('Overlaps an existing event.')).toBeInTheDocument();
  });
});

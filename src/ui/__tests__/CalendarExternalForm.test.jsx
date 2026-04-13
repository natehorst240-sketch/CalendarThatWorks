// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarExternalForm from '../CalendarExternalForm.jsx';

describe('CalendarExternalForm', () => {
  it('submits through adapter and calls onSuccess', async () => {
    const submitEvent = vi.fn(async () => ({ id: 'graph-1' }));
    const onSuccess = vi.fn();

    render(<CalendarExternalForm adapter={{ submitEvent }} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Planning' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-04-13T09:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-04-13T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit event' }));

    await waitFor(() => expect(submitEvent).toHaveBeenCalledTimes(1));
    expect(onSuccess).toHaveBeenCalledWith({ id: 'graph-1' }, expect.any(Object));
  });

  it('shows validation errors for required fields and date ordering', async () => {
    const submitEvent = vi.fn();

    render(<CalendarExternalForm adapter={{ submitEvent }} />);
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-04-13T10:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-04-13T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit event' }));

    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(await screen.findByText('End must be after start.')).toBeInTheDocument();
    expect(submitEvent).not.toHaveBeenCalled();
  });

  it('surfaces adapter/network failures', async () => {
    const submitEvent = vi.fn(async () => {
      throw new Error('network failed');
    });

    render(<CalendarExternalForm adapter={{ submitEvent }} />);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Planning' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '2026-04-13T09:00' } });
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-04-13T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit event' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('network failed');
  });

  it('throws when adapter does not implement submitEvent', () => {
    expect(() => render(<CalendarExternalForm adapter={{}} />)).toThrow(
      'CalendarExternalForm adapter must define submitEvent(payload, context).',
    );
  });

  it('throws on duplicate field names', () => {
    expect(() => render(
      <CalendarExternalForm
        adapter={{ submitEvent: vi.fn(async () => ({})) }}
        fields={[
          { name: 'title', label: 'Title' },
          { name: 'title', label: 'Title duplicate' },
        ]}
      />, 
    )).toThrow('Duplicate field name: title');
  });
});

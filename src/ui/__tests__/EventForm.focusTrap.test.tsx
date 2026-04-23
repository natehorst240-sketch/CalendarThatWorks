// @vitest-environment happy-dom
/**
 * EventForm — focus trap smoke test.
 *
 * Verifies that Tab / Shift+Tab never moves focus outside the dialog
 * when cycling through all visible interactive fields.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EventForm from '../EventForm';

function requireElement<T>(value: T | null | undefined, message: string): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

function renderForm(extra: any = {}) {
  render(
    <EventForm
      event={{
        id: 'wc-temp',
        title: 'Stand-up',
        start: new Date('2026-04-14T09:00:00.000Z'),
        end: new Date('2026-04-14T10:00:00.000Z'),
        ...extra.event,
      }}
      config={{ eventFields: {} }}
      categories={['Ops', 'On-call']}
      onSave={vi.fn()}
      onDelete={extra.onDelete ?? null}
      onClose={vi.fn()}
      permissions={{}}
    />,
  );
  return requireElement(
    document.querySelector('[role="dialog"]'),
    'Expected EventForm dialog',
  );
}

function tabForward() {
  fireEvent.keyDown(
    requireElement(document.activeElement, 'Expected active element for Tab'),
    { key: 'Tab', shiftKey: false },
  );
}

function tabBackward() {
  fireEvent.keyDown(
    requireElement(document.activeElement, 'Expected active element for Shift+Tab'),
    { key: 'Tab', shiftKey: true },
  );
}

describe('EventForm focus trap', () => {
  it('focus stays inside the dialog when tabbing forward through all fields', () => {
    const dialog = renderForm();

    // Tab through more fields than the form has — every active element must
    // remain a descendant of the dialog.
    for (let i = 0; i < 20; i++) {
      tabForward();
      expect(
        dialog.contains(
          requireElement(document.activeElement, 'Expected active element after Tab'),
        ),
      ).toBe(true);
    }
  });

  it('focus stays inside the dialog when tabbing backward through all fields', () => {
    const dialog = renderForm();

    for (let i = 0; i < 20; i++) {
      tabBackward();
      expect(
        dialog.contains(
          requireElement(document.activeElement, 'Expected active element after Shift+Tab'),
        ),
      ).toBe(true);
    }
  });

  it('initial auto-focus lands inside the dialog', () => {
    const dialog = renderForm();
    expect(
      dialog.contains(
        requireElement(document.activeElement, 'Expected active element inside dialog'),
      ),
    ).toBe(true);
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <EventForm
        event={{ id: 'wc-temp', title: 'Test', start: new Date(), end: new Date() }}
        config={{ eventFields: {} }}
        categories={[]}
        onSave={vi.fn()}
        onDelete={null}
        onClose={onClose}
        permissions={{}}
      />,
    );
    fireEvent.keyDown(
      requireElement(document.activeElement, 'Expected active element for Escape'),
      { key: 'Escape' },
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Delete button opens an in-app ConfirmDialog (alertdialog role)', () => {
    const onDelete = vi.fn();
    const dialog = renderForm({
      event: { id: 'real-event-1' },
      onDelete,
    });

    const deleteBtn = requireElement(
      [...dialog.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Delete',
      ),
      'Expected Delete button',
    );

    fireEvent.click(deleteBtn);

    // ConfirmDialog must appear with alertdialog role
    const confirmDialog = requireElement(
      document.querySelector('[role="alertdialog"]'),
      'Expected confirm dialog',
    );
    expect(confirmDialog).toBeInTheDocument();
    // onDelete not yet called — user must click the confirm button
    expect(onDelete).not.toHaveBeenCalled();
  });
});

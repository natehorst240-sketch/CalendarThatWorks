// @vitest-environment happy-dom
/**
 * useKeyboardShortcuts — verifies that single-key bindings reach the
 * calendar API and that the guard rails (typing target, modifiers, open
 * modal) keep the shortcuts from firing in inappropriate contexts.
 */
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

type CalendarApi = {
  setView: (view: string) => void;
  navigate: (direction: number) => void;
  goToToday: () => void;
  openHelp: () => void;
};

function Harness({ api }: { api: CalendarApi }) {
  useKeyboardShortcuts(api);
  return (
    <div>
      <input data-testid="search" placeholder="search" />
      <button data-testid="btn">btn</button>
    </div>
  );
}

function makeApi(overrides: Partial<CalendarApi> = {}): CalendarApi {
  return {
    setView: vi.fn(),
    navigate: vi.fn(),
    goToToday: vi.fn(),
    openHelp: vi.fn(),
    ...overrides,
  };
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('digits 1..6 switch views', () => {
    const api = makeApi();
    render(<Harness api={api} />);
    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: '2' });
    fireEvent.keyDown(document, { key: '3' });
    fireEvent.keyDown(document, { key: '4' });
    fireEvent.keyDown(document, { key: '5' });
    fireEvent.keyDown(document, { key: '6' });
    expect(api.setView).toHaveBeenNthCalledWith(1, 'month');
    expect(api.setView).toHaveBeenNthCalledWith(2, 'week');
    expect(api.setView).toHaveBeenNthCalledWith(3, 'day');
    expect(api.setView).toHaveBeenNthCalledWith(4, 'agenda');
    expect(api.setView).toHaveBeenNthCalledWith(5, 'schedule');
    expect(api.setView).toHaveBeenNthCalledWith(6, 'assets');
  });

  it('j and ArrowRight advance one period; k and ArrowLeft go back', () => {
    const api = makeApi();
    render(<Harness api={api} />);
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'k' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(api.navigate).toHaveBeenNthCalledWith(1, 1);
    expect(api.navigate).toHaveBeenNthCalledWith(2, 1);
    expect(api.navigate).toHaveBeenNthCalledWith(3, -1);
    expect(api.navigate).toHaveBeenNthCalledWith(4, -1);
  });

  it('t jumps to today', () => {
    const api = makeApi();
    render(<Harness api={api} />);
    fireEvent.keyDown(document, { key: 't' });
    expect(api.goToToday).toHaveBeenCalledOnce();
  });

  it('? opens the help overlay', () => {
    const api = makeApi();
    render(<Harness api={api} />);
    fireEvent.keyDown(document, { key: '?' });
    expect(api.openHelp).toHaveBeenCalledOnce();
  });

  it('does not fire when focus is in a text input', () => {
    const api = makeApi();
    const { getByTestId } = render(<Harness api={api} />);
    const input = getByTestId('search');
    input.focus();
    fireEvent.keyDown(input, { key: '1' });
    fireEvent.keyDown(input, { key: 't' });
    fireEvent.keyDown(input, { key: 'j' });
    expect(api.setView).not.toHaveBeenCalled();
    expect(api.goToToday).not.toHaveBeenCalled();
    expect(api.navigate).not.toHaveBeenCalled();
  });

  it('does not fire when modifier keys are held', () => {
    const api = makeApi();
    render(<Harness api={api} />);
    fireEvent.keyDown(document, { key: '1', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'j', metaKey: true });
    fireEvent.keyDown(document, { key: 't', altKey: true });
    expect(api.setView).not.toHaveBeenCalled();
    expect(api.navigate).not.toHaveBeenCalled();
    expect(api.goToToday).not.toHaveBeenCalled();
  });

  it('does not fire while an aria-modal dialog is open', () => {
    const api = makeApi();
    render(<Harness api={api} />);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: 'j' });
    expect(api.setView).not.toHaveBeenCalled();
    expect(api.navigate).not.toHaveBeenCalled();
  });

  it('detaches the listener on unmount', () => {
    const api = makeApi();
    const { unmount } = render(<Harness api={api} />);
    unmount();
    fireEvent.keyDown(document, { key: '1' });
    expect(api.setView).not.toHaveBeenCalled();
  });
});

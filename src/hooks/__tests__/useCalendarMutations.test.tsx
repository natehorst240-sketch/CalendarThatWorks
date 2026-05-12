// @vitest-environment happy-dom
/**
 * useCalendarMutations — `handleUndoRedoShortcut` (the global Cmd/Ctrl+Z handler).
 *
 * Regression for the "global shortcut hijacking" bug: Ctrl+Z must not steal
 * text-undo from an input/textarea/contentEditable, must not fire while a modal
 * is up, and must not act on an already-handled event.
 *
 * Also covers issue #603 focus-scoping: only acts when the focused element is
 * inside the calendar root (or nothing is focused).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleUndoRedoShortcut } from '../useCalendarMutations';

afterEach(() => {
  document.body.innerHTML = '';
});

function keyEvent(
  key: string,
  opts: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: EventTarget; preDefault?: boolean } = {},
): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    cancelable: true,
    bubbles: true,
  });
  Object.defineProperty(e, 'target', { value: opts.target ?? document.body, configurable: true });
  if (opts.preDefault) e.preventDefault();
  return e;
}

function makeUndoManager(undoResult = true, redoResult = true) {
  return { undo: vi.fn(() => undoResult), redo: vi.fn(() => redoResult) };
}

describe('handleUndoRedoShortcut', () => {
  it('Cmd/Ctrl+Z triggers undo and announces it', () => {
    const um = makeUndoManager();
    const announce = vi.fn();
    const e = keyEvent('z', { ctrlKey: true });
    const pd = vi.spyOn(e, 'preventDefault');
    handleUndoRedoShortcut(e, um, announce);
    expect(um.undo).toHaveBeenCalledTimes(1);
    expect(um.redo).not.toHaveBeenCalled();
    expect(pd).toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Undo.');
  });

  it('Cmd/Ctrl+Shift+Z and Ctrl+Y trigger redo', () => {
    const a = makeUndoManager();
    handleUndoRedoShortcut(keyEvent('z', { metaKey: true, shiftKey: true }), a);
    expect(a.redo).toHaveBeenCalledTimes(1);

    const b = makeUndoManager();
    handleUndoRedoShortcut(keyEvent('y', { ctrlKey: true }), b);
    expect(b.redo).toHaveBeenCalledTimes(1);
  });

  it('does not announce when there was nothing to undo/redo', () => {
    const um = makeUndoManager(false, false);
    const announce = vi.fn();
    handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um, announce);
    expect(um.undo).toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it('ignores plain "z" with no Cmd/Ctrl', () => {
    const um = makeUndoManager();
    handleUndoRedoShortcut(keyEvent('z'), um);
    expect(um.undo).not.toHaveBeenCalled();
  });

  it('ignores an already-handled event', () => {
    const um = makeUndoManager();
    handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true, preDefault: true }), um);
    expect(um.undo).not.toHaveBeenCalled();
  });

  it.each([
    ['input', () => document.createElement('input')],
    ['textarea', () => document.createElement('textarea')],
    ['contentEditable div', () => { const d = document.createElement('div'); d.contentEditable = 'true'; return d; }],
  ])('does not hijack text-undo when focus is in a %s', (_label, makeEl) => {
    const um = makeUndoManager();
    const el = makeEl();
    const e = keyEvent('z', { ctrlKey: true, target: el });
    const pd = vi.spyOn(e, 'preventDefault');
    handleUndoRedoShortcut(e, um);
    expect(um.undo).not.toHaveBeenCalled();
    expect(pd).not.toHaveBeenCalled();
  });

  it('does not act while an aria-modal dialog is open', () => {
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    const um = makeUndoManager();
    handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um);
    expect(um.undo).not.toHaveBeenCalled();
  });

  describe('root-scoping (issue #603)', () => {
    it('fires when activeElement is inside the calendar root', () => {
      const root = document.createElement('div');
      const inner = document.createElement('button');
      root.appendChild(inner);
      document.body.appendChild(root);
      inner.focus();

      const um = makeUndoManager();
      handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um, undefined, root);
      expect(um.undo).toHaveBeenCalledTimes(1);
    });

    it('fires when activeElement is document.body (nothing focused)', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      (document.activeElement as HTMLElement | null)?.blur?.();

      const um = makeUndoManager();
      handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um, undefined, root);
      expect(um.undo).toHaveBeenCalledTimes(1);
    });

    it('skips when activeElement is outside the calendar root', () => {
      const root = document.createElement('div');
      const outside = document.createElement('button');
      document.body.appendChild(root);
      document.body.appendChild(outside);
      outside.focus();

      const um = makeUndoManager();
      handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um, undefined, root);
      expect(um.undo).not.toHaveBeenCalled();
    });

    it('fires without a root arg (backward compat — no host constraint)', () => {
      const um = makeUndoManager();
      handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um);
      expect(um.undo).toHaveBeenCalledTimes(1);
    });

    it('fires when root is null (calendar not yet mounted)', () => {
      const um = makeUndoManager();
      handleUndoRedoShortcut(keyEvent('z', { ctrlKey: true }), um, undefined, null);
      expect(um.undo).toHaveBeenCalledTimes(1);
    });
  });
});

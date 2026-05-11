/**
 * Tests for the in-repo drag-and-drop hook + controller (the vendored
 * replacement for `fluid-dnd`).
 *
 * The pointer-driven flow is exercised against happy-dom: layout is faked
 * (zero rects) so element midpoints all collapse to 0 and the placeholder lands
 * at the end of whichever container it is over — deterministic enough to assert
 * the model bookkeeping, the cross-container hand-off, the `onDragEnd` payload,
 * the cancel/restore path, and clean-up. Animation/geometry polish is a browser
 * concern and not asserted here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { useDragAndDrop } from '../useDragAndDrop';
import { __resetDragControllerForTests } from '../dragController';
import type { DndConfig, DragEndEventData, DragStartEventData } from '../types';

afterEach(() => {
  cleanup();
  __resetDragControllerForTests();
});

function stubRect(el: Element, top: number, bottom: number): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 0, right: 100, top, bottom, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }),
  });
}

function pointer(type: 'pointerDown' | 'pointerMove' | 'pointerUp', target: Element | Document, x: number, y: number): void {
  fireEvent[type](target, { clientX: x, clientY: y, button: 0, isPrimary: true, pointerId: 1, bubbles: true, cancelable: true });
}

function texts(container: HTMLElement): string[] {
  return Array.from(container.children)
    .filter((c) => c.hasAttribute('data-index'))
    .map((c) => c.textContent ?? '');
}

const ghost = () => document.querySelector('[data-dnd-ghost]');
const placeholder = () => document.querySelector('[data-dnd-placeholder]');

// ─── Hook state surface ──────────────────────────────────────────────────────

function StateHarness({ initial }: { initial: string[] }) {
  const [ref, items, setItems, insertAt, removeAt] = useDragAndDrop<string, HTMLDivElement>(initial);
  return (
    <div>
      <div ref={ref}>
        {items.map((v, i) => (
          <span key={v} data-index={i}>{v}</span>
        ))}
      </div>
      <button onClick={() => setItems(['x', 'y'])}>set</button>
      <button onClick={() => insertAt(1, 'NEW')}>insert</button>
      <button onClick={() => removeAt(0)}>remove</button>
      <output data-testid="out">{items.join(',')}</output>
    </div>
  );
}

describe('useDragAndDrop — state surface', () => {
  it('exposes setItems / insertAt / removeAt and does not auto-resync from the items prop', () => {
    const { rerender } = render(<StateHarness initial={['a', 'b', 'c']} />);
    const out = () => screen.getByTestId('out').textContent;
    expect(out()).toBe('a,b,c');

    fireEvent.click(screen.getByText('insert'));
    expect(out()).toBe('a,NEW,b,c');

    fireEvent.click(screen.getByText('remove'));
    expect(out()).toBe('NEW,b,c');

    fireEvent.click(screen.getByText('set'));
    expect(out()).toBe('x,y');

    rerender(<StateHarness initial={['p', 'q', 'r']} />);
    expect(out()).toBe('x,y'); // a prop change must not clobber the local order
  });
});

// ─── Pointer-driven drag ─────────────────────────────────────────────────────

type CellSpies = {
  onDragStart: ReturnType<typeof vi.fn>;
  onDragEnd: ReturnType<typeof vi.fn>;
};
const makeSpies = (): CellSpies => ({ onDragStart: vi.fn(), onDragEnd: vi.fn() });

function Cell({
  testid,
  group,
  initial,
  spies,
  draggable = true,
}: {
  testid: string;
  group: string;
  initial: string[];
  spies?: CellSpies;
  draggable?: boolean;
}) {
  const config: DndConfig<string> = {
    droppableGroup: group,
    animationDuration: 0,
    draggingClass: 'is-dragging',
    droppableClass: 'is-over',
    isDraggable: () => draggable,
  };
  if (spies) {
    config.onDragStart = spies.onDragStart as (d: DragStartEventData<string>) => void;
    config.onDragEnd = spies.onDragEnd as (d: DragEndEventData<string>) => void;
  }
  const [ref, items] = useDragAndDrop<string, HTMLDivElement>(initial, config);
  return (
    <div ref={ref} data-testid={testid}>
      {items.map((v, i) => (
        <span key={v} data-index={i}>{v}</span>
      ))}
    </div>
  );
}

describe('drag controller — pointer flow', () => {
  it('moves an item from one container to another in the same group', async () => {
    const a = makeSpies();
    const b = makeSpies();
    render(
      <>
        <Cell testid="cellA" group="g" initial={['a1', 'a2']} spies={a} />
        <Cell testid="cellB" group="g" initial={['b1']} spies={b} />
      </>,
    );
    const cellA = screen.getByTestId('cellA');
    const cellB = screen.getByTestId('cellB');
    stubRect(cellA, 0, 50);
    stubRect(cellB, 100, 150);

    pointer('pointerDown', cellA.querySelector('[data-index="0"]')!, 10, 10);
    expect(a.onDragStart).not.toHaveBeenCalled(); // not until the drag threshold is crossed
    pointer('pointerMove', document, 30, 30); // Δ ≈ 28px — starts the drag
    expect(a.onDragStart).toHaveBeenCalledTimes(1);
    expect(texts(cellA)).toEqual(['a2']); // dragged item pulled out of the source list
    expect(ghost()).not.toBeNull();

    pointer('pointerMove', document, 30, 120); // now over cell B
    pointer('pointerUp', document, 30, 120);

    expect(texts(cellA)).toEqual(['a2']);
    expect(texts(cellB)).toEqual(['b1', 'a1']);
    expect(b.onDragEnd).toHaveBeenCalledTimes(1);
    expect(b.onDragEnd).toHaveBeenCalledWith({ index: 1, value: 'a1' });
    expect(a.onDragEnd).toHaveBeenCalledTimes(1); // source is also told the drag ended
    expect(a.onDragEnd).toHaveBeenCalledWith({ index: 0, value: 'a1' });
    expect(b.onDragStart).not.toHaveBeenCalled();
    expect(placeholder()).toBeNull();

    await waitFor(() => expect(ghost()).toBeNull()); // clone removed once the (0ms) settle timer fires
    expect(cellA.classList.contains('is-over')).toBe(false);
    expect(cellB.classList.contains('is-over')).toBe(false);
  });

  it('preserves duplicate values in source and destination on a cross-container drop', async () => {
    // Regression: previously the controller removed the dragged item with
    // `filter(v => v !== value)` in both startDrag and finishDrag, which
    // deleted *every* equal item before reinserting one — silent data loss
    // whenever a list legitimately contained duplicates. A local harness with
    // compound keys is used so duplicate `value`s don't collide on `key`.
    function DupCell({ testid, initial, spies }: { testid: string; initial: string[]; spies: CellSpies }) {
      const [ref, items] = useDragAndDrop<string, HTMLDivElement>(initial, {
        droppableGroup: 'dup',
        animationDuration: 0,
        isDraggable: () => true,
        onDragStart: spies.onDragStart as (d: DragStartEventData<string>) => void,
        onDragEnd:   spies.onDragEnd   as (d: DragEndEventData<string>)   => void,
      });
      return (
        <div ref={ref} data-testid={testid}>
          {items.map((v, i) => (
            <span key={`${v}-${i}`} data-index={i}>{v}</span>
          ))}
        </div>
      );
    }

    const a = makeSpies();
    const b = makeSpies();
    render(
      <>
        <DupCell testid="cellA" initial={['x', 'y', 'x']} spies={a} />
        <DupCell testid="cellB" initial={['x']}           spies={b} />
      </>,
    );
    const cellA = screen.getByTestId('cellA');
    const cellB = screen.getByTestId('cellB');
    stubRect(cellA, 0, 50);
    stubRect(cellB, 100, 150);

    // Drag the first 'x' (index 0) out of cellA into cellB.
    pointer('pointerDown', cellA.querySelectorAll('[data-index]')[0]!, 10, 10);
    pointer('pointerMove', document, 30, 30);  // start drag
    pointer('pointerMove', document, 30, 120); // hover over cellB
    pointer('pointerUp', document, 30, 120);

    // Source: the other 'x' must survive (was index 2 → now last).
    expect(texts(cellA)).toEqual(['y', 'x']);
    // Destination: the pre-existing 'x' must survive; dragged 'x' appended.
    expect(texts(cellB)).toEqual(['x', 'x']);

    // Callbacks report the exact origin index, not just the first occurrence.
    expect(a.onDragStart).toHaveBeenCalledWith(expect.objectContaining({ index: 0, value: 'x' }));
    expect(a.onDragEnd).toHaveBeenCalledWith({ index: 0, value: 'x' });
    expect(b.onDragEnd).toHaveBeenCalledWith({ index: 1, value: 'x' });

    await waitFor(() => expect(ghost()).toBeNull());
  });

  it('a press without crossing the threshold does not start a drag', () => {
    const a = makeSpies();
    render(<Cell testid="cellA" group="g" initial={['a1', 'a2']} spies={a} />);
    stubRect(screen.getByTestId('cellA'), 0, 50);

    pointer('pointerDown', screen.getByTestId('cellA').querySelector('[data-index="0"]')!, 10, 10);
    pointer('pointerMove', document, 12, 11); // Δ ≈ 2px — below threshold
    pointer('pointerUp', document, 12, 11);

    expect(a.onDragStart).not.toHaveBeenCalled();
    expect(a.onDragEnd).not.toHaveBeenCalled();
    expect(texts(screen.getByTestId('cellA'))).toEqual(['a1', 'a2']);
    expect(ghost()).toBeNull();
    expect(placeholder()).toBeNull();
  });

  it('Escape cancels an in-flight drag and restores the original order', () => {
    const a = makeSpies();
    const b = makeSpies();
    render(
      <>
        <Cell testid="cellA" group="g" initial={['a1', 'a2']} spies={a} />
        <Cell testid="cellB" group="g" initial={['b1']} spies={b} />
      </>,
    );
    const cellA = screen.getByTestId('cellA');
    const cellB = screen.getByTestId('cellB');
    stubRect(cellA, 0, 50);
    stubRect(cellB, 100, 150);

    pointer('pointerDown', cellA.querySelector('[data-index="0"]')!, 10, 10);
    pointer('pointerMove', document, 30, 120); // start drag + hop the placeholder into cell B
    expect(texts(cellA)).toEqual(['a2']);
    expect(ghost()).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(texts(cellA)).toEqual(['a1', 'a2']); // source order restored
    expect(texts(cellB)).toEqual(['b1']); // cell B never received the item in its model
    expect(a.onDragEnd).toHaveBeenCalledWith({ index: 0, value: 'a1' }); // source told the drag ended
    expect(b.onDragEnd).not.toHaveBeenCalled();
    expect(ghost()).toBeNull();
    expect(placeholder()).toBeNull();
  });

  it('does not start a drag when the item is not draggable', () => {
    const a = makeSpies();
    render(<Cell testid="locked" group="locked" initial={['x1', 'x2']} spies={a} draggable={false} />);
    stubRect(screen.getByTestId('locked'), 0, 50);

    pointer('pointerDown', screen.getByTestId('locked').querySelector('[data-index="0"]')!, 10, 10);
    pointer('pointerMove', document, 40, 40);
    pointer('pointerUp', document, 40, 40);

    expect(a.onDragStart).not.toHaveBeenCalled();
    expect(texts(screen.getByTestId('locked'))).toEqual(['x1', 'x2']);
    expect(ghost()).toBeNull();
  });

  it('unmounting the source container mid-drag aborts cleanly', async () => {
    function Switcher() {
      const [show, setShow] = useState(true);
      return (
        <>
          <button onClick={() => setShow(false)}>hide</button>
          {show ? <Cell testid="cellA" group="g2" initial={['a1', 'a2']} /> : null}
          <Cell testid="cellB" group="g2" initial={['b1']} />
        </>
      );
    }
    render(<Switcher />);
    stubRect(screen.getByTestId('cellA'), 0, 50);
    stubRect(screen.getByTestId('cellB'), 100, 150);

    pointer('pointerDown', screen.getByTestId('cellA').querySelector('[data-index="0"]')!, 10, 10);
    pointer('pointerMove', document, 30, 30); // drag started; placeholder is in cell A

    fireEvent.click(screen.getByText('hide')); // cell A unmounts → the drag must abort

    // A fresh press still works — no stuck `active`/`pending`/listener state.
    pointer('pointerDown', screen.getByTestId('cellB').querySelector('[data-index="0"]')!, 10, 110);
    pointer('pointerMove', document, 30, 130);
    pointer('pointerUp', document, 30, 130);
    await waitFor(() => expect(ghost()).toBeNull());
  });
});

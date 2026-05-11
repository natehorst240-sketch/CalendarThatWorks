/**
 * Framework-agnostic drag controller behind `useDragAndDrop`.
 *
 * A single pointer-driven, FLIP-animated sortable engine shared by every
 * registered container. Containers that declare the same `group` accept each
 * other's items — that is how month-view event pills move between day cells.
 *
 * Design (chosen so React and the controller never fight over the same DOM):
 *  - On drag start the dragged item is removed from the host model (`setItems`)
 *    so React forgets its node, a clone of that node is appended to `<body>` to
 *    follow the cursor, and a plain (non-React) placeholder div takes the item's
 *    old slot. From then on the placeholder is moved around with raw DOM calls —
 *    React never re-renders those lists during the drag, so the controller can
 *    freely FLIP the siblings as the placeholder shifts.
 *  - On drop the item is re-inserted into the destination model at the
 *    placeholder's slot (one `setItems`), the placeholder is removed and the
 *    clone settles onto it.
 *  - One `pointerdown` listener on `document` (added lazily on first register);
 *    `pointermove`/`pointerup`/`pointercancel`/`keydown` on `window` only while a
 *    press is in progress. No per-element observers.
 *  - All geometry/animation degrades to a no-op under happy-dom (zero rects),
 *    so rendering tests are unaffected.
 *
 * This intentionally re-implements only the slice of `fluid-dnd` the calendar
 * used; it is not a general drag-and-drop library.
 */
import type { DragContainerHandle } from './types';

interface Entry {
  readonly el: HTMLElement;
  readonly handle: DragContainerHandle;
}

interface Pending {
  readonly entry: Entry;
  readonly containerEl: HTMLElement;
  readonly itemEl: HTMLElement;
  readonly index: number;
  readonly value: unknown;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
}

interface ActiveDrag {
  readonly pointerId: number;
  readonly group: string | undefined;
  readonly value: unknown;
  /** Clone of the dragged node, parented to `<body>`, that follows the cursor. */
  readonly ghostEl: HTMLElement;
  /** Plain div that holds the item's slot in whichever list it is currently over. */
  readonly placeholderEl: HTMLElement;
  readonly ghostOffsetX: number;
  readonly ghostOffsetY: number;
  readonly sourceEl: HTMLElement;
  readonly sourceEntry: Entry;
  /** Index of the dragged item in the source model at drag start. Used so
   *  source-side `onDragEnd` and cancel paths report the exact origin slot
   *  even when the model contains duplicates equal to `value`. */
  readonly sourceIndex: number;
  /** Snapshot of the source model (still containing `value`) for cancel/restore. */
  readonly sourceModel: unknown[];
  /** Container the placeholder currently lives in. */
  currentEl: HTMLElement;
  currentEntry: Entry;
  /** Index of the placeholder among the current container's React children. */
  currentIndex: number;
  droppableMarkedEl: HTMLElement | null;
  flipGen: number;
  /** React children currently carrying a FLIP transition (force-cleared on drop). */
  readonly flippedEls: Set<HTMLElement>;
}

const DRAG_THRESHOLD_PX = 5;
const GHOST_Z_INDEX = 2147483646;
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

const containers = new Map<HTMLElement, Entry>();
let docListening = false;
let pending: Pending | null = null;
let active: ActiveDrag | null = null;

// ─── Registration ────────────────────────────────────────────────────────────

export function registerDragContainer(el: HTMLElement, handle: DragContainerHandle): () => void {
  containers.set(el, { el, handle });
  ensureDocListening();
  return () => {
    containers.delete(el);
    // The cleanup runs inside React's commit (an unmounting container), so the
    // model restore must be deferred — a synchronous setState on a sibling that
    // is still mounted would be illegal.
    if (active && (active.sourceEl === el || active.currentEl === el)) cancelDrag(false);
    else if (pending && pending.containerEl === el) clearPending();
  };
}

function ensureDocListening(): void {
  if (docListening || typeof document === 'undefined') return;
  document.addEventListener('pointerdown', onPointerDown, true);
  docListening = true;
}

// ─── Pointer lifecycle ───────────────────────────────────────────────────────

function onPointerDown(e: PointerEvent): void {
  if (active || pending) return;
  if (!e.isPrimary || e.button !== 0) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const itemEl = target.closest('[data-index]');
  if (!(itemEl instanceof HTMLElement)) return;

  let containerEl: HTMLElement | null = itemEl.parentElement;
  while (containerEl && !containers.has(containerEl)) containerEl = containerEl.parentElement;
  if (!containerEl) return;
  const entry = containers.get(containerEl);
  if (!entry || !entry.handle.isDraggable(itemEl)) return;

  const index = resolveItemIndex(containerEl, itemEl);
  const model = entry.handle.getItems();
  if (index < 0 || index >= model.length) return;

  pending = {
    entry,
    containerEl,
    itemEl,
    index,
    value: model[index],
    startX: e.clientX,
    startY: e.clientY,
    pointerId: e.pointerId,
  };
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);
  window.addEventListener('keydown', onKeyDown, true);
}

function onPointerMove(e: PointerEvent): void {
  if (active) {
    if (e.pointerId !== active.pointerId) return;
    e.preventDefault();
    updateDrag(e);
    return;
  }
  if (!pending || e.pointerId !== pending.pointerId) return;
  if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < DRAG_THRESHOLD_PX) return;
  if (!startDrag()) {
    clearPending();
    return;
  }
  e.preventDefault();
  updateDrag(e);
}

function onPointerUp(e: PointerEvent): void {
  if (active) {
    if (e.pointerId !== active.pointerId) return;
    e.preventDefault();
    finishDrag();
  } else if (pending && e.pointerId === pending.pointerId) {
    clearPending();
  }
}

function onPointerCancel(e: PointerEvent): void {
  if (active && e.pointerId === active.pointerId) cancelDrag(true);
  else if (pending && e.pointerId === pending.pointerId) clearPending();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (active) {
    e.preventDefault();
    cancelDrag(true);
  } else if (pending) {
    clearPending();
  }
}

function teardownWindowListeners(): void {
  window.removeEventListener('pointermove', onPointerMove, true);
  window.removeEventListener('pointerup', onPointerUp, true);
  window.removeEventListener('pointercancel', onPointerCancel, true);
  window.removeEventListener('keydown', onKeyDown, true);
}

function clearPending(): void {
  pending = null;
  teardownWindowListeners();
}

// ─── Drag start ──────────────────────────────────────────────────────────────

function startDrag(): boolean {
  if (!pending) return false;
  const { entry, containerEl, itemEl, index, value, startX, startY } = pending;
  if (!itemEl.isConnected || !containerEl.isConnected) return false;

  const rect = itemEl.getBoundingClientRect();
  const margin = typeof getComputedStyle === 'function' ? getComputedStyle(itemEl).margin : '';

  const ghostEl = itemEl.cloneNode(true) as HTMLElement;
  ghostEl.removeAttribute('data-index');
  ghostEl.setAttribute('data-dnd-ghost', '');
  ghostEl.setAttribute('aria-hidden', 'true');
  Object.assign(ghostEl.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    margin: '0',
    boxSizing: 'border-box',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    pointerEvents: 'none',
    zIndex: String(GHOST_Z_INDEX),
    willChange: 'transform',
    transition: 'none',
    transform: `translate(${rect.left}px, ${rect.top}px)`,
  });
  if (entry.handle.draggingClass) ghostEl.classList.add(entry.handle.draggingClass);

  const placeholderEl = document.createElement('div');
  placeholderEl.setAttribute('data-dnd-placeholder', '');
  placeholderEl.setAttribute('aria-hidden', 'true');
  Object.assign(placeholderEl.style, {
    boxSizing: 'border-box',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: margin || '0',
    flexShrink: '0',
    pointerEvents: 'none',
  });

  // Hide the original now; React removes it for good when `setItems` commits.
  itemEl.style.display = 'none';
  containerEl.insertBefore(placeholderEl, itemEl);
  document.body.appendChild(ghostEl);

  let droppableMarkedEl: HTMLElement | null = null;
  if (entry.handle.droppableClass) {
    containerEl.classList.add(entry.handle.droppableClass);
    droppableMarkedEl = containerEl;
  }
  if (typeof document !== 'undefined') document.body.style.cursor = 'grabbing';

  const sourceModel = entry.handle.getItems().slice();
  active = {
    pointerId: pending.pointerId,
    group: entry.handle.group,
    value,
    ghostEl,
    placeholderEl,
    ghostOffsetX: startX - rect.left,
    ghostOffsetY: startY - rect.top,
    sourceEl: containerEl,
    sourceEntry: entry,
    sourceIndex: index,
    sourceModel,
    currentEl: containerEl,
    currentEntry: entry,
    currentIndex: index,
    droppableMarkedEl,
    flipGen: 0,
    flippedEls: new Set(),
  };
  pending = null;

  // Remove the dragged item by index, NOT by value-equality. The source model
  // can legitimately contain values that `===` the dragged value (duplicate
  // ids/primitives, or the same object reference twice); a value-filter would
  // silently delete the extras.
  const sourceNext = sourceModel.slice();
  sourceNext.splice(index, 1);
  entry.handle.setItems(sourceNext);
  entry.handle.onDragStart({ index, element: itemEl, value });
  return true;
}

// ─── Drag move ───────────────────────────────────────────────────────────────

function updateDrag(e: PointerEvent): void {
  if (!active) return;
  active.ghostEl.style.transform = `translate(${e.clientX - active.ghostOffsetX}px, ${e.clientY - active.ghostOffsetY}px)`;

  const targetEl = pickContainer(e.clientX, e.clientY, active.group, active.sourceEl);
  if (!targetEl) return; // outside every eligible container — keep the current slot
  const targetEntry = containers.get(targetEl);
  if (!targetEntry) return;

  const insertionIndex = computeInsertionIndex(targetEl, active.placeholderEl, e.clientY);
  if (targetEl === active.currentEl && insertionIndex === active.currentIndex) return;

  movePlaceholder(targetEl, targetEntry, insertionIndex);
}

function pickContainer(
  x: number,
  y: number,
  group: string | undefined,
  sourceEl: HTMLElement,
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = Infinity;
  for (const { el, handle } of containers.values()) {
    const eligible = group != null ? handle.group === group : el === sourceEl;
    if (!eligible || !el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const area = r.width * r.height;
    if (area < bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

/** A container's draggable React children (`[data-index]`), in DOM order. */
function reactChildren(containerEl: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const child of Array.from(containerEl.children)) {
    if (child instanceof HTMLElement && child.hasAttribute('data-index')) out.push(child);
  }
  return out;
}

/** Slot among `containerEl`'s React children where the placeholder should sit. */
function computeInsertionIndex(containerEl: HTMLElement, placeholderEl: HTMLElement, y: number): number {
  const children = reactChildren(containerEl);
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child === placeholderEl) continue;
    const r = child.getBoundingClientRect();
    if (y < r.top + r.height / 2) return i;
  }
  return children.length;
}

function movePlaceholder(targetEl: HTMLElement, targetEntry: Entry, insertionIndex: number): void {
  if (!active) return;
  const drag = active;

  // Snapshot every React child that might shift in the old and new containers.
  const affected = new Set<HTMLElement>([...reactChildren(drag.currentEl), ...reactChildren(targetEl)]);
  const before = new Map<HTMLElement, DOMRect>();
  for (const el of affected) before.set(el, el.getBoundingClientRect());

  const refNode = reactChildren(targetEl)[insertionIndex] ?? null;
  targetEl.insertBefore(drag.placeholderEl, refNode);

  if (targetEl !== drag.currentEl) {
    if (drag.droppableMarkedEl && drag.droppableMarkedEl !== targetEl) {
      const cls = drag.sourceEntry.handle.droppableClass;
      if (cls) drag.droppableMarkedEl.classList.remove(cls);
      drag.droppableMarkedEl = null;
    }
    const targetCls = targetEntry.handle.droppableClass;
    if (targetCls) {
      targetEl.classList.add(targetCls);
      drag.droppableMarkedEl = targetEl;
    }
  }
  drag.currentEl = targetEl;
  drag.currentEntry = targetEntry;
  drag.currentIndex = insertionIndex;

  playFlip(before);
  drag.currentEntry.handle.onDragOver({
    index: insertionIndex,
    targetIndex: insertionIndex,
    element: drag.placeholderEl,
    value: drag.value,
    droppable: targetEl,
  });
}

function playFlip(before: Map<HTMLElement, DOMRect>): void {
  if (!active) return;
  const drag = active;
  const gen = ++drag.flipGen;
  const dur = drag.currentEntry.handle.animationDuration;
  const moved: HTMLElement[] = [];

  for (const [el, b] of before) {
    if (!el.isConnected) continue;
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    drag.flippedEls.add(el);
    moved.push(el);
  }
  if (moved.length === 0) return;

  // Force a layout flush so the start transform is committed before the
  // transition is attached.
  void document.body.offsetHeight;

  for (const el of moved) {
    el.style.transition = `transform ${dur}ms ${FLIP_EASING}`;
    el.style.transform = '';
  }
  window.setTimeout(() => {
    if (!active || active.flipGen !== gen) return;
    for (const el of moved) el.style.transition = '';
  }, dur + 60);
}

// ─── Drop / cancel ───────────────────────────────────────────────────────────

function clearDragVisuals(drag: ActiveDrag): void {
  if (drag.droppableMarkedEl) {
    const cls = drag.sourceEntry.handle.droppableClass;
    if (cls) drag.droppableMarkedEl.classList.remove(cls);
  }
  for (const el of drag.flippedEls) {
    el.style.transition = '';
    el.style.transform = '';
  }
  if (typeof document !== 'undefined') document.body.style.cursor = '';
}

function suppressNextClick(): void {
  const handler = (ev: Event) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener('click', handler, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', handler, true), 300);
}

function settleGhost(drag: ActiveDrag, toLeft: number, toTop: number): void {
  const dur = drag.currentEntry.handle.animationDuration;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    drag.ghostEl.remove();
  };
  drag.ghostEl.style.transition = `transform ${dur}ms ${FLIP_EASING}`;
  drag.ghostEl.style.transform = `translate(${toLeft}px, ${toTop}px)`;
  drag.ghostEl.addEventListener('transitionend', settle, { once: true });
  window.setTimeout(settle, dur + 80);
}

function finishDrag(): void {
  if (!active) return;
  const drag = active;
  active = null;
  pending = null;
  teardownWindowListeners();
  suppressNextClick();

  const dropIndex = drag.currentIndex;
  const destRect = drag.placeholderEl.getBoundingClientRect();
  const droppedInSource = drag.currentEl === drag.sourceEl;
  const destConnected = drag.currentEntry.el.isConnected;

  if (destConnected) {
    // No value-filter here: at drag start the item was already spliced out of
    // the source model (and a different destination container was never touched
    // during the drag), so `value` is not present in either case. A filter
    // would silently delete any legitimate duplicates that share `===` with
    // the dragged value.
    const model = drag.currentEntry.handle.getItems().slice();
    model.splice(Math.min(dropIndex, model.length), 0, drag.value);
    drag.currentEntry.handle.setItems(model);
  }
  drag.placeholderEl.remove();
  settleGhost(drag, destRect.left, destRect.top);
  clearDragVisuals(drag);

  // Tell the source the drag is over (so it stops suppressing prop re-syncs).
  // For a same-cell drop this *is* the destination callback.
  if (!droppedInSource && drag.sourceEntry.el.isConnected) {
    drag.sourceEntry.handle.onDragEnd({ index: drag.sourceIndex, value: drag.value });
  }
  if (destConnected) drag.currentEntry.handle.onDragEnd({ index: dropIndex, value: drag.value });
}

function cancelDrag(immediate: boolean): void {
  if (!active) {
    clearPending();
    return;
  }
  const drag = active;
  active = null;
  pending = null;
  teardownWindowListeners();

  drag.ghostEl.remove();
  drag.placeholderEl.remove();
  clearDragVisuals(drag);

  // Restore the source order (the snapshot still contains `value`) and let the
  // source know the drag ended. Any container the value visually drifted into
  // never received it in its model — only the placeholder did — so one source
  // update is enough.
  const restore = () => {
    if (!drag.sourceEntry.el.isConnected) return;
    drag.sourceEntry.handle.setItems(drag.sourceModel.slice());
    drag.sourceEntry.handle.onDragEnd({ index: drag.sourceIndex, value: drag.value });
  };
  if (immediate) restore();
  else window.setTimeout(restore, 0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveItemIndex(containerEl: HTMLElement, itemEl: HTMLElement): number {
  const attr = itemEl.getAttribute('data-index');
  if (attr != null && attr !== '') {
    const parsed = Number(attr);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return reactChildren(containerEl).indexOf(itemEl);
}

/** Test seam — abandons any in-flight press/drag and forgets every container. */
export function __resetDragControllerForTests(): void {
  if (active) {
    active.ghostEl.remove();
    active.placeholderEl.remove();
    clearDragVisuals(active);
    active = null;
  }
  clearPending();
  containers.clear();
}

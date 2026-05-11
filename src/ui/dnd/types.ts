/**
 * Public shapes for the in-repo drag-and-drop hook.
 *
 * This is a small, purpose-built replacement for the slice of `fluid-dnd`
 * the calendar relied on — vertical sortable lists, cross-container groups,
 * dragging/droppable class toggles, and drag start/end callbacks. The option
 * and event names mirror `fluid-dnd` so call sites read the same; it is not a
 * general-purpose drag library.
 */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

/** Sort axis. Only `'vertical'` is implemented; the field exists for parity. */
export type Direction = 'vertical' | 'horizontal';

export interface DragStartEventData<T> {
  index: number;
  element: Element;
  value: T;
}

export interface DragEndEventData<T> {
  index: number;
  value: T;
}

export interface DragOverEventData<T> {
  index: number;
  targetIndex: number;
  element: Element;
  value: T;
  droppable: Element;
}

export interface DndConfig<T> {
  /** Reordering axis. Only `'vertical'` is implemented. */
  direction?: Direction;
  /** Class toggled on the cursor-following clone while a drag is in progress. */
  draggingClass?: string;
  /** Class toggled on a container while the dragged element is hovering over it. */
  droppableClass?: string;
  /** Returns whether a given list element may be dragged. Defaults to always-draggable. */
  isDraggable?: (element: HTMLElement) => boolean;
  onDragStart?: (data: DragStartEventData<T>) => void;
  onDragEnd?: (data: DragEndEventData<T>) => void;
  onDragOver?: (data: DragOverEventData<T>) => void;
  /** Containers sharing a group name accept each other's items. */
  droppableGroup?: string;
  /** Reorder / drop-settle animation duration in ms. Defaults to 200. */
  animationDuration?: number;
}

export type UseDragAndDropResult<T, E extends HTMLElement> = readonly [
  MutableRefObject<E | null>,
  T[],
  Dispatch<SetStateAction<T[]>>,
  (index: number, value: T) => void,
  (index: number) => void,
];

/**
 * Container registration passed to the controller. Item types are erased to
 * `unknown` at this boundary so the controller stays generic-free; the hook
 * re-applies `T` on the way out.
 */
export interface DragContainerHandle {
  /** Group name; containers with the same group are mutually droppable. `undefined` ⇒ self only. */
  readonly group: string | undefined;
  /** Current ordered items — must reflect the most recent `setItems`. */
  readonly getItems: () => unknown[];
  /** Replace the ordered items (drives the host framework's re-render). */
  readonly setItems: (items: unknown[]) => void;
  readonly isDraggable: (element: HTMLElement) => boolean;
  readonly draggingClass: string | undefined;
  readonly droppableClass: string | undefined;
  readonly animationDuration: number;
  readonly onDragStart: (data: { index: number; element: Element; value: unknown }) => void;
  readonly onDragEnd: (data: { index: number; value: unknown }) => void;
  readonly onDragOver: (data: {
    index: number;
    targetIndex: number;
    element: Element;
    value: unknown;
    droppable: Element;
  }) => void;
}

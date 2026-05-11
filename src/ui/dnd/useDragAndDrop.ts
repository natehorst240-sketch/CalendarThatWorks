/**
 * `useDragAndDrop` — React binding for the in-repo {@link registerDragContainer}
 * controller. Drop-in replacement for the `fluid-dnd/react` hook the calendar
 * used: pass the ordered items + a {@link DndConfig}, attach the returned ref
 * to the list container, and render the items with a `data-index` attribute on
 * each row.
 *
 * Note: like the original, this hook does not re-sync from `items` on its own —
 * callers that need that (e.g. after an external update) call the returned
 * setter from an effect. This keeps prop changes from fighting an in-progress
 * drag.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { registerDragContainer } from './dragController';
import type {
  DndConfig,
  DragEndEventData,
  DragOverEventData,
  DragStartEventData,
  UseDragAndDropResult,
} from './types';

export function useDragAndDrop<T, E extends HTMLElement = HTMLElement>(
  items: T[],
  config?: DndConfig<T>,
): UseDragAndDropResult<T, E> {
  const [localItems, setLocalItemsState] = useState<T[]>(items);

  // Mirror of the current items, kept in sync synchronously so the controller's
  // back-to-back `getItems()`/`setItems()` during a single pointer move always
  // sees the latest value (React state updates are async).
  const itemsRef = useRef<T[]>(localItems);
  itemsRef.current = localItems;

  const setItems = useCallback<Dispatch<SetStateAction<T[]>>>((update) => {
    setLocalItemsState((prev) => {
      const next = typeof update === 'function' ? (update as (p: T[]) => T[])(prev) : update;
      itemsRef.current = next;
      return next;
    });
  }, []);

  const containerRef = useRef<E | null>(null);

  const configRef = useRef<DndConfig<T> | undefined>(config);
  configRef.current = config;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return registerDragContainer(el, {
      group: configRef.current?.droppableGroup,
      getItems: () => itemsRef.current,
      setItems: (arr) => setItems(arr as T[]),
      isDraggable: (element) => configRef.current?.isDraggable?.(element) ?? true,
      draggingClass: configRef.current?.draggingClass,
      droppableClass: configRef.current?.droppableClass,
      animationDuration: configRef.current?.animationDuration ?? 200,
      onDragStart: (d) => configRef.current?.onDragStart?.(d as DragStartEventData<T>),
      onDragEnd: (d) => configRef.current?.onDragEnd?.(d as DragEndEventData<T>),
      onDragOver: (d) => configRef.current?.onDragOver?.(d as DragOverEventData<T>),
    });
  }, [setItems]);

  const insertAt = useCallback(
    (index: number, value: T) => {
      setItems((prev) => {
        const next = prev.slice();
        next.splice(index, 0, value);
        return next;
      });
    },
    [setItems],
  );

  const removeAt = useCallback(
    (index: number) => {
      setItems((prev) => prev.filter((_, i) => i !== index));
    },
    [setItems],
  );

  return [containerRef, localItems, setItems, insertAt, removeAt] as const;
}

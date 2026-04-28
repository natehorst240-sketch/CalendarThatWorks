/**
 * useSavedFlash — transient "Saved" affordance for live-apply surfaces.
 *
 * `flash` flips to true for `durationMs` after each `trigger()` call.
 * Re-triggering inside the window restarts the timer, so a burst of writes
 * shows as one continuous toast rather than flickering.
 *
 * Pattern model (paired with `<SavedFlash />`): any panel where edits
 * commit immediately — ConfigPanel today, the live-y filter/group panels
 * tomorrow — should call `trigger()` from each write site and render the
 * affordance in a stable header slot so showing/hiding never reflows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 1500;

export type UseSavedFlashResult = {
  /** True while the "Saved" affordance should render. */
  flash: boolean;
  /** Call after a successful write to (re)start the affordance window. */
  trigger: () => void;
};

export function useSavedFlash(durationMs: number = DEFAULT_DURATION_MS): UseSavedFlashResult {
  const [flash, setFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    setFlash(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFlash(false);
      timerRef.current = null;
    }, durationMs);
  }, [durationMs]);

  // Clean up the trailing timer on unmount so we don't set state on an
  // unmounted component if the host closes mid-flash.
  useEffect(() => () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { flash, trigger };
}

/**
 * withFlash — wrap a write callback so each successful invocation also fires
 * `trigger`. Preserves the original signature.
 *
 * Promise-aware: when the wrapped callback returns a thenable (e.g. an
 * async API call), the flash is deferred until the promise resolves
 * successfully. Rejections stay quiet so failed writes don't show a
 * green "Saved" pill. The caller's own `.then` / `.catch` on the
 * returned promise is unaffected — we tap into the chain without
 * swallowing the value.
 *
 * Use inside `useMemo` (see `useFlashWrapped` below) so the wrapper is
 * stable across renders and downstream `useCallback`s don't churn.
 */
export function withFlash<F extends (...args: never[]) => unknown>(
  fn: F,
  trigger: () => void,
): F {
  return ((...args: Parameters<F>): ReturnType<F> => {
    const result = fn(...args);
    const isThenable =
      result != null &&
      typeof (result as { then?: unknown }).then === 'function';
    if (isThenable) {
      // Tap into the chain; the errback handles only the new chained
      // promise (so we don't trigger an unhandled-rejection warning here)
      // and does not swallow rejections from the original promise that
      // the caller still receives.
      (result as PromiseLike<unknown>).then(
        () => trigger(),
        () => undefined,
      );
    } else {
      trigger();
    }
    return result as ReturnType<F>;
  }) as F;
}

/**
 * useFlashWrapped — `withFlash` that returns a stable wrapper, with a
 * pass-through for `undefined` so optional host callbacks stay optional.
 */
export function useFlashWrapped<F extends (...args: never[]) => unknown>(
  fn: F | undefined,
  trigger: () => void,
): F | undefined {
  return useMemo(
    () => (fn === undefined ? undefined : withFlash(fn, trigger)),
    [fn, trigger],
  );
}

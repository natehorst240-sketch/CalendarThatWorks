/**
 * useTabScopedEvents — single, memoized source of the per-tab event feed.
 *
 * Both FilterBar (for deriving dropdown options) and applyFilters consume the
 * same array returned by this hook, so they cannot drift. The predicate for
 * each view lives in src/core/viewScope.ts.
 */
import { useMemo } from 'react';
import { getViewScope, type ViewId, type ViewScopeContext } from '../core/viewScope';

export function useTabScopedEvents<E = any>(
  view: string,
  events: E[],
  ctx: ViewScopeContext,
): E[] {
  return useMemo(() => {
    const scope = getViewScope(view);
    return events.filter(ev => scope.includes(ev, ctx));
  }, [
    view,
    events,
    ctx.employees,
    ctx.assets,
    ctx.bases,
    ctx.selectedBaseIds,
  ]);
}

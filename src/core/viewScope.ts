/**
 * viewScope — single source of truth for "which events belong in which tab".
 *
 * Every calendar view (month, week, day, agenda, schedule, base, assets)
 * declares its predicate here. `useTabScopedEvents` and the FilterBar option
 * builders both consult this registry so they can never drift apart. Adding a
 * new view = one entry in VIEW_SCOPES.
 */
import { isScheduleWorkflowEvent, SCHEDULE_TAB_CATEGORY_SEEDS } from './scheduleModel';

export type ViewId = 'month' | 'week' | 'day' | 'agenda' | 'schedule' | 'base' | 'assets';

export type ViewScopeContext = {
  employees: Array<{ id: string; base?: string | null }>;
  assets:    Array<{ id: string; meta?: { base?: string | null } | null }>;
  bases:     Array<{ id: string; name: string }>;
  selectedBaseIds: string[];
};

/**
 * Saved-view fields owned by an individual view. Each view declares which of
 * these it contributes to a saved view; `captureSavedViewFields` picks only
 * those keys off a context object at save time.
 */
export type SavedViewCaptureField =
  | 'groupBy'
  | 'sort'
  | 'showAllGroups'
  | 'zoomLevel'
  | 'collapsedGroups'
  | 'selectedBaseIds';

export type SavedViewCaptureCtx = Partial<Record<SavedViewCaptureField, unknown>>;

export interface ViewScope {
  id: ViewId;
  includes(ev: any, ctx: ViewScopeContext): boolean;
  seedCategoryOptions?: readonly string[];
  /**
   * Which saved-view fields this view owns. `captureSavedViewFields` reads
   * these keys off a live-state ctx at save time. Omit (or leave empty) for
   * views that only contribute `filters` + `view`. Sanitization still runs
   * inside `useSavedViews`, so this is a pass-through whitelist, not a
   * validator.
   */
  persistedFields?: readonly SavedViewCaptureField[];
}

function includesForBase(ev: any, ctx: ViewScopeContext): boolean {
  const baseIds = ctx.selectedBaseIds.length > 0
    ? ctx.selectedBaseIds.map(String)
    : ctx.bases.map(b => String(b.id));
  if (baseIds.length === 0) return false;

  const metaBase = ev?.meta?.base;
  if (metaBase != null && baseIds.includes(String(metaBase))) return true;

  if (ev?.resource == null) return false;
  const resource = String(ev.resource);

  for (const id of baseIds) {
    const emp = ctx.employees.find(e => String(e.base ?? '') === id && String(e.id) === resource);
    if (emp) return true;
    const asset = ctx.assets.find(a => String(a?.meta?.base ?? '') === id && String(a.id) === resource);
    if (asset) return true;
  }
  return false;
}

export const VIEW_SCOPES: Record<ViewId, ViewScope> = Object.freeze({
  month:    { id: 'month',    includes: ev => !isScheduleWorkflowEvent(ev) },
  week:     { id: 'week',     includes: ev => !isScheduleWorkflowEvent(ev) },
  day:      { id: 'day',      includes: ev => !isScheduleWorkflowEvent(ev) },
  agenda: {
    id: 'agenda',
    includes: ev => !isScheduleWorkflowEvent(ev),
    persistedFields: ['groupBy', 'sort', 'showAllGroups'],
  },
  schedule: {
    id: 'schedule',
    includes: ev => isScheduleWorkflowEvent(ev),
    seedCategoryOptions: SCHEDULE_TAB_CATEGORY_SEEDS,
    persistedFields: ['groupBy', 'sort'],
  },
  base: {
    id: 'base',
    includes: includesForBase,
    persistedFields: ['selectedBaseIds'],
  },
  assets: {
    id: 'assets',
    includes: () => true,
    persistedFields: ['groupBy', 'sort', 'zoomLevel', 'collapsedGroups'],
  },
});

export function getViewScope(view: string): ViewScope {
  return (VIEW_SCOPES as any)[view] ?? VIEW_SCOPES.month;
}

/**
 * Pick only the saved-view fields the active view owns out of `ctx`.
 * Undefined entries are dropped; everything else is passed through verbatim
 * for `useSavedViews` to sanitize. Safe to spread into `saveView`/`resaveView`.
 */
export function captureSavedViewFields(
  view: string,
  ctx: SavedViewCaptureCtx,
): SavedViewCaptureCtx {
  const fields = getViewScope(view).persistedFields;
  if (!fields || fields.length === 0) return {};
  const out: SavedViewCaptureCtx = {};
  for (const f of fields) {
    if (ctx[f] !== undefined) out[f] = ctx[f];
  }
  return out;
}

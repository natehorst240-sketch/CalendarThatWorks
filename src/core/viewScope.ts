/**
 * viewScope — single source of truth for "which events belong in which tab".
 *
 * Every calendar view (month, week, day, agenda, schedule, base, assets)
 * declares its predicate here. `useTabScopedEvents` and the FilterBar option
 * builders both consult this registry so they can never drift apart. Adding a
 * new view = one entry in VIEW_SCOPES.
 */
import { isScheduleWorkflowEvent } from './scheduleModel';

export type ViewId = 'month' | 'week' | 'day' | 'agenda' | 'schedule' | 'base' | 'assets';

export type ViewScopeContext = {
  employees: Array<{ id: string; base?: string | null }>;
  assets:    Array<{ id: string; meta?: { base?: string | null } | null }>;
  bases:     Array<{ id: string; name: string }>;
  selectedBaseIds: string[];
};

export interface ViewScope {
  id: ViewId;
  includes(ev: any, ctx: ViewScopeContext): boolean;
  seedCategoryOptions?: readonly string[];
}

function includesForBase(ev: any, ctx: ViewScopeContext): boolean {
  const baseIds = ctx.selectedBaseIds.length > 0
    ? ctx.selectedBaseIds
    : ctx.bases.map(b => b.id);
  if (baseIds.length === 0) return false;

  const metaBase = ev?.meta?.base;
  if (metaBase && baseIds.includes(metaBase)) return true;

  if (!ev?.resource) return false;

  for (const id of baseIds) {
    const emp = ctx.employees.find(e => e.base === id && e.id === ev.resource);
    if (emp) return true;
    const asset = ctx.assets.find(a => a?.meta?.base === id && a.id === ev.resource);
    if (asset) return true;
  }
  return false;
}

export const VIEW_SCOPES: Record<ViewId, ViewScope> = Object.freeze({
  month:    { id: 'month',    includes: ev => !isScheduleWorkflowEvent(ev) },
  week:     { id: 'week',     includes: ev => !isScheduleWorkflowEvent(ev) },
  day:      { id: 'day',      includes: ev => !isScheduleWorkflowEvent(ev) },
  agenda:   { id: 'agenda',   includes: ev => !isScheduleWorkflowEvent(ev) },
  schedule: {
    id: 'schedule',
    includes: ev => isScheduleWorkflowEvent(ev),
    seedCategoryOptions: ['base', 'on-call', 'shift', 'PTO', 'availability'],
  },
  base:     { id: 'base',     includes: includesForBase },
  assets:   { id: 'assets',   includes: () => true },
});

export function getViewScope(view: string): ViewScope {
  return (VIEW_SCOPES as any)[view] ?? VIEW_SCOPES.month;
}

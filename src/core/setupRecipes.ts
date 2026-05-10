import { startOfWeek, endOfWeek } from 'date-fns';
import type { SetupRecipeId } from '../ui/SetupLanding';
import type { GroupByInput } from '../hooks/useNormalizedConfig';

export function buildRecipeSavedView(
  id: SetupRecipeId,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): { name: string; filters: Record<string, unknown>; view: string | null; groupBy: GroupByInput | null } | null {
  const emptyFilters = {
    categories: new Set<string>(),
    resources:  new Set<string>(),
    sources:    new Set<string>(),
    search:     '',
    dateRange:  null as null | { start: string; end: string },
  };

  switch (id) {
    case 'everything':
      return { name: 'Show everything', filters: { ...emptyFilters }, view: null, groupBy: null };

    case 'by-person':
      return {
        name:    'Group by person',
        filters: { ...emptyFilters },
        view:    'schedule',
        groupBy: 'resource',
      };

    case 'by-type':
      return {
        name:    'Group by type',
        filters: { ...emptyFilters },
        view:    null,
        groupBy: 'category',
      };

    case 'on-call':
      return {
        name:    'On-call only',
        filters: { ...emptyFilters, categories: new Set(['on-call']) },
        view:    null,
        groupBy: null,
      };

    case 'this-week': {
      const now       = new Date();
      const weekStart = startOfWeek(now, { weekStartsOn });
      const weekEnd   = endOfWeek(now, { weekStartsOn });
      return {
        name: 'This week only',
        filters: {
          ...emptyFilters,
          dateRange: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
        },
        view:    'week',
        groupBy: null,
      };
    }

    default:
      return null;
  }
}

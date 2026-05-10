import { useState, useMemo, useCallback, useEffect } from 'react';
import type { CascadeConfig, CascadeTier } from '../ui/CascadePanel';

export interface UseCascadeFiltersParams {
  cascadeConfig: CascadeConfig | undefined;
  calFilters: Record<string, unknown>;
  replaceFilters: (filters: Record<string, unknown>) => void;
}

export interface UseCascadeFiltersReturn {
  cascadeSelections: Readonly<Record<string, readonly string[]>>;
  handleCascadeSelectionsChange: (next: Readonly<Record<string, readonly string[]>>) => void;
}

function collectTierKeys(tiers: ReadonlyArray<CascadeTier>, keys: string[]): void {
  for (const t of tiers) {
    const k = t.filterField;
    if (typeof k === 'string' && k.length > 0) keys.push(k);
  }
}

function collectTierMap(tiers: ReadonlyArray<CascadeTier>, map: Map<string, string>): void {
  for (const t of tiers) {
    const k = t.filterField;
    if (typeof k === 'string' && k.length > 0) map.set(k, t.id);
  }
}

export function useCascadeFilters({
  cascadeConfig,
  calFilters,
  replaceFilters,
}: UseCascadeFiltersParams): UseCascadeFiltersReturn {
  const [cascadeSelections, setCascadeSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});

  const cascadeFieldKeys = useMemo(() => {
    if (!cascadeConfig) return [] as string[];
    const keys: string[] = [];
    collectTierKeys(cascadeConfig.tiers, keys);
    if (cascadeConfig.moreOptions) collectTierKeys(cascadeConfig.moreOptions, keys);
    return keys;
  }, [cascadeConfig]);

  const cascadeTierByFieldKey = useMemo(() => {
    const map = new Map<string, string>();
    if (!cascadeConfig) return map;
    collectTierMap(cascadeConfig.tiers, map);
    if (cascadeConfig.moreOptions) collectTierMap(cascadeConfig.moreOptions, map);
    return map;
  }, [cascadeConfig]);

  const handleCascadeSelectionsChange = useCallback(
    (next: Readonly<Record<string, readonly string[]>>) => {
      setCascadeSelections(next);
      if (!cascadeConfig) return;

      const patch: Record<string, unknown> = {};
      const applyTiers = (tiers: ReadonlyArray<CascadeTier>) => {
        for (const t of tiers) {
          const k = t.filterField;
          if (typeof k !== 'string' || k.length === 0) continue;
          const sel = next[t.id];
          patch[k] = sel && sel.length > 0 ? new Set(sel) : new Set<string>();
        }
      };
      applyTiers(cascadeConfig.tiers);
      if (cascadeConfig.moreOptions) applyTiers(cascadeConfig.moreOptions);

      replaceFilters({ ...calFilters, ...patch });
    },
    [cascadeConfig, calFilters, replaceFilters],
  );

  // Keep cascade selections in sync when cal.filters changes from elsewhere
  useEffect(() => {
    if (!cascadeConfig) return;
    if (cascadeFieldKeys.length === 0) return;
    const next: Record<string, readonly string[]> = {};
    for (const fieldKey of cascadeFieldKeys) {
      const tierId = cascadeTierByFieldKey.get(fieldKey);
      if (!tierId) continue;
      const value = calFilters[fieldKey];
      let values: readonly string[] | null = null;
      if (value instanceof Set) {
        if (value.size > 0) {
          values = Array.from(value).filter((v): v is string => typeof v === 'string');
        }
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          values = value.filter((v): v is string => typeof v === 'string');
        }
      }
      if (values && values.length > 0) {
        next[tierId] = values;
      }
    }
    setCascadeSelections(prev => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length) {
        let same = true;
        for (const k of nextKeys) {
          const a = prev[k] ?? [];
          const b = next[k] ?? [];
          if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [calFilters, cascadeConfig, cascadeFieldKeys, cascadeTierByFieldKey]);

  return { cascadeSelections, handleCascadeSelectionsChange };
}

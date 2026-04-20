/**
 * useConditionBuilder — shared hook for building AND/OR filter conditions.
 *
 * Extracted from AdvancedFilterBuilder so both the sidebar FiltersPanel
 * and the legacy AdvancedFilterBuilder can share the same logic.
 */
import { useState, useMemo, useCallback } from 'react';
import { createId } from '../core/createId';
import { DEFAULT_FILTER_SCHEMA, defaultOperatorsForType } from '../filters/filterSchema';
import { conditionsToFilters } from '../filters/conditionEngine';
import type { FilterField } from '../filters/filterSchema';

export type Condition = {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic: 'AND' | 'OR';
};

function makeCondition(logic: 'AND' | 'OR' = 'AND', firstFieldKey = 'categories'): Condition {
  return { id: createId('cond'), field: firstFieldKey, operator: 'is', value: '', logic };
}

export type UseConditionBuilderOptions = {
  schema?: FilterField[];
  initialConditions?: Condition[] | null;
};

export type UseConditionBuilderResult = {
  conditions: Condition[];
  /** Field options (schema fields minus date-range). */
  fieldOptions: FilterField[];
  /** Operator map keyed by field key. */
  operatorMap: Record<string, Array<{ value: string; label: string }>>;
  /** Add a new condition row with the given logic. */
  addCondition: (logic: 'AND' | 'OR') => void;
  /** Update a condition by id. Resets operator+value on field change. */
  updateCondition: (id: string, updates: Partial<Condition>) => void;
  /** Remove a condition by id (min 1 row kept). */
  removeCondition: (id: string) => void;
  /** Replace all conditions (e.g. when loading a saved view). */
  setConditions: (conditions: Condition[]) => void;
  /** Clear all conditions back to a single empty row. */
  clearConditions: () => void;
  /** Convert current conditions to a filter state object. */
  toFilters: () => Record<string, unknown>;
  /** Number of conditions with a non-empty value. */
  activeCount: number;
};

export function useConditionBuilder({
  schema = DEFAULT_FILTER_SCHEMA,
  initialConditions = null,
}: UseConditionBuilderOptions = {}): UseConditionBuilderResult {
  const fieldOptions = useMemo(
    () => schema.filter((f: FilterField) => f.type !== 'date-range'),
    [schema],
  );

  const operatorMap = useMemo(() => {
    const map: Record<string, Array<{ value: string; label: string }>> = {};
    for (const f of fieldOptions) {
      map[f.key] = f.operators ?? defaultOperatorsForType(f.type);
    }
    return map;
  }, [fieldOptions]);

  const firstFieldKey = fieldOptions[0]?.key ?? 'categories';

  const [conditions, setConditions] = useState<Condition[]>(() =>
    initialConditions && initialConditions.length > 0
      ? initialConditions.map(c => ({ ...c, id: createId('cond') }))
      : [makeCondition('AND', firstFieldKey)],
  );

  const addCondition = useCallback((logic: 'AND' | 'OR') => {
    setConditions(prev => [...prev, makeCondition(logic, firstFieldKey)]);
  }, [firstFieldKey]);

  const updateCondition = useCallback((id: string, updates: Partial<Condition>) => {
    setConditions(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, ...updates };
      // Reset operator + value when field changes
      if (updates.field && updates.field !== c.field) {
        const ops = schema.find(f => f.key === updates.field)?.operators
          ?? defaultOperatorsForType(schema.find(f => f.key === updates.field)?.type ?? 'text');
        next.operator = ops[0]?.value ?? 'is';
        next.value = '';
      }
      return next;
    }));
  }, [schema]);

  const removeCondition = useCallback((id: string) => {
    setConditions(prev => prev.length > 1 ? prev.filter(c => c.id !== id) : prev);
  }, []);

  const clearConditions = useCallback(() => {
    setConditions([makeCondition('AND', firstFieldKey)]);
  }, [firstFieldKey]);

  const toFilters = useCallback(() => {
    return conditionsToFilters(conditions, schema);
  }, [conditions, schema]);

  const activeCount = useMemo(
    () => conditions.filter(c => c.value.trim() !== '').length,
    [conditions],
  );

  return {
    conditions,
    fieldOptions,
    operatorMap,
    addCondition,
    updateCondition,
    removeCondition,
    setConditions,
    clearConditions,
    toFilters,
    activeCount,
  };
}

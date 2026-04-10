/**
 * filterState unit tests — isEmptyFilterValue, clearFilterValue,
 * createInitialFilters, buildActiveFilterPills.
 */
import { describe, it, expect } from 'vitest';
import {
  isEmptyFilterValue,
  clearFilterValue,
  createInitialFilters,
  buildActiveFilterPills,
} from '../filterState.js';
import { DEFAULT_FILTER_SCHEMA } from '../filterSchema.js';

// ── isEmptyFilterValue ─────────────────────────────────────────────────────────

describe('isEmptyFilterValue', () => {
  it('treats null as empty',      () => expect(isEmptyFilterValue(null)).toBe(true));
  it('treats undefined as empty', () => expect(isEmptyFilterValue(undefined)).toBe(true));
  it('treats empty string as empty', () => expect(isEmptyFilterValue('')).toBe(true));
  it('treats whitespace string as empty', () => expect(isEmptyFilterValue('  ')).toBe(true));
  it('treats empty Set as empty', () => expect(isEmptyFilterValue(new Set())).toBe(true));
  it('treats empty array as empty', () => expect(isEmptyFilterValue([])).toBe(true));

  it('non-empty Set is not empty',    () => expect(isEmptyFilterValue(new Set(['x']))).toBe(false));
  it('non-empty array is not empty',  () => expect(isEmptyFilterValue(['x'])).toBe(false));
  it('non-empty string is not empty', () => expect(isEmptyFilterValue('hello')).toBe(false));
  it('false is not empty',            () => expect(isEmptyFilterValue(false)).toBe(false));
  it('0 is not empty',                () => expect(isEmptyFilterValue(0)).toBe(false));
});

// ── clearFilterValue ───────────────────────────────────────────────────────────

describe('clearFilterValue', () => {
  it('multi-select → empty Set', () => {
    expect(clearFilterValue({ type: 'multi-select' })).toBeInstanceOf(Set);
    expect(clearFilterValue({ type: 'multi-select' }).size).toBe(0);
  });

  it('text → empty string', () => {
    expect(clearFilterValue({ type: 'text' })).toBe('');
  });

  it('date-range → null', () => {
    expect(clearFilterValue({ type: 'date-range' })).toBeNull();
  });

  it('select → null', () => {
    expect(clearFilterValue({ type: 'select' })).toBeNull();
  });

  it('boolean → null', () => {
    expect(clearFilterValue({ type: 'boolean' })).toBeNull();
  });

  it('uses field.defaultValue when provided', () => {
    expect(clearFilterValue({ type: 'multi-select', defaultValue: 'custom' })).toBe('custom');
  });

  it('handles undefined field gracefully', () => {
    expect(clearFilterValue(undefined)).toBeUndefined();
  });
});

// ── createInitialFilters ───────────────────────────────────────────────────────

describe('createInitialFilters', () => {
  it('creates correct initial state from DEFAULT_FILTER_SCHEMA', () => {
    const filters = createInitialFilters(DEFAULT_FILTER_SCHEMA);
    expect(filters.categories).toBeInstanceOf(Set);
    expect(filters.categories.size).toBe(0);
    expect(filters.resources).toBeInstanceOf(Set);
    expect(filters.sources).toBeInstanceOf(Set);
    expect(filters.dateRange).toBeNull();
    expect(filters.search).toBe('');
  });

  it('creates initial state from a custom schema', () => {
    const schema = [
      { key: 'status', type: 'multi-select' },
      { key: 'label',  type: 'text' },
      { key: 'active', type: 'boolean' },
    ];
    const filters = createInitialFilters(schema);
    expect(filters.status).toBeInstanceOf(Set);
    expect(filters.label).toBe('');
    expect(filters.active).toBeNull();
  });

  it('uses defaultValue from schema field', () => {
    const schema = [{ key: 'count', type: 'select', defaultValue: 0 }];
    expect(createInitialFilters(schema).count).toBe(0);
  });

  it('produces every key in the schema', () => {
    const schema = [
      { key: 'a', type: 'text' },
      { key: 'b', type: 'multi-select' },
      { key: 'c', type: 'date-range' },
    ];
    const keys = Object.keys(createInitialFilters(schema));
    expect(keys).toContain('a');
    expect(keys).toContain('b');
    expect(keys).toContain('c');
  });
});

// ── buildActiveFilterPills ─────────────────────────────────────────────────────

describe('buildActiveFilterPills', () => {
  it('returns empty array when no filters active', () => {
    const filters = createInitialFilters(DEFAULT_FILTER_SCHEMA);
    expect(buildActiveFilterPills(filters, DEFAULT_FILTER_SCHEMA)).toEqual([]);
  });

  it('produces one pill per selected value in a multi-select', () => {
    const filters = {
      ...createInitialFilters(DEFAULT_FILTER_SCHEMA),
      categories: new Set(['Meeting', 'PTO']),
    };
    const pills = buildActiveFilterPills(filters, DEFAULT_FILTER_SCHEMA);
    const catPills = pills.filter(p => p.key === 'categories');
    expect(catPills).toHaveLength(2);
    expect(catPills.map(p => p.value)).toEqual(expect.arrayContaining(['Meeting', 'PTO']));
  });

  it('skips date-range fields (they have dedicated UI)', () => {
    const filters = {
      ...createInitialFilters(DEFAULT_FILTER_SCHEMA),
      dateRange: { start: new Date(), end: new Date() },
    };
    const pills = buildActiveFilterPills(filters, DEFAULT_FILTER_SCHEMA);
    expect(pills.some(p => p.key === 'dateRange')).toBe(false);
  });

  it('skips text/search fields', () => {
    const filters = { ...createInitialFilters(DEFAULT_FILTER_SCHEMA), search: 'hello' };
    const pills = buildActiveFilterPills(filters, DEFAULT_FILTER_SCHEMA);
    expect(pills.some(p => p.key === 'search')).toBe(false);
  });

  it('uses field.pillLabel when provided', () => {
    const schema = [{
      key: 'status', type: 'multi-select',
      pillLabel: (v) => `Status: ${v}`,
    }];
    const pills = buildActiveFilterPills({ status: new Set(['open']) }, schema);
    expect(pills[0].displayValue).toBe('Status: open');
  });

  it('includes fieldLabel on each pill', () => {
    const filters = {
      ...createInitialFilters(DEFAULT_FILTER_SCHEMA),
      categories: new Set(['Meeting']),
    };
    const pills = buildActiveFilterPills(filters, DEFAULT_FILTER_SCHEMA);
    const catPill = pills.find(p => p.key === 'categories');
    expect(catPill.fieldLabel).toBe('Category');
  });

  it('produces one pill for an active select field', () => {
    const schema = [{ key: 'priority', label: 'Priority', type: 'select' }];
    const pills = buildActiveFilterPills({ priority: 'high' }, schema);
    expect(pills).toHaveLength(1);
    expect(pills[0].key).toBe('priority');
    expect(pills[0].value).toBe('high');
    expect(pills[0].displayValue).toBe('high');
    expect(pills[0].fieldLabel).toBe('Priority');
  });

  it('produces one pill for an active boolean field', () => {
    const schema = [{ key: 'urgent', label: 'Urgent only', type: 'boolean' }];
    const pills = buildActiveFilterPills({ urgent: true }, schema);
    expect(pills).toHaveLength(1);
    expect(pills[0].key).toBe('urgent');
    expect(pills[0].value).toBe(true);
  });

  it('skips null/false boolean values', () => {
    const schema = [{ key: 'flag', label: 'Flag', type: 'boolean' }];
    expect(buildActiveFilterPills({ flag: null }, schema)).toHaveLength(0);
    // false is a deliberate filter value (not cleared), so it generates a pill
    expect(buildActiveFilterPills({ flag: false }, schema)).toHaveLength(1);
  });

  it('uses pillLabel on select field', () => {
    const schema = [{
      key: 'status', label: 'Status', type: 'select',
      pillLabel: (v) => `Status: ${v}`,
    }];
    const pills = buildActiveFilterPills({ status: 'open' }, schema);
    expect(pills[0].displayValue).toBe('Status: open');
  });

  it('select with null value produces no pill', () => {
    const schema = [{ key: 'priority', label: 'Priority', type: 'select' }];
    expect(buildActiveFilterPills({ priority: null }, schema)).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  defaultOperatorsForType,
  makeResourceResolver,
  buildDefaultFilterSchema,
  DEFAULT_FILTER_SCHEMA,
  viewScopedSchema,
  ownerField,
  tagsField,
  metaSelectField,
} from '../filterSchema';

// ─── defaultOperatorsForType ──────────────────────────────────────────────────

describe('defaultOperatorsForType', () => {
  it('select: returns is/is_not', () => {
    const ops = defaultOperatorsForType('select');
    expect(ops.map(o => o.value)).toEqual(['is', 'is_not']);
  });

  it('multi-select: returns is/is_not', () => {
    const ops = defaultOperatorsForType('multi-select');
    expect(ops.map(o => o.value)).toEqual(['is', 'is_not']);
  });

  it('text: returns contains/not_contains/is', () => {
    const ops = defaultOperatorsForType('text');
    expect(ops.map(o => o.value)).toEqual(['contains', 'not_contains', 'is']);
  });

  it('date-range: returns between/before/after', () => {
    const ops = defaultOperatorsForType('date-range');
    expect(ops.map(o => o.value)).toEqual(['between', 'before', 'after']);
  });

  it('boolean: returns single "is"', () => {
    const ops = defaultOperatorsForType('boolean');
    expect(ops.map(o => o.value)).toEqual(['is']);
  });

  it('custom: returns empty array', () => {
    expect(defaultOperatorsForType('custom')).toEqual([]);
  });

  it('unknown type: falls through to empty array', () => {
    expect(defaultOperatorsForType('unknown' as any)).toEqual([]);
  });
});

// ─── makeResourceResolver ─────────────────────────────────────────────────────

describe('makeResourceResolver', () => {
  it('returns empty string for null/undefined id', () => {
    const resolve = makeResourceResolver();
    expect(resolve(null)).toBe('');
    expect(resolve(undefined)).toBe('');
  });

  it('falls back to raw id string when not in registry', () => {
    const resolve = makeResourceResolver();
    expect(resolve('r1')).toBe('r1');
  });

  it('resolves employee by name', () => {
    const resolve = makeResourceResolver({
      employees: [{ id: 'emp-1', label: 'Alice' }],
    });
    expect(resolve('emp-1')).toBe('Alice');
  });

  it('resolves employee by .name field', () => {
    const resolve = makeResourceResolver({
      employees: [{ id: 'emp-1', name: 'Bob' } as any],
    });
    expect(resolve('emp-1')).toBe('Bob');
  });

  it('resolves asset by label', () => {
    const resolve = makeResourceResolver({
      assets: [{ id: 'asset-1', label: 'Truck #5' }],
    });
    expect(resolve('asset-1')).toBe('Truck #5');
  });

  it('employee takes priority over asset with same id', () => {
    const resolve = makeResourceResolver({
      employees: [{ id: 'shared', label: 'Alice' }],
      assets:    [{ id: 'shared', label: 'Machine' }],
    });
    expect(resolve('shared')).toBe('Alice');
  });

  it('resolves numeric id coerced to string', () => {
    const resolve = makeResourceResolver({
      employees: [{ id: 42, label: 'Dave' } as any],
    });
    expect(resolve(42)).toBe('Dave');
  });

  it('skips null/undefined entries in employees/assets', () => {
    const resolve = makeResourceResolver({
      employees: [null as any, { id: 'e1', label: 'Eve' }],
    });
    expect(resolve('e1')).toBe('Eve');
  });
});

// ─── buildDefaultFilterSchema ─────────────────────────────────────────────────

describe('buildDefaultFilterSchema', () => {
  const ev = (overrides: any) => ({
    id: 'e1',
    title: 'T',
    category: null,
    resource: null,
    _sourceId: null,
    ...overrides,
  });

  it('returns 5 fields: categories, resources, sources, dateRange, search', () => {
    const schema = buildDefaultFilterSchema();
    expect(schema.map(f => f.key)).toEqual(['categories', 'resources', 'sources', 'dateRange', 'search']);
  });

  it('categories getOptions returns sorted unique values', () => {
    const schema = buildDefaultFilterSchema();
    const catField = schema.find(f => f.key === 'categories')!;
    const opts = catField.getOptions!([
      ev({ category: 'PTO' }),
      ev({ category: 'Meeting' }),
      ev({ category: 'PTO' }),
    ]);
    expect(opts.map(o => o.value)).toEqual(['Meeting', 'PTO']);
  });

  it('categories predicate works with Set', () => {
    const schema = buildDefaultFilterSchema();
    const catField = schema.find(f => f.key === 'categories')!;
    expect(catField.predicate!(ev({ category: 'PTO' }), new Set(['PTO']))).toBe(true);
    expect(catField.predicate!(ev({ category: 'Meeting' }), new Set(['PTO']))).toBe(false);
  });

  it('categories predicate works with array', () => {
    const schema = buildDefaultFilterSchema();
    const catField = schema.find(f => f.key === 'categories')!;
    expect(catField.predicate!(ev({ category: 'PTO' }), ['PTO'])).toBe(true);
  });

  it('resources getOptions uses resolver for labels', () => {
    const schema = buildDefaultFilterSchema({
      employees: [{ id: 'emp-1', label: 'Alice' }],
    });
    const resField = schema.find(f => f.key === 'resources')!;
    const opts = resField.getOptions!([ev({ resource: 'emp-1' })]);
    expect(opts[0]!.label).toBe('Alice');
    expect(opts[0]!.value).toBe('emp-1');
  });

  it('resources getOptions sorts multiple options by label (line-339 sort comparator)', () => {
    // Two resources with labels in reverse order — sort must invoke the comparator.
    const schema = buildDefaultFilterSchema({
      employees: [
        { id: 'emp-z', label: 'Zara' },
        { id: 'emp-a', label: 'Alice' },
      ],
    });
    const resField = schema.find(f => f.key === 'resources')!;
    const opts = resField.getOptions!([
      ev({ resource: 'emp-z' }),
      ev({ resource: 'emp-a' }),
    ]);
    // After sort: Alice before Zara
    expect(opts[0]!.label).toBe('Alice');
    expect(opts[1]!.label).toBe('Zara');
  });

  it('resources predicate works with Set', () => {
    const schema = buildDefaultFilterSchema();
    const resField = schema.find(f => f.key === 'resources')!;
    expect(resField.predicate!(ev({ resource: 'r1' }), new Set(['r1']))).toBe(true);
    expect(resField.predicate!(ev({ resource: 'r2' }), new Set(['r1']))).toBe(false);
  });

  it('resources predicate works with array', () => {
    const schema = buildDefaultFilterSchema();
    const resField = schema.find(f => f.key === 'resources')!;
    expect(resField.predicate!(ev({ resource: 'r1' }), ['r1'])).toBe(true);
  });

  it('sources getOptions returns unique options with label', () => {
    const schema = buildDefaultFilterSchema();
    const srcField = schema.find(f => f.key === 'sources')!;
    const opts = srcField.getOptions!([
      ev({ _sourceId: 'src-a', _sourceLabel: 'Source A' }),
      ev({ _sourceId: 'src-a', _sourceLabel: 'Source A' }),
      ev({ _sourceId: 'src-b', _sourceLabel: 'Source B' }),
    ]);
    expect(opts).toHaveLength(2);
    expect(opts[0]!.label).toBe('Source A');
  });

  it('sources predicate allows events without _sourceId', () => {
    const schema = buildDefaultFilterSchema();
    const srcField = schema.find(f => f.key === 'sources')!;
    expect(srcField.predicate!(ev({ _sourceId: null }), new Set(['src-a']))).toBe(true);
  });

  it('sources predicate filters by Set', () => {
    const schema = buildDefaultFilterSchema();
    const srcField = schema.find(f => f.key === 'sources')!;
    expect(srcField.predicate!(ev({ _sourceId: 'src-a' }), new Set(['src-a']))).toBe(true);
    expect(srcField.predicate!(ev({ _sourceId: 'src-b' }), new Set(['src-a']))).toBe(false);
  });

  it('sources predicate filters by array', () => {
    const schema = buildDefaultFilterSchema();
    const srcField = schema.find(f => f.key === 'sources')!;
    expect(srcField.predicate!(ev({ _sourceId: 'src-a' }), ['src-a'])).toBe(true);
  });
});

// ─── DEFAULT_FILTER_SCHEMA ────────────────────────────────────────────────────

describe('DEFAULT_FILTER_SCHEMA', () => {
  it('has 5 fields', () => {
    expect(DEFAULT_FILTER_SCHEMA).toHaveLength(5);
  });

  it('resources getOptions returns sorted values without label resolver', () => {
    const resField = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'resources')!;
    const ev = (r: string | null) => ({ resource: r });
    const opts = resField.getOptions!([ev('r2'), ev('r1'), ev(null)]);
    expect(opts.map(o => o.value)).toEqual(['r1', 'r2']);
  });
});

// ─── ownerField ──────────────────────────────────────────────────────────────

describe('ownerField', () => {
  const field = ownerField();
  const item = (owner: string) => ({ owner });

  it('predicate matches when value is a Set', () => {
    expect(field.predicate!(item('alice'), new Set(['alice']))).toBe(true);
    expect(field.predicate!(item('bob'), new Set(['alice']))).toBe(false);
  });

  it('predicate matches when value is an array', () => {
    // Covers the array branch of the ternary (value instanceof Set ? ... : ...)
    expect(field.predicate!(item('alice'), ['alice'])).toBe(true);
    expect(field.predicate!(item('bob'), ['alice'])).toBe(false);
  });
});

// ─── tagsField ────────────────────────────────────────────────────────────────

describe('tagsField', () => {
  const field = tagsField();

  it('predicate matches when value is an array (not Set)', () => {
    // Covers the array branch of the value instanceof Set ternary
    const item = { tags: ['urgent', 'review'] };
    expect(field.predicate!(item, ['urgent'])).toBe(true);
    expect(field.predicate!(item, ['other'])).toBe(false);
  });

  it('getOptions skips empty-string tags', () => {
    // Covers the if (t) branch when tag is empty string
    const items = [{ tags: ['valid', '', 'also-valid'] }];
    const opts = field.getOptions!(items);
    expect(opts.map(o => o.value)).not.toContain('');
    expect(opts.map(o => o.value)).toContain('valid');
  });
});

// ─── metaSelectField ─────────────────────────────────────────────────────────

describe('metaSelectField', () => {
  const field = metaSelectField('dept');

  it('predicate falls back to item[key] when meta is absent', () => {
    // Covers item.meta?.[key] ?? item[key] — right side of ??
    const item = { dept: 'eng' };
    expect(field.predicate!(item, 'eng')).toBe(true);
    expect(field.predicate!(item, 'hr')).toBe(false);
  });

  it('getOptions falls back to e[key] when meta is absent', () => {
    // Covers e.meta?.[key] ?? e[key] right side
    const items = [{ dept: 'eng' }, { dept: 'hr' }];
    const opts = field.getOptions!(items);
    expect(opts.map(o => o.value)).toEqual(['eng', 'hr']);
  });

  it('getOptions skips null/undefined values', () => {
    // Covers if (v != null) false branch
    const items = [{ meta: { dept: null } }, { meta: { dept: 'eng' } }];
    const opts = field.getOptions!(items);
    expect(opts).toHaveLength(1);
    expect(opts[0]!.value).toBe('eng');
  });
});

// ─── makeResourceResolver — additional branches ───────────────────────────────

describe('makeResourceResolver — additional branches', () => {
  it('falls back to raw key when employee has neither name nor label', () => {
    // Covers name ?? label ?? key — third fallback
    const resolve = makeResourceResolver({
      employees: [{ id: 'emp-x' } as any],
    });
    expect(resolve('emp-x')).toBe('emp-x');
  });

  it('skips asset when its id is already claimed by an employee', () => {
    // Covers if (lookup.has(key)) continue in the assets loop
    const resolve = makeResourceResolver({
      employees: [{ id: 'shared', label: 'Alice' }],
      assets:    [{ id: 'shared', label: 'Machine' }],
    });
    expect(resolve('shared')).toBe('Alice');
  });

  it('falls back to raw key when asset has neither label nor name', () => {
    // Covers a.label ?? a.name ?? key — third fallback for assets
    const resolve = makeResourceResolver({
      assets: [{ id: 'asset-bare' } as any],
    });
    expect(resolve('asset-bare')).toBe('asset-bare');
  });
});

// ─── buildDefaultFilterSchema — additional branches ───────────────────────────

describe('buildDefaultFilterSchema — additional branches', () => {
  const ev = (overrides: any) => ({ id: 'e1', title: 'T', ...overrides });

  it('categories getOptions skips items with falsy category', () => {
    // Covers if (e.category) false branch
    const schema = buildDefaultFilterSchema();
    const catField = schema.find(f => f.key === 'categories')!;
    const opts = catField.getOptions!([ev({ category: null }), ev({ category: 'PTO' })]);
    expect(opts.map(o => o.value)).toEqual(['PTO']);
  });

  it('resources getOptions skips items with falsy resource', () => {
    // Covers if (e.resource) false branch
    const schema = buildDefaultFilterSchema();
    const resField = schema.find(f => f.key === 'resources')!;
    const opts = resField.getOptions!([ev({ resource: null }), ev({ resource: 'r1' })]);
    expect(opts.map(o => o.value)).toEqual(['r1']);
  });

  it('sources getOptions falls back to _sourceId as label when _sourceLabel is absent', () => {
    // Covers e._sourceLabel ?? e._sourceId right side
    const schema = buildDefaultFilterSchema();
    const srcField = schema.find(f => f.key === 'sources')!;
    const opts = srcField.getOptions!([ev({ _sourceId: 'src-x' })]);
    expect(opts[0]!.label).toBe('src-x');
    expect(opts[0]!.value).toBe('src-x');
  });
});

// ─── DEFAULT_FILTER_SCHEMA — additional branches ──────────────────────────────

describe('DEFAULT_FILTER_SCHEMA — additional branches', () => {
  const ev = (overrides: any) => ({ id: 'e1', title: 'T', ...overrides });

  it('categories predicate works with array value', () => {
    // Covers the array branch in DEFAULT_FILTER_SCHEMA categories predicate
    const catField = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'categories')!;
    expect(catField.predicate!(ev({ category: 'PTO' }), ['PTO'])).toBe(true);
    expect(catField.predicate!(ev({ category: 'Meeting' }), ['PTO'])).toBe(false);
  });

  it('categories getOptions skips items with falsy category', () => {
    // Covers if (e.category) false branch in DEFAULT_FILTER_SCHEMA
    const catField = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'categories')!;
    const opts = catField.getOptions!([ev({ category: null }), ev({ category: 'PTO' })]);
    expect(opts.map(o => o.value)).toEqual(['PTO']);
  });

  it('resources predicate works with array value', () => {
    const resField = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'resources')!;
    expect(resField.predicate!(ev({ resource: 'r1' }), ['r1'])).toBe(true);
    expect(resField.predicate!(ev({ resource: 'r2' }), ['r1'])).toBe(false);
  });

  it('sources predicate works with array value when item has _sourceId', () => {
    // Covers the array branch in DEFAULT_FILTER_SCHEMA sources predicate
    const srcField = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'sources')!;
    expect(srcField.predicate!(ev({ _sourceId: 'src-a' }), ['src-a'])).toBe(true);
    expect(srcField.predicate!(ev({ _sourceId: 'src-b' }), ['src-a'])).toBe(false);
  });

  it('sources getOptions builds options from items with _sourceId', () => {
    // Covers DEFAULT_FILTER_SCHEMA sources getOptions (branches 47/48/49)
    const srcField = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'sources')!;
    const opts = srcField.getOptions!([
      ev({ _sourceId: 'src-a', _sourceLabel: 'Source A' }),
      ev({ _sourceId: 'src-a', _sourceLabel: 'Source A' }),
      ev({ _sourceId: 'src-b' }),
    ]);
    expect(opts).toHaveLength(2);
    expect(opts[0]!.label).toBe('Source A');
    expect(opts[1]!.label).toBe('src-b');
  });
});

// ─── viewScopedSchema ─────────────────────────────────────────────────────────

describe('viewScopedSchema', () => {
  const baseSchema = DEFAULT_FILTER_SCHEMA;

  it('returns schema unchanged for views with no seed categories', () => {
    const result = viewScopedSchema(baseSchema, 'week');
    expect(result).toBe(baseSchema);
  });

  it('returns schema unchanged for unknown view', () => {
    const result = viewScopedSchema(baseSchema, 'unknown');
    expect(result).toBe(baseSchema);
  });

  it('wraps categories getOptions for schedule view to include seed categories', () => {
    const result = viewScopedSchema(baseSchema, 'schedule');
    const catField = result.find(f => f.key === 'categories')!;
    // getOptions should exist and return at least seed options even for empty items
    const opts = catField.getOptions!([]);
    expect(opts.length).toBeGreaterThan(0);
  });

  it('does not duplicate seeds already in derived options', () => {
    const result = viewScopedSchema(baseSchema, 'schedule');
    const catField = result.find(f => f.key === 'categories')!;
    // Pass an event with a seed category to ensure no duplicates
    const opts = catField.getOptions!([{ category: 'PTO' }]);
    const values = opts.map(o => String(o.value).toLowerCase());
    const uniqueValues = new Set(values);
    expect(values.length).toBe(uniqueValues.size);
  });

  it('non-category fields pass through unchanged', () => {
    const result = viewScopedSchema(baseSchema, 'schedule');
    const searchField = result.find(f => f.key === 'search')!;
    const origSearch = baseSchema.find(f => f.key === 'search')!;
    expect(searchField).toBe(origSearch);
  });

  it('uses field.options when set (no getOptions call needed)', () => {
    // Covers field.options ?? (baseGetOptions ? ...) — left side truthy path
    // when a categories field already has static options set
    const schemaWithOptions = baseSchema.map(f =>
      f.key === 'categories'
        ? { ...f, options: [{ value: 'PTO', label: 'PTO' }] }
        : f,
    );
    const result = viewScopedSchema(schemaWithOptions, 'schedule');
    const catField = result.find(f => f.key === 'categories')!;
    const opts = catField.getOptions!([]);
    expect(opts.some(o => o.value === 'PTO')).toBe(true);
  });
});

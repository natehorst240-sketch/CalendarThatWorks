/**
 * filterEngine unit tests — applyFilters (all stages), getSources.
 */
import { describe, it, expect } from 'vitest';
import { applyFilters, getCategories, getResources, getSources } from '../filterEngine';
import {
  statusField, priorityField, ownerField, tagsField, metaSelectField,
} from '../filterSchema';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ev = (overrides: any) => ({
  id:       overrides.id ?? 'e1',
  title:    overrides.title ?? 'Event',
  start:    overrides.start ?? new Date('2026-04-10T09:00'),
  end:      overrides.end   ?? new Date('2026-04-10T10:00'),
  category: overrides.category ?? undefined,
  resource: overrides.resource ?? undefined,
  ...overrides,
});

const srcA = ev({ id: 'a', title: 'From A', _sourceId: 'src-a', _sourceLabel: 'Source A' });
const srcB = ev({ id: 'b', title: 'From B', _sourceId: 'src-b', _sourceLabel: 'Source B' });
const noProp = ev({ id: 'c', title: 'No source' }); // prop event — no _sourceId

// ── Source filter ─────────────────────────────────────────────────────────────

describe('applyFilters — sources', () => {
  it('shows all events when sources Set is empty', () => {
    const result = applyFilters([srcA, srcB, noProp], { sources: new Set() });
    expect(result).toHaveLength(3);
  });

  it('shows only matching source events when sources is non-empty', () => {
    const result = applyFilters([srcA, srcB, noProp], { sources: new Set(['src-a']) });
    expect(result.map(e => e.id)).toEqual(['a', 'c']); // src-a + prop event
  });

  it('always includes events with no _sourceId (prop events)', () => {
    const result = applyFilters([srcA, noProp], { sources: new Set(['src-a']) });
    expect(result.some(e => e.id === 'c')).toBe(true);
  });

  it('shows events from multiple selected sources', () => {
    const result = applyFilters([srcA, srcB, noProp], { sources: new Set(['src-a', 'src-b']) });
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no events match selected source', () => {
    const result = applyFilters([srcA, srcB], { sources: new Set(['src-x']) });
    expect(result).toHaveLength(0);
  });

  it('works when sources filter is absent (undefined)', () => {
    const result = applyFilters([srcA, srcB], {});
    expect(result).toHaveLength(2);
  });
});

// ── Combined source + category filter ────────────────────────────────────────

describe('applyFilters — sources + categories combined', () => {
  const catA = ev({ id: 'ca', category: 'Meeting', _sourceId: 'src-a' });
  const catB = ev({ id: 'cb', category: 'PTO',     _sourceId: 'src-b' });
  const catC = ev({ id: 'cc', category: 'Meeting', _sourceId: 'src-b' });

  it('applies both filters independently', () => {
    const result = applyFilters([catA, catB, catC], {
      sources:    new Set(['src-a']),
      categories: new Set(['Meeting']),
    });
    // Only catA matches both (src-a AND Meeting); catC is Meeting but src-b
    expect(result.map(e => e.id)).toEqual(['ca']);
  });
});

// ── Category filter ───────────────────────────────────────────────────────────

describe('applyFilters — categories', () => {
  const events = [
    ev({ id: '1', category: 'Meeting' }),
    ev({ id: '2', category: 'PTO' }),
    ev({ id: '3', category: 'Meeting' }),
  ];

  it('shows all when categories Set is empty', () => {
    expect(applyFilters(events, { categories: new Set() })).toHaveLength(3);
  });

  it('filters to selected categories', () => {
    const result = applyFilters(events, { categories: new Set(['Meeting']) });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.category === 'Meeting')).toBe(true);
  });
});

// ── Resource filter ───────────────────────────────────────────────────────────

describe('applyFilters — resources', () => {
  const events = [
    ev({ id: '1', resource: 'Alice' }),
    ev({ id: '2', resource: 'Bob' }),
  ];

  it('shows all when resources Set is empty', () => {
    expect(applyFilters(events, { resources: new Set() })).toHaveLength(2);
  });

  it('filters to selected resources', () => {
    const result = applyFilters(events, { resources: new Set(['Alice']) });
    expect(result).toHaveLength(1);
    expect(result[0].resource).toBe('Alice');
  });
});

// ── Text search filter ────────────────────────────────────────────────────────

describe('applyFilters — search', () => {
  const events = [
    ev({ id: '1', title: 'Team standup' }),
    ev({ id: '2', title: 'Quarterly review', resource: 'Alice' }),
  ];

  it('matches title case-insensitively', () => {
    const result = applyFilters(events, { search: 'STANDUP' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('matches resource', () => {
    const result = applyFilters(events, { search: 'alice' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('shows all when search is empty', () => {
    expect(applyFilters(events, { search: '' })).toHaveLength(2);
  });
});

// ── getSources ────────────────────────────────────────────────────────────────

describe('getSources', () => {
  it('extracts unique source pairs from events', () => {
    const events = [srcA, srcB, ev({ id: 'a2', _sourceId: 'src-a', _sourceLabel: 'Source A' })];
    const sources = getSources(events);
    expect(sources).toHaveLength(2);
    expect(sources.find(s => s.id === 'src-a')?.label).toBe('Source A');
  });

  it('excludes events with no _sourceId', () => {
    const sources = getSources([noProp]);
    expect(sources).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(getSources([])).toEqual([]);
  });
});

// ── getCategories / getResources ──────────────────────────────────────────────

describe('getCategories', () => {
  it('returns sorted unique categories', () => {
    const events = [ev({ category: 'PTO' }), ev({ category: 'Meeting' }), ev({ category: 'PTO' })];
    expect(getCategories(events)).toEqual(['Meeting', 'PTO']);
  });

  it('excludes undefined categories', () => {
    expect(getCategories([ev({})])).toEqual([]);
  });
});

describe('getResources', () => {
  it('returns sorted unique resources', () => {
    const events = [ev({ resource: 'Zara' }), ev({ resource: 'Alice' })];
    expect(getResources(events)).toEqual(['Alice', 'Zara']);
  });
});

// ── Schema-driven applyFilters ────────────────────────────────────────────────

describe('applyFilters — custom schema', () => {
  const customSchema = [
    {
      key: 'status',
      label: 'Status',
      type: 'multi-select',
      predicate: (item: any, value: any) =>
        value instanceof Set ? value.has(item.status) : value.includes(item.status),
    },
    {
      key: 'search',
      label: 'Search',
      type: 'text',
    },
  ];

  const events = [
    ev({ id: '1', title: 'Open task',   status: 'open'   }),
    ev({ id: '2', title: 'Closed task', status: 'closed' }),
    ev({ id: '3', title: 'Open item',   status: 'open'   }),
  ];

  it('filters by custom predicate field', () => {
    const result = applyFilters(events, { status: new Set(['open']) }, customSchema);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.status === 'open')).toBe(true);
  });

  it('text field matches title', () => {
    const result = applyFilters(events, { search: 'Closed' }, customSchema);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('unknown field type defaults to pass-through', () => {
    const schema = [{ key: 'unknown', type: 'custom' }];
    const result = applyFilters(events, { unknown: 'anything' }, schema);
    expect(result).toHaveLength(3);
  });

  it('defaultMatch handles select type', () => {
    const schema = [{ key: 'status', type: 'select' }];
    const evts = [
      ev({ id: 'x', status: 'open' }),
      ev({ id: 'y', status: 'closed' }),
    ];
    const result = applyFilters(evts, { status: 'open' }, schema);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('x');
  });

  it('uses DEFAULT_FILTER_SCHEMA when schema omitted', () => {
    const result = applyFilters(
      [ev({ id: '1', category: 'Meeting' }), ev({ id: '2', category: 'PTO' })],
      { categories: new Set(['Meeting']) },
    );
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('Meeting');
  });
});

// ── Field factories ───────────────────────────────────────────────────────────

describe('statusField', () => {
  const field  = statusField();
  const events = [
    ev({ id: '1', status: 'confirmed' }),
    ev({ id: '2', status: 'tentative' }),
    ev({ id: '3', status: 'cancelled' }),
    ev({ id: '4' }), // no status — defaults to 'confirmed'
  ];

  it('returns a valid FilterField with key="status"', () => {
    expect(field.key).toBe('status');
    expect(field.type).toBe('select');
    expect(field.options).toHaveLength(3);
  });

  it('filters confirmed events', () => {
    const result = applyFilters(events, { status: 'confirmed' }, [field]);
    expect(result.map(e => e.id)).toEqual(['1', '4']);
  });

  it('filters tentative events', () => {
    const result = applyFilters(events, { status: 'tentative' }, [field]);
    expect(result.map(e => e.id)).toEqual(['2']);
  });

  it('accepts overrides', () => {
    const custom = statusField({ key: 'myStatus', label: 'My Status' });
    expect(custom.key).toBe('myStatus');
    expect(custom.label).toBe('My Status');
    expect(custom.options).toHaveLength(3); // original options preserved
  });
});

describe('priorityField', () => {
  const field  = priorityField();
  const events = [
    ev({ id: '1', priority: 'high' }),
    ev({ id: '2', meta: { priority: 'low' } }),
    ev({ id: '3', priority: 'medium' }),
  ];

  it('returns a valid FilterField with key="priority"', () => {
    expect(field.key).toBe('priority');
    expect(field.type).toBe('select');
    expect(field.options).toHaveLength(4);
  });

  it('filters by direct property', () => {
    const result = applyFilters(events, { priority: 'high' }, [field]);
    expect(result.map(e => e.id)).toEqual(['1']);
  });

  it('filters by meta property', () => {
    const result = applyFilters(events, { priority: 'low' }, [field]);
    expect(result.map(e => e.id)).toEqual(['2']);
  });
});

describe('ownerField', () => {
  const field  = ownerField();
  const events = [
    ev({ id: '1', meta: { owner: 'Alice' } }),
    ev({ id: '2', meta: { owner: 'Bob' } }),
    ev({ id: '3', meta: { assignee: 'Alice' } }),
    ev({ id: '4' }),
  ];

  it('returns a valid FilterField with key="owner"', () => {
    expect(field.key).toBe('owner');
    expect(field.type).toBe('multi-select');
  });

  it('filters by meta.owner', () => {
    const result = applyFilters(events, { owner: new Set(['Alice']) }, [field]);
    expect(result.map(e => e.id)).toEqual(['1', '3']);
  });

  it('getOptions returns unique sorted owners', () => {
    const opts = field.getOptions(events);
    expect(opts.map(o => o.value)).toEqual(['Alice', 'Bob']);
  });
});

describe('tagsField', () => {
  const field  = tagsField();
  const events = [
    ev({ id: '1', meta: { tags: ['react', 'frontend'] } }),
    ev({ id: '2', meta: { tags: ['backend', 'api'] } }),
    ev({ id: '3', meta: { tags: ['react', 'backend'] } }),
    ev({ id: '4' }),
  ];

  it('returns a valid FilterField with key="tags"', () => {
    expect(field.key).toBe('tags');
    expect(field.type).toBe('multi-select');
  });

  it('matches events that have ANY of the selected tags', () => {
    const result = applyFilters(events, { tags: new Set(['react']) }, [field]);
    expect(result.map(e => e.id)).toEqual(['1', '3']);
  });

  it('getOptions returns unique sorted tags', () => {
    const opts = field.getOptions(events);
    expect(opts.map(o => o.value)).toEqual(['api', 'backend', 'frontend', 'react']);
  });
});

describe('metaSelectField', () => {
  const field  = metaSelectField('department');
  const events = [
    ev({ id: '1', meta: { department: 'Engineering' } }),
    ev({ id: '2', meta: { department: 'Design' } }),
    ev({ id: '3', meta: { department: 'Engineering' } }),
  ];

  it('creates a field with the given key', () => {
    expect(field.key).toBe('department');
    expect(field.label).toBe('Department');
    expect(field.type).toBe('select');
  });

  it('filters by meta value', () => {
    const result = applyFilters(events, { department: 'Engineering' }, [field]);
    expect(result.map(e => e.id)).toEqual(['1', '3']);
  });

  it('getOptions returns unique sorted values', () => {
    const opts = field.getOptions(events);
    expect(opts.map(o => o.value)).toEqual(['Design', 'Engineering']);
  });
});

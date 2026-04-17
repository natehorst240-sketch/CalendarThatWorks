import { describe, it, expect } from 'vitest'
import { conditionsToFilters, conditionsMatchSchema } from '../conditionEngine.js'
import { DEFAULT_FILTER_SCHEMA } from '../filterSchema.js'

const schema = DEFAULT_FILTER_SCHEMA

// ── conditionsToFilters ───────────────────────────────────────────────────────

describe('conditionsToFilters', () => {
  it('single "is" on multi-select produces a Set', () => {
    const conditions = [
      { field: 'categories', operator: 'is', value: 'Meeting' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories).toBeInstanceOf(Set)
    expect(result.categories.has('Meeting')).toBe(true)
  })

  it('multiple "is" on same multi-select field accumulates into one Set', () => {
    const conditions = [
      { field: 'categories', operator: 'is', value: 'Meeting' },
      { field: 'categories', operator: 'is', value: 'PTO' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories).toBeInstanceOf(Set)
    expect(result.categories.size).toBe(2)
    expect(result.categories.has('PTO')).toBe(true)
  })

  it('"contains" on text produces search string', () => {
    const conditions = [
      { field: 'search', operator: 'contains', value: 'quarterly' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.search).toBe('quarterly')
  })

  it('"is" on text produces search string', () => {
    const conditions = [
      { field: 'search', operator: 'is', value: 'standup' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.search).toBe('standup')
  })

  it('"is_not" produces negation wrapper with Set', () => {
    const conditions = [
      { field: 'categories', operator: 'is_not', value: 'PTO' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories).toMatchObject({ __not: true })
    expect(result.categories.values).toBeInstanceOf(Set)
    expect(result.categories.values.has('PTO')).toBe(true)
  })

  it('multiple "is_not" on same field accumulates into one negation wrapper', () => {
    const conditions = [
      { field: 'categories', operator: 'is_not', value: 'PTO' },
      { field: 'categories', operator: 'is_not', value: 'Holiday' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories.__not).toBe(true)
    expect(result.categories.values.size).toBe(2)
  })

  it('"not_contains" on text produces negation wrapper', () => {
    const conditions = [
      { field: 'search', operator: 'not_contains', value: 'standup' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.search.__not).toBe(true)
    expect(result.search.values.has('standup')).toBe(true)
  })

  it('unknown field key is skipped gracefully', () => {
    const conditions = [
      { field: 'nonexistent', operator: 'is', value: 'foo' },
      { field: 'categories',  operator: 'is', value: 'Meeting' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.nonexistent).toBeUndefined()
    expect(result.categories).toBeInstanceOf(Set)
  })

  it('unknown operator on a known field is skipped gracefully', () => {
    const conditions = [
      { field: 'categories', operator: 'unknown_op', value: 'Meeting' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories).toBeUndefined()
  })

  it('empty value is skipped', () => {
    const conditions = [
      { field: 'categories', operator: 'is', value: '' },
      { field: 'categories', operator: 'is', value: '   ' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories).toBeUndefined()
  })

  it('multiple fields are processed independently', () => {
    const conditions = [
      { field: 'categories', operator: 'is',       value: 'Meeting'   },
      { field: 'resources',  operator: 'is',       value: 'Alice'     },
      { field: 'search',     operator: 'contains', value: 'quarterly' },
    ]
    const result = conditionsToFilters(conditions, schema)
    expect(result.categories.has('Meeting')).toBe(true)
    expect(result.resources.has('Alice')).toBe(true)
    expect(result.search).toBe('quarterly')
  })
})

// ── conditionsMatchSchema ─────────────────────────────────────────────────────

describe('conditionsMatchSchema', () => {
  it('returns valid=true when all field keys exist in schema', () => {
    const conditions = [
      { field: 'categories', operator: 'is', value: 'Meeting' },
      { field: 'search',     operator: 'contains', value: 'foo' },
    ]
    const { valid, invalidKeys } = conditionsMatchSchema(conditions, schema)
    expect(valid).toBe(true)
    expect(invalidKeys).toHaveLength(0)
  })

  it('returns valid=false with unknown keys listed', () => {
    const conditions = [
      { field: 'categories', operator: 'is', value: 'Meeting' },
      { field: 'ghost',      operator: 'is', value: 'foo'     },
    ]
    const { valid, invalidKeys } = conditionsMatchSchema(conditions, schema)
    expect(valid).toBe(false)
    expect(invalidKeys).toContain('ghost')
  })

  it('deduplicates repeated invalid keys', () => {
    const conditions = [
      { field: 'ghost', operator: 'is', value: 'a' },
      { field: 'ghost', operator: 'is', value: 'b' },
    ]
    const { invalidKeys } = conditionsMatchSchema(conditions, schema)
    expect(invalidKeys.filter(k => k === 'ghost')).toHaveLength(1)
  })

  it('returns valid=true for an empty conditions array', () => {
    const { valid, invalidKeys } = conditionsMatchSchema([], schema)
    expect(valid).toBe(true)
    expect(invalidKeys).toHaveLength(0)
  })
})

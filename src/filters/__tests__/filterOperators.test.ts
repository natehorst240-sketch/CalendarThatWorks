import { describe, it, expect } from 'vitest'
import {
  defaultOperatorsForType,
  DEFAULT_FILTER_SCHEMA,
  statusField,
  priorityField,
  ownerField,
  tagsField,
  metaSelectField,
} from '../filterSchema.js'

describe('defaultOperatorsForType', () => {
  it('returns 2 operators for multi-select', () => {
    const ops = defaultOperatorsForType('multi-select')
    expect(ops).toHaveLength(2)
    expect(ops.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('returns 2 operators for select', () => {
    const ops = defaultOperatorsForType('select')
    expect(ops).toHaveLength(2)
    expect(ops.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('returns 3 operators for text', () => {
    const ops = defaultOperatorsForType('text')
    expect(ops).toHaveLength(3)
    expect(ops.map(o => o.value)).toEqual(['contains', 'not_contains', 'is'])
  })

  it('returns 3 operators for date-range', () => {
    const ops = defaultOperatorsForType('date-range')
    expect(ops).toHaveLength(3)
    expect(ops.map(o => o.value)).toEqual(['between', 'before', 'after'])
  })

  it('returns 1 operator for boolean', () => {
    const ops = defaultOperatorsForType('boolean')
    expect(ops).toHaveLength(1)
    expect(ops[0].value).toBe('is')
  })

  it('returns empty array for custom', () => {
    expect(defaultOperatorsForType('custom')).toEqual([])
  })
})

describe('field factories include operators', () => {
  it('statusField has select operators', () => {
    const field = statusField()
    expect(field.operators).toBeDefined()
    expect(field.operators!.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('priorityField has select operators', () => {
    const field = priorityField()
    expect(field.operators).toBeDefined()
    expect(field.operators!.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('ownerField has multi-select operators', () => {
    const field = ownerField()
    expect(field.operators).toBeDefined()
    expect(field.operators!.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('tagsField has multi-select operators', () => {
    const field = tagsField()
    expect(field.operators).toBeDefined()
    expect(field.operators!.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('metaSelectField has select operators', () => {
    const field = metaSelectField('department')
    expect(field.operators).toBeDefined()
    expect(field.operators!.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('overrides can replace operators', () => {
    const field = statusField({ operators: [{ value: 'is', label: 'is' }] })
    expect(field.operators).toHaveLength(1)
  })
})

describe('DEFAULT_FILTER_SCHEMA includes operators', () => {
  it('all fields have operators defined', () => {
    for (const field of DEFAULT_FILTER_SCHEMA) {
      expect(field.operators, `${field.key} missing operators`).toBeDefined()
    }
  })

  it('categories field has multi-select operators', () => {
    const field = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'categories')!
    expect(field.operators!.map(o => o.value)).toEqual(['is', 'is_not'])
  })

  it('dateRange field has date-range operators', () => {
    const field = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'dateRange')!
    expect(field.operators!.map(o => o.value)).toEqual(['between', 'before', 'after'])
  })

  it('search field has text operators', () => {
    const field = DEFAULT_FILTER_SCHEMA.find(f => f.key === 'search')!
    expect(field.operators!.map(o => o.value)).toEqual(['contains', 'not_contains', 'is'])
  })
})

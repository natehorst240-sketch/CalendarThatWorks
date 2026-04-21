/**
 * Template interpolation — unit specs (issue #223 Phase 4).
 */
import { describe, it, expect } from 'vitest'
import { interpolateTemplate, tryInterpolateTemplate, TemplateError } from '../templateInterpolate'

describe('interpolateTemplate — plain passthrough', () => {
  it('returns strings with no tokens unchanged', () => {
    expect(interpolateTemplate('hello world', {})).toBe('hello world')
    expect(interpolateTemplate('', {})).toBe('')
  })

  it('does not interpret single braces', () => {
    expect(interpolateTemplate('{ not a token }', {})).toBe('{ not a token }')
  })
})

describe('interpolateTemplate — expression tokens', () => {
  it('substitutes a dotted path', () => {
    const out = interpolateTemplate('Hello {{ actor.name }}', { actor: { name: 'Alice' } })
    expect(out).toBe('Hello Alice')
  })

  it('substitutes multiple tokens in one template', () => {
    const out = interpolateTemplate(
      '{{ actor.role }}: {{ event.title }} costs ${{ event.cost }}',
      { actor: { role: 'manager' }, event: { title: 'Retreat', cost: 1200 } },
    )
    expect(out).toBe('manager: Retreat costs $1200')
  })

  it('tolerates whitespace inside braces', () => {
    expect(interpolateTemplate('{{name}}', { name: 'x' })).toBe('x')
    expect(interpolateTemplate('{{  name  }}', { name: 'x' })).toBe('x')
  })

  it('supports arithmetic and comparisons (same grammar as condition nodes)', () => {
    expect(interpolateTemplate('Total: {{ qty * price }}', { qty: 3, price: 5 })).toBe('Total: 15')
    expect(interpolateTemplate('Over cap? {{ cost > 500 }}', { cost: 1000 })).toBe('Over cap? true')
  })

  it('stringifies numbers, booleans, null consistently', () => {
    expect(interpolateTemplate('{{ x }}', { x: 0 })).toBe('0')
    expect(interpolateTemplate('{{ x }}', { x: false })).toBe('false')
    expect(interpolateTemplate('{{ x }}', { x: null })).toBe('null')
  })
})

describe('interpolateTemplate — escapes', () => {
  it('renders \\{\\{ as literal {{', () => {
    expect(interpolateTemplate('\\{\\{ not a token \\}\\}', {})).toBe('{{ not a token }}')
  })

  it('mixes literal and real tokens', () => {
    const out = interpolateTemplate('\\{\\{raw\\}\\} vs {{ name }}', { name: 'Alice' })
    expect(out).toBe('{{raw}} vs Alice')
  })
})

describe('interpolateTemplate — errors', () => {
  it('throws TemplateError on unterminated token', () => {
    expect(() => interpolateTemplate('hi {{ name', { name: 'x' })).toThrow(TemplateError)
  })

  it('throws TemplateError on empty token', () => {
    expect(() => interpolateTemplate('hi {{ }}', {})).toThrow(TemplateError)
  })

  it('wraps expression errors with token context', () => {
    try {
      interpolateTemplate('Cost: {{ event.cost }}', {})
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateError)
      const te = err as TemplateError
      expect(te.token).toContain('event.cost')
      expect(te.position).toBe(6)
      expect(te.cause?.name).toBe('ExpressionError')
    }
  })
})

describe('tryInterpolateTemplate', () => {
  it('returns ok result when successful', () => {
    const r = tryInterpolateTemplate('Hi {{ n }}', { n: 'x' }) as { ok: true; value: string }
    expect(r.ok).toBe(true)
    expect(r.value).toBe('Hi x')
  })

  it('returns error result instead of throwing', () => {
    const r = tryInterpolateTemplate('broken {{', {}) as { ok: false; error: TemplateError }
    expect(r.ok).toBe(false)
    expect(r.error).toBeInstanceOf(TemplateError)
  })
})

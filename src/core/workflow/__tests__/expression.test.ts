/**
 * Expression evaluator — unit specs (issue #219 Phase 1).
 */
import { describe, it, expect } from 'vitest'
import { evaluate, evaluateBool, ExpressionError } from '../expression'

const vars = {
  event: { cost: 750, duration_hours: 6, title: 'Quarterly review' },
  actor: { role: 'manager' },
  category: 'training',
  cheap: true,
  count: 0,
}

describe('evaluate — literals', () => {
  it('evaluates numbers', () => expect(evaluate('42', {})).toBe(42))
  it('evaluates decimals', () => expect(evaluate('1.5', {})).toBe(1.5))
  it('evaluates single- and double-quoted strings', () => {
    expect(evaluate('"hi"', {})).toBe('hi')
    expect(evaluate("'hi'", {})).toBe('hi')
  })
  it('evaluates booleans and null', () => {
    expect(evaluate('true', {})).toBe(true)
    expect(evaluate('false', {})).toBe(false)
    expect(evaluate('null', {})).toBe(null)
  })
})

describe('evaluate — dotted identifiers', () => {
  it('resolves a top-level name', () => expect(evaluate('category', vars)).toBe('training'))
  it('resolves a nested dotted path', () => expect(evaluate('event.cost', vars)).toBe(750))
  it('throws on an unknown path', () => {
    expect(() => evaluate('event.nonexistent', vars)).toThrow(ExpressionError)
  })
})

describe('evaluate — comparisons and logic', () => {
  it('numeric comparisons work', () => {
    expect(evaluate('event.cost > 500', vars)).toBe(true)
    expect(evaluate('event.cost < 100', vars)).toBe(false)
    expect(evaluate('event.duration_hours >= 6', vars)).toBe(true)
  })

  it('equality is strict', () => {
    expect(evaluate('actor.role == "manager"', vars)).toBe(true)
    expect(evaluate('actor.role != "director"', vars)).toBe(true)
  })

  it('short-circuits && on false', () => {
    // event.bogus would throw if evaluated; && should short-circuit.
    expect(evaluate('false && event.bogus', vars)).toBe(false)
  })

  it('short-circuits || on true', () => {
    expect(evaluate('true || event.bogus', vars)).toBe(true)
  })

  it('combines logic and comparison', () => {
    expect(evaluate('event.cost > 500 && event.duration_hours > 4', vars)).toBe(true)
    expect(evaluate('event.cost > 1000 || actor.role == "manager"', vars)).toBe(true)
  })
})

describe('evaluate — arithmetic and unary', () => {
  it('adds, subtracts, multiplies, divides', () => {
    expect(evaluate('event.cost - 250', vars)).toBe(500)
    expect(evaluate('event.duration_hours * 2 + 1', vars)).toBe(13)
    expect(evaluate('event.cost / 2', vars)).toBe(375)
  })

  it('respects precedence', () => {
    // 1 + 2*3 should be 7, not 9.
    expect(evaluate('1 + 2 * 3', {})).toBe(7)
  })

  it('concatenates strings with +', () => {
    expect(evaluate('"hello " + actor.role', vars)).toBe('hello manager')
  })

  it('supports unary minus and not', () => {
    expect(evaluate('-event.cost', vars)).toBe(-750)
    expect(evaluate('!cheap', vars)).toBe(false)
  })

  it('supports parenthesized grouping', () => {
    expect(evaluate('(1 + 2) * 3', {})).toBe(9)
  })
})

describe('evaluate — errors', () => {
  it('throws on unterminated strings', () => {
    expect(() => evaluate('"oops', {})).toThrow(ExpressionError)
  })
  it('throws on unexpected trailing tokens', () => {
    expect(() => evaluate('1 2', {})).toThrow(ExpressionError)
  })
  it('throws on unknown operators', () => {
    expect(() => evaluate('1 & 2', {})).toThrow(ExpressionError)
  })
  it('does NOT allow function calls', () => {
    expect(() => evaluate('console.log(1)', {})).toThrow(ExpressionError)
  })
})

describe('evaluateBool', () => {
  it('returns true for truthy values', () => {
    expect(evaluateBool('1', {})).toBe(true)
    expect(evaluateBool('"x"', {})).toBe(true)
    expect(evaluateBool('event.cost > 0', vars)).toBe(true)
  })

  it('returns false for falsy values', () => {
    expect(evaluateBool('0', {})).toBe(false)
    expect(evaluateBool('""', {})).toBe(false)
    expect(evaluateBool('null', {})).toBe(false)
    expect(evaluateBool('count', vars)).toBe(false)
  })
})

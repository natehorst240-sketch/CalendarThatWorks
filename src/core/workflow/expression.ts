/**
 * Safe expression evaluator for workflow conditions — issue #219, Phase 1.
 *
 * Supports a bounded subset that is safe to execute on owner-authored
 * strings:
 *
 *   literals   123   1.5   "text"   'text'   true   false   null
 *   dotted     event.cost   actor.role   category
 *   unary      !x   -x
 *   arith      + - * /   (left-assoc, number-typed)
 *   compare    == != < <= > >=   (strict equality, numeric comparisons)
 *   logical    && ||   (short-circuit)
 *   grouping   ( ... )
 *
 * Explicitly unsupported: function calls, indexing, regex, mutation,
 * template strings. The evaluator throws `ExpressionError` on malformed
 * input or undefined paths so a bad workflow fails loudly rather than
 * silently defaulting.
 *
 * Not a full JS parser — ~220 lines, dependency-free, purpose-built.
 */

// ─── Public types ─────────────────────────────────────────────────────────

export type ExpressionValue = number | string | boolean | null

/**
 * Classification of `ExpressionError` causes. Callers match on `kind`
 * instead of string-sniffing `message` so validator / UI code stays
 * decoupled from error wording.
 */
export type ExpressionErrorKind =
  | 'syntax'
  | 'undefined-variable'
  | 'non-object'
  | 'type'
  | 'unknown-operator'
  | 'unsupported-value'

export class ExpressionError extends Error {
  readonly kind: ExpressionErrorKind
  readonly position?: number | undefined
  constructor(
    message: string,
    kindOrPosition?: ExpressionErrorKind | number,
    position?: number,
  ) {
    // Back-compat: old signature (message, position?: number) still works.
    let kind: ExpressionErrorKind = 'syntax'
    let pos: number | undefined
    if (typeof kindOrPosition === 'number') {
      pos = kindOrPosition
    } else if (typeof kindOrPosition === 'string') {
      kind = kindOrPosition
      pos = position
    }
    super(pos !== undefined ? `${message} (at ${pos})` : message)
    this.name = 'ExpressionError'
    this.kind = kind
    this.position = pos
  }
}

// ─── Tokenizer ────────────────────────────────────────────────────────────

type TokenType =
  | 'number' | 'string' | 'ident'
  | 'op' | 'lparen' | 'rparen' | 'eof'

interface Token {
  readonly type: TokenType
  readonly value: string
  readonly pos: number
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    // i < src.length is guaranteed by the outer while loop.
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    const start = i

    // Number
    const nextCh = src[i + 1]
    if ((c >= '0' && c <= '9') || (c === '.' && nextCh !== undefined && nextCh >= '0' && nextCh <= '9')) {
      let j = i
      while (j < src.length) {
        const cj = src[j]!
        if (!((cj >= '0' && cj <= '9') || cj === '.')) break
        j++
      }
      tokens.push({ type: 'number', value: src.slice(i, j), pos: start })
      i = j
      continue
    }

    // String (single or double quotes, no escapes beyond \\ and the quote char)
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      let out = ''
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const next = src[j + 1]!
          out += next === 'n' ? '\n' : next === 't' ? '\t' : next
          j += 2
        } else {
          out += src[j]!
          j++
        }
      }
      if (j >= src.length) throw new ExpressionError('Unterminated string', start)
      tokens.push({ type: 'string', value: out, pos: start })
      i = j + 1
      continue
    }

    // Identifier or reserved word
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i
      while (j < src.length) {
        const ch = src[j]!
        const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
                        (ch >= '0' && ch <= '9') || ch === '_' || ch === '.'
        if (!isAlnum) break
        j++
      }
      tokens.push({ type: 'ident', value: src.slice(i, j), pos: start })
      i = j
      continue
    }

    // Parens
    if (c === '(') { tokens.push({ type: 'lparen', value: c, pos: start }); i++; continue }
    if (c === ')') { tokens.push({ type: 'rparen', value: c, pos: start }); i++; continue }

    // Operators (longest match first)
    const two = src.slice(i, i + 2)
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' ||
        two === '&&' || two === '||') {
      tokens.push({ type: 'op', value: two, pos: start })
      i += 2
      continue
    }
    if ('+-*/<>!'.includes(c)) {
      tokens.push({ type: 'op', value: c, pos: start })
      i++
      continue
    }

    throw new ExpressionError(`Unexpected character "${c}"`, i)
  }
  tokens.push({ type: 'eof', value: '', pos: src.length })
  return tokens
}

// ─── Parser (Pratt-style with explicit precedence) ────────────────────────

type AstNode =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'ident'; path: readonly string[] }
  | { kind: 'unary'; op: '!' | '-'; expr: AstNode }
  | { kind: 'binary'; op: string; left: AstNode; right: AstNode }

interface ParseState {
  readonly tokens: readonly Token[]
  pos: number
}

function peek(s: ParseState): Token {
  const t = s.tokens[s.pos]
  if (t === undefined) throw new ExpressionError('Unexpected end of expression', 'syntax', s.pos)
  return t
}
function advance(s: ParseState): Token {
  const t = s.tokens[s.pos++]
  if (t === undefined) throw new ExpressionError('Unexpected end of expression', 'syntax', s.pos - 1)
  return t
}

function parseExpr(s: ParseState): AstNode { return parseOr(s) }

function parseOr(s: ParseState): AstNode {
  let left = parseAnd(s)
  while (peek(s).type === 'op' && peek(s).value === '||') {
    advance(s)
    left = { kind: 'binary', op: '||', left, right: parseAnd(s) }
  }
  return left
}

function parseAnd(s: ParseState): AstNode {
  let left = parseEquality(s)
  while (peek(s).type === 'op' && peek(s).value === '&&') {
    advance(s)
    left = { kind: 'binary', op: '&&', left, right: parseEquality(s) }
  }
  return left
}

function parseEquality(s: ParseState): AstNode {
  let left = parseCompare(s)
  while (peek(s).type === 'op' && (peek(s).value === '==' || peek(s).value === '!=')) {
    const op = advance(s).value
    left = { kind: 'binary', op, left, right: parseCompare(s) }
  }
  return left
}

function parseCompare(s: ParseState): AstNode {
  let left = parseAdd(s)
  while (peek(s).type === 'op' &&
         (peek(s).value === '<' || peek(s).value === '<=' ||
          peek(s).value === '>' || peek(s).value === '>=')) {
    const op = advance(s).value
    left = { kind: 'binary', op, left, right: parseAdd(s) }
  }
  return left
}

function parseAdd(s: ParseState): AstNode {
  let left = parseMul(s)
  while (peek(s).type === 'op' && (peek(s).value === '+' || peek(s).value === '-')) {
    const op = advance(s).value
    left = { kind: 'binary', op, left, right: parseMul(s) }
  }
  return left
}

function parseMul(s: ParseState): AstNode {
  let left = parseUnary(s)
  while (peek(s).type === 'op' && (peek(s).value === '*' || peek(s).value === '/')) {
    const op = advance(s).value
    left = { kind: 'binary', op, left, right: parseUnary(s) }
  }
  return left
}

function parseUnary(s: ParseState): AstNode {
  if (peek(s).type === 'op' && (peek(s).value === '!' || peek(s).value === '-')) {
    const op = advance(s).value as '!' | '-'
    return { kind: 'unary', op, expr: parseUnary(s) }
  }
  return parsePrimary(s)
}

function parsePrimary(s: ParseState): AstNode {
  const t = advance(s)
  if (t.type === 'number') {
    const n = Number(t.value)
    if (Number.isNaN(n)) throw new ExpressionError(`Bad number "${t.value}"`, t.pos)
    return { kind: 'num', value: n }
  }
  if (t.type === 'string') return { kind: 'str', value: t.value }
  if (t.type === 'ident') {
    if (t.value === 'true')  return { kind: 'bool', value: true }
    if (t.value === 'false') return { kind: 'bool', value: false }
    if (t.value === 'null')  return { kind: 'null' }
    return { kind: 'ident', path: t.value.split('.') }
  }
  if (t.type === 'lparen') {
    const e = parseExpr(s)
    const close = advance(s)
    if (close.type !== 'rparen') throw new ExpressionError('Expected ")"', close.pos)
    return e
  }
  throw new ExpressionError(`Unexpected token "${t.value}"`, t.pos)
}

// ─── Evaluator ────────────────────────────────────────────────────────────

function resolvePath(
  vars: Readonly<Record<string, unknown>>,
  path: readonly string[],
): ExpressionValue {
  let cur: unknown = vars
  for (const part of path) {
    if (cur === null || typeof cur !== 'object') {
      throw new ExpressionError(`Cannot resolve "${path.join('.')}" — non-object at "${part}"`, 'non-object')
    }
    cur = (cur as Record<string, unknown>)[part]
    if (cur === undefined) {
      throw new ExpressionError(`Undefined variable "${path.join('.')}"`, 'undefined-variable')
    }
  }
  if (cur === null) return null
  const t = typeof cur
  if (t === 'string' || t === 'number' || t === 'boolean') return cur as ExpressionValue
  throw new ExpressionError(`Unsupported value type for "${path.join('.')}": ${t}`, 'unsupported-value')
}

function toNumber(v: ExpressionValue, op: string): number {
  if (typeof v === 'number') return v
  throw new ExpressionError(`Operator "${op}" requires a number, got ${typeof v}`, 'type')
}

function evalAst(
  node: AstNode,
  vars: Readonly<Record<string, unknown>>,
): ExpressionValue {
  switch (node.kind) {
    case 'num':  return node.value
    case 'str':  return node.value
    case 'bool': return node.value
    case 'null': return null
    case 'ident': return resolvePath(vars, node.path)
    case 'unary': {
      const v = evalAst(node.expr, vars)
      if (node.op === '!') return !truthy(v)
      return -toNumber(v, '-')
    }
    case 'binary': {
      if (node.op === '&&') return truthy(evalAst(node.left, vars)) ? evalAst(node.right, vars) : false
      if (node.op === '||') return truthy(evalAst(node.left, vars)) ? evalAst(node.left, vars) : evalAst(node.right, vars)
      const l = evalAst(node.left, vars)
      const r = evalAst(node.right, vars)
      switch (node.op) {
        case '==': return l === r
        case '!=': return l !== r
        case '<':  return toNumber(l, '<')  <  toNumber(r, '<')
        case '<=': return toNumber(l, '<=') <= toNumber(r, '<=')
        case '>':  return toNumber(l, '>')  >  toNumber(r, '>')
        case '>=': return toNumber(l, '>=') >= toNumber(r, '>=')
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r)
          return toNumber(l, '+') + toNumber(r, '+')
        case '-':  return toNumber(l, '-') - toNumber(r, '-')
        case '*':  return toNumber(l, '*') * toNumber(r, '*')
        case '/':  return toNumber(l, '/') / toNumber(r, '/')
      }
      throw new ExpressionError(`Unknown operator "${node.op}"`, 'unknown-operator')
    }
  }
}

function truthy(v: ExpressionValue): boolean {
  if (v === null || v === false) return false
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v.length > 0
  return Boolean(v)
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Parse and evaluate `expr` against `vars`. Throws `ExpressionError`
 * on malformed input or undefined paths.
 */
export function evaluate(
  expr: string,
  vars: Readonly<Record<string, unknown>>,
): ExpressionValue {
  const tokens = tokenize(expr)
  const state: ParseState = { tokens, pos: 0 }
  const ast = parseExpr(state)
  if (peek(state).type !== 'eof') {
    throw new ExpressionError(`Unexpected trailing token "${peek(state).value}"`, peek(state).pos)
  }
  return evalAst(ast, vars)
}

/** Convenience: evaluate + coerce to boolean via workflow-truthy rules. */
export function evaluateBool(
  expr: string,
  vars: Readonly<Record<string, unknown>>,
): boolean {
  return truthy(evaluate(expr, vars))
}

/**
 * Notify-template interpolation — issue #223, Phase 4.
 *
 * Notify nodes carry an optional `template` string that the host
 * renders into a user-facing message. Templates embed workflow
 * variables with `{{ expr }}` tokens that delegate to the workflow
 * expression evaluator (see `expression.ts`) — so they support the
 * same dotted-path reads, literals, and arithmetic that condition
 * nodes use, with zero new grammar.
 *
 * Grammar:
 *   "Hello {{ actor.name }}, cost is {{ event.cost }}"
 *   "Literal braces: \{\{ not a token \}\}"
 *
 * Escape: a backslash before `{{` or `}}` produces literal double
 * braces and is NOT evaluated. The backslash itself is consumed.
 *
 * Values are stringified via `String(value)`; `null` renders as the
 * string `"null"` so templates don't silently drop missing values.
 * Expression errors (undefined paths, syntax) surface as
 * `TemplateError` with the offending `{{…}}` and its position so the
 * validator + UI can highlight the problem.
 */
import { evaluate, ExpressionError } from './expression'

export class TemplateError extends Error {
  readonly position: number
  readonly token: string
  readonly cause?: Error
  constructor(message: string, position: number, token: string, cause?: Error) {
    super(message)
    this.name = 'TemplateError'
    this.position = position
    this.token = token
    if (cause) this.cause = cause
  }
}

/**
 * Interpolate `{{ expr }}` tokens in `template` against `variables`.
 * Throws `TemplateError` if any embedded expression fails to parse
 * or resolve. A template with no `{{` returns unchanged.
 */
export function interpolateTemplate(
  template: string,
  variables: Readonly<Record<string, unknown>>,
): string {
  let out = ''
  let i = 0
  while (i < template.length) {
    const ch = template[i]

    // Escape sequences: \{\{ → literal "{{", \}\} → literal "}}".
    if (ch === '\\' && template.startsWith('\\{\\{', i)) {
      out += '{{'
      i += 4
      continue
    }
    if (ch === '\\' && template.startsWith('\\}\\}', i)) {
      out += '}}'
      i += 4
      continue
    }

    if (template.startsWith('{{', i)) {
      const end = template.indexOf('}}', i + 2)
      if (end < 0) {
        throw new TemplateError(
          `Unterminated template token at ${i}`,
          i,
          template.slice(i),
        )
      }
      const raw = template.slice(i + 2, end)
      const expr = raw.trim()
      if (expr.length === 0) {
        throw new TemplateError(
          `Empty template token at ${i}`,
          i,
          template.slice(i, end + 2),
        )
      }
      try {
        const value = evaluate(expr, variables)
        out += value === null ? 'null' : String(value)
      } catch (err) {
        const token = template.slice(i, end + 2)
        if (err instanceof ExpressionError) {
          throw new TemplateError(
            `Expression error in "${token}" at ${i}: ${err.message}`,
            i,
            token,
            err,
          )
        }
        throw new TemplateError(
          `Template evaluation failed for "${token}" at ${i}: ${String(err)}`,
          i,
          token,
        )
      }
      i = end + 2
      continue
    }

    out += ch
    i++
  }
  return out
}

/**
 * Non-throwing variant: returns either the rendered string or the
 * first `TemplateError`. Convenient for validator code paths that
 * want to collect issues rather than abort.
 */
export function tryInterpolateTemplate(
  template: string,
  variables: Readonly<Record<string, unknown>>,
): { ok: true; value: string } | { ok: false; error: TemplateError } {
  try {
    return { ok: true, value: interpolateTemplate(template, variables) }
  } catch (err) {
    if (err instanceof TemplateError) return { ok: false, error: err }
    throw err
  }
}

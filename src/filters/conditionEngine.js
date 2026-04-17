/**
 * conditionEngine — schema-driven conversion between visual conditions and filter state.
 *
 * A "condition" is a single row from AdvancedFilterBuilder:
 *   { id, field, operator, value, logic }
 * where `field` matches a FilterField.key in the schema.
 */

// ── conditionsToFilters ───────────────────────────────────────────────────────

/**
 * Convert an array of visual conditions into a filter state object.
 *
 * Rules per type/operator:
 *   multi-select + is         → accumulate value into a Set at result[field.key]
 *   select       + is         → set result[field.key] = value directly (last wins)
 *   text         + contains   → set result[field.key] = value (last wins)
 *   text         + is         → set result[field.key] = value (last wins)
 *   any          + is_not     → accumulate into { __not: true, values: Set }
 *   any          + not_contains → accumulate into { __not: true, values: Set }
 *   unknown field/operator    → skipped gracefully
 */
export function conditionsToFilters(conditions, schema) {
  const schemaMap = new Map(schema.map(f => [f.key, f]))
  const result = {}

  for (const cond of conditions) {
    const raw = cond.value
    const val = typeof raw === 'string' ? raw.trim() : raw
    if (!val) continue

    const field = schemaMap.get(cond.field)
    if (!field) continue

    const { operator } = cond

    if (operator === 'is_not' || operator === 'not_contains') {
      const existing = result[field.key]
      if (existing && existing.__not === true) {
        existing.values.add(val)
      } else {
        result[field.key] = { __not: true, values: new Set([val]) }
      }
      continue
    }

    if (field.type === 'multi-select') {
      if (operator === 'is') {
        const existing = result[field.key]
        if (existing instanceof Set) {
          existing.add(val)
        } else {
          result[field.key] = new Set([val])
        }
      }
    } else if (field.type === 'select') {
      if (operator === 'is') {
        result[field.key] = val
      }
    } else if (field.type === 'text') {
      if (operator === 'contains' || operator === 'is') {
        result[field.key] = val
      }
    }
    // date-range, boolean, custom: no operator-aware mapping at this stage
  }

  return result
}

// ── conditionsMatchSchema ─────────────────────────────────────────────────────

/**
 * Validate that every condition's field key exists in the schema.
 * Returns { valid: boolean, invalidKeys: string[] }.
 */
export function conditionsMatchSchema(conditions, schema) {
  const knownKeys = new Set(schema.map(f => f.key))
  const invalidKeys = []

  for (const cond of conditions) {
    if (!knownKeys.has(cond.field) && !invalidKeys.includes(cond.field)) {
      invalidKeys.push(cond.field)
    }
  }

  return { valid: invalidKeys.length === 0, invalidKeys }
}

/**
 * ResourceQuery — typed DSL for v2 resource pools (issue #386).
 *
 * Pools today are static lists of `memberIds`. v2 pools can additionally
 * (or exclusively) describe "what kind of resource I need" as a query
 * the resolver evaluates against the live `EngineResource` registry.
 *
 * The DSL is intentionally narrow and structural — no string parsing,
 * no expression language. Hosts compose plain objects; the evaluator
 * walks them. The `path` field accepts:
 *
 *   - top-level `EngineResource` keys: `id`, `name`, `tenantId`,
 *     `capacity`, `color`, `timezone`,
 *   - `meta.<dot.path>` for arbitrary host-defined attributes.
 *
 * This first slice deliberately omits distance / geo filters and the
 * `closest` strategy — those need a coordinate model and warrant their
 * own follow-up. Filterable types here: string, number, boolean, null.
 */

export type ResourceQueryValue = string | number | boolean | null

export type ResourceQuery =
  /** Strict equality after path resolution. Missing path → false. */
  | { readonly op: 'eq';     readonly path: string; readonly value: ResourceQueryValue }
  /** Strict inequality. Missing path is treated as "not equal". */
  | { readonly op: 'neq';    readonly path: string; readonly value: ResourceQueryValue }
  /** Path resolves to one of the listed values. Missing path → false. */
  | { readonly op: 'in';     readonly path: string; readonly values: readonly ResourceQueryValue[] }
  /** Numeric `>`. Path must resolve to a finite number; otherwise false. */
  | { readonly op: 'gt';     readonly path: string; readonly value: number }
  /** Numeric `>=`. Path must resolve to a finite number; otherwise false. */
  | { readonly op: 'gte';    readonly path: string; readonly value: number }
  /** Numeric `<`. Path must resolve to a finite number; otherwise false. */
  | { readonly op: 'lt';     readonly path: string; readonly value: number }
  /** Numeric `<=`. Path must resolve to a finite number; otherwise false. */
  | { readonly op: 'lte';    readonly path: string; readonly value: number }
  /** Path resolves to anything other than `undefined`. */
  | { readonly op: 'exists'; readonly path: string }
  /** Logical AND. Empty clauses → true (vacuously). */
  | { readonly op: 'and';    readonly clauses: readonly ResourceQuery[] }
  /** Logical OR. Empty clauses → false. */
  | { readonly op: 'or';     readonly clauses: readonly ResourceQuery[] }
  /** Logical NOT. */
  | { readonly op: 'not';    readonly clause: ResourceQuery }

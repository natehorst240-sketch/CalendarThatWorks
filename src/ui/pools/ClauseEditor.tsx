/**
 * ClauseEditor — recursive editor for a single `ResourceQuery` node
 * (issue #386 Level 3 advanced rules).
 *
 * Renders an op picker plus the inputs appropriate to whichever op
 * is active. Composite ops (`and` / `or` / `not`) render their
 * children recursively with add / remove controls.
 *
 * Pure / controlled — takes a clause and an `onChange(next)` callback.
 * The component owns no state of its own; the parent (typically
 * `AdvancedRulesEditor`) holds the tree.
 *
 * Out of scope deliberately: drag-drop reordering of composite
 * children. Path autocomplete and depth-line nesting visuals land
 * via opt-in props (`pathSuggestions`) and CSS rails respectively.
 */
import { useId, type ChangeEvent } from 'react'
import type {
  ResourceQuery, ResourceQueryValue, DistanceFrom,
} from '../../core/pools/poolQuerySchema'
import styles from './ClauseEditor.module.css'

export interface ClauseEditorProps {
  readonly clause: ResourceQuery
  readonly onChange: (next: ResourceQuery) => void
  /** Hide the op picker (used by the not-clause sub-renderer). */
  readonly hideOpPicker?: boolean
  /**
   * Recursion depth; bounds for visual indentation and a hard cap
   * at 5 to keep the DOM bounded. The hard cap can be raised once
   * the editor has scrollable nesting indicators (follow-up).
   */
  readonly depth?: number
  /**
   * Optional path-autocomplete suggestions — typically the output of
   * `derivePathSuggestions(resources)`. When provided, the path
   * input renders an HTML5 `<datalist>` so users can pick or
   * progressively type known paths. The list is informational only;
   * the editor still accepts any string, so custom paths still work.
   */
  readonly pathSuggestions?: readonly string[] | undefined
  /**
   * Optional set of paths that don't resolve on any live resource —
   * typically `validateClausePaths(query, resources).byPath`. When a
   * leaf's `path` is in this set, the editor renders a small ⚠
   * indicator next to the input. Informational only: the editor
   * still accepts the path so forward-looking schemas keep working.
   */
  readonly unresolvedPaths?: ReadonlySet<string> | undefined
  /**
   * Internal — the root editor passes its datalist id to every
   * nested clause so every path input references the same
   * `<datalist>` (which only the root renders). Hosts shouldn't
   * pass this; recursive children do.
   */
  readonly datalistId?: string | undefined
}

const ALL_OPS: readonly { value: ResourceQuery['op']; label: string; group: 'logic' | 'compare' | 'set' | 'geo' }[] = [
  { value: 'and',    label: 'AND (all of)',  group: 'logic' },
  { value: 'or',     label: 'OR (any of)',   group: 'logic' },
  { value: 'not',    label: 'NOT',           group: 'logic' },
  { value: 'eq',     label: '= equals',      group: 'compare' },
  { value: 'neq',    label: '≠ not equal',   group: 'compare' },
  { value: 'gt',     label: '> greater than', group: 'compare' },
  { value: 'gte',    label: '≥ at least',    group: 'compare' },
  { value: 'lt',     label: '< less than',   group: 'compare' },
  { value: 'lte',    label: '≤ at most',     group: 'compare' },
  { value: 'in',     label: 'is one of',     group: 'set' },
  { value: 'exists', label: 'has value',     group: 'set' },
  { value: 'within', label: 'within radius', group: 'geo' },
]

export default function ClauseEditor({
  clause, onChange, hideOpPicker, depth = 0, pathSuggestions, unresolvedPaths,
  datalistId: parentDatalistId,
}: ClauseEditorProps): JSX.Element {
  // Hard cap to keep nesting from spiralling. The user can lift it by
  // editing JSON externally; the editor just refuses to add more.
  const atDepthCap = depth >= 5
  // Reuse the parent's datalist id when this editor is nested so
  // every path input across the recursive tree resolves to the
  // single `<datalist>` rendered at the root. The root generates
  // a fresh id from useId so multiple editor instances on the
  // same page don't collide. Strip colons from useId's output
  // (`:r1:`) — they're valid in HTML id attributes but happy-dom
  // (and some legacy DOM consumers) reject them when querying via
  // `input.list`.
  const ownDatalistId = `clause-paths-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const datalistId = parentDatalistId ?? ownDatalistId
  const isRoot = !parentDatalistId

  return (
    <div className={styles['clause']} data-depth={depth} data-op={clause.op}>
      {!hideOpPicker && (
        <select
          className={styles['opPicker']}
          value={clause.op}
          aria-label="Operation"
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange(reshapeForOp(clause, e.target.value as ResourceQuery['op']))
          }
        >
          <optgroup label="Logic">
            {ALL_OPS.filter(o => o.group === 'logic').map(o =>
              <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Compare">
            {ALL_OPS.filter(o => o.group === 'compare').map(o =>
              <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Set">
            {ALL_OPS.filter(o => o.group === 'set').map(o =>
              <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Geo">
            {ALL_OPS.filter(o => o.group === 'geo').map(o =>
              <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        </select>
      )}

      {(clause.op === 'and' || clause.op === 'or') && (
        <CompositeBody
          clause={clause}
          onChange={onChange}
          depth={depth}
          atCap={atDepthCap}
          pathSuggestions={pathSuggestions}
          unresolvedPaths={unresolvedPaths}
          datalistId={datalistId}
        />
      )}

      {clause.op === 'not' && (
        <NotBody clause={clause} onChange={onChange} depth={depth} pathSuggestions={pathSuggestions} unresolvedPaths={unresolvedPaths} datalistId={datalistId} />
      )}

      {(clause.op === 'eq' || clause.op === 'neq') && (
        <EqBody clause={clause} onChange={onChange} datalistId={datalistId} unresolvedPaths={unresolvedPaths} />
      )}

      {(clause.op === 'gt' || clause.op === 'gte' || clause.op === 'lt' || clause.op === 'lte') && (
        <NumericBody clause={clause} onChange={onChange} datalistId={datalistId} unresolvedPaths={unresolvedPaths} />
      )}

      {clause.op === 'in' && (
        <InBody clause={clause} onChange={onChange} datalistId={datalistId} unresolvedPaths={unresolvedPaths} />
      )}

      {clause.op === 'exists' && (
        <ExistsBody clause={clause} onChange={onChange} datalistId={datalistId} unresolvedPaths={unresolvedPaths} />
      )}

      {clause.op === 'within' && (
        <WithinBody clause={clause} onChange={onChange} datalistId={datalistId} unresolvedPaths={unresolvedPaths} />
      )}

      {/* The datalist lives on the outer container so every leaf
          body in this editor instance shares a single suggestion
          list. Rendered only once per editor instance. */}
      {pathSuggestions && pathSuggestions.length > 0 && isRoot && (
        <datalist id={datalistId}>
          {pathSuggestions.map(p => <option key={p} value={p} />)}
        </datalist>
      )}
    </div>
  )
}

// ─── Bodies ────────────────────────────────────────────────────────────────

function CompositeBody({
  clause, onChange, depth, atCap, pathSuggestions, unresolvedPaths, datalistId,
}: {
  clause: Extract<ResourceQuery, { op: 'and' | 'or' }>
  onChange: (next: ResourceQuery) => void
  depth: number
  atCap: boolean
  pathSuggestions?: readonly string[] | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
  datalistId: string
}): JSX.Element {
  // Move helpers — out-of-bounds moves are no-ops so the buttons can
  // stay rendered (and disabled at the ends) for stable focus order.
  const moveBy = (i: number, delta: -1 | 1) => {
    const target = i + delta
    if (target < 0 || target >= clause.clauses.length) return
    const next = [...clause.clauses]
    const tmp = next[i]!
    next[i] = next[target]!
    next[target] = tmp
    onChange({ ...clause, clauses: next })
  }
  return (
    <div className={styles['composite']}>
      {clause.clauses.length === 0 && (
        <span className={styles['empty']}>
          {clause.op === 'and' ? 'No sub-rules (matches everything)' : 'No sub-rules (matches nothing)'}
        </span>
      )}
      <ul className={styles['childList']} data-depth-rail="composite">
        {clause.clauses.map((c, i) => (
          <li key={i} className={styles['child']}>
            <ClauseEditor
              clause={c}
              depth={depth + 1}
              pathSuggestions={pathSuggestions}
              unresolvedPaths={unresolvedPaths}
              datalistId={datalistId}
              onChange={(next) => onChange({
                ...clause,
                clauses: clause.clauses.map((existing, j) => j === i ? next : existing),
              })}
            />
            <span className={styles['rowControls']}>
              <button
                type="button"
                className={styles['moveBtn']}
                aria-label={`Move sub-rule ${i + 1} up`}
                disabled={i === 0}
                onClick={() => moveBy(i, -1)}
              >↑</button>
              <button
                type="button"
                className={styles['moveBtn']}
                aria-label={`Move sub-rule ${i + 1} down`}
                disabled={i === clause.clauses.length - 1}
                onClick={() => moveBy(i, 1)}
              >↓</button>
              <button
                type="button"
                className={styles['removeBtn']}
                aria-label={`Remove sub-rule ${i + 1}`}
                onClick={() => onChange({
                  ...clause,
                  clauses: clause.clauses.filter((_, j) => j !== i),
                })}
              >×</button>
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles['addBtn']}
        disabled={atCap}
        title={atCap ? 'Maximum nesting depth reached' : ''}
        onClick={() => onChange({
          ...clause,
          clauses: [...clause.clauses, defaultClause('eq')],
        })}
      >+ Add sub-rule</button>
      {/* Suppress unused-variable warning while we keep datalistId
          on the prop type so future composite-level paths can also
          use it. */}
      {datalistId.length === 0 && null}
    </div>
  )
}

function NotBody({
  clause, onChange, depth, pathSuggestions, unresolvedPaths, datalistId,
}: {
  clause: Extract<ResourceQuery, { op: 'not' }>
  onChange: (next: ResourceQuery) => void
  depth: number
  pathSuggestions?: readonly string[] | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
  datalistId?: string | undefined
}): JSX.Element {
  return (
    <div className={styles['notBody']} data-depth-rail="not">
      <ClauseEditor
        clause={clause.clause}
        depth={depth + 1}
        pathSuggestions={pathSuggestions}
        unresolvedPaths={unresolvedPaths}
        datalistId={datalistId}
        onChange={(inner) => onChange({ ...clause, clause: inner })}
      />
    </div>
  )
}

function EqBody({
  clause, onChange, datalistId, unresolvedPaths,
}: {
  clause: Extract<ResourceQuery, { op: 'eq' | 'neq' }>
  onChange: (next: ResourceQuery) => void
  datalistId?: string | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
}): JSX.Element {
  return (
    <div className={styles['leafBody']}>
      <PathInput value={clause.path} onChange={(path) => onChange({ ...clause, path })} datalistId={datalistId} unresolved={!!(unresolvedPaths && clause.path && unresolvedPaths.has(clause.path))} />
      <ValueInput
        value={clause.value}
        onChange={(value) => onChange({ ...clause, value })}
      />
    </div>
  )
}

function NumericBody({
  clause, onChange, datalistId, unresolvedPaths,
}: {
  clause: Extract<ResourceQuery, { op: 'gt' | 'gte' | 'lt' | 'lte' }>
  onChange: (next: ResourceQuery) => void
  datalistId?: string | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
}): JSX.Element {
  return (
    <div className={styles['leafBody']}>
      <PathInput value={clause.path} onChange={(path) => onChange({ ...clause, path })} datalistId={datalistId} unresolved={!!(unresolvedPaths && clause.path && unresolvedPaths.has(clause.path))} />
      <input
        type="number"
        className={styles['numInput']}
        value={Number.isFinite(clause.value) ? clause.value : 0}
        aria-label="Value"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange({ ...clause, value: Number(e.target.value) })}
      />
    </div>
  )
}

function InBody({
  clause, onChange, datalistId, unresolvedPaths,
}: {
  clause: Extract<ResourceQuery, { op: 'in' }>
  onChange: (next: ResourceQuery) => void
  datalistId?: string | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
}): JSX.Element {
  return (
    <div className={styles['leafBody']}>
      <PathInput value={clause.path} onChange={(path) => onChange({ ...clause, path })} datalistId={datalistId} unresolved={!!(unresolvedPaths && clause.path && unresolvedPaths.has(clause.path))} />
      <input
        type="text"
        className={styles['valuesInput']}
        value={clause.values.join(', ')}
        placeholder="comma-separated"
        aria-label="Values (comma-separated)"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange({
            ...clause,
            values: parseCommaList(e.target.value),
          })}
      />
    </div>
  )
}

function ExistsBody({
  clause, onChange, datalistId, unresolvedPaths,
}: {
  clause: Extract<ResourceQuery, { op: 'exists' }>
  onChange: (next: ResourceQuery) => void
  datalistId?: string | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
}): JSX.Element {
  return (
    <div className={styles['leafBody']}>
      <PathInput value={clause.path} onChange={(path) => onChange({ ...clause, path })} datalistId={datalistId} unresolved={!!(unresolvedPaths && clause.path && unresolvedPaths.has(clause.path))} />
    </div>
  )
}

function WithinBody({
  clause, onChange, datalistId, unresolvedPaths,
}: {
  clause: Extract<ResourceQuery, { op: 'within' }>
  onChange: (next: ResourceQuery) => void
  datalistId?: string | undefined
  unresolvedPaths?: ReadonlySet<string> | undefined
}): JSX.Element {
  const fromKind = clause.from.kind
  const usingMiles = clause.km == null
  return (
    <div className={styles['leafBody']}>
      <PathInput value={clause.path} onChange={(path) => onChange({ ...clause, path })} datalistId={datalistId} unresolved={!!(unresolvedPaths && clause.path && unresolvedPaths.has(clause.path))} />
      <select
        className={styles['fromKindPicker']}
        value={fromKind}
        aria-label="Reference point"
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          const kind = e.target.value as DistanceFrom['kind']
          const next: DistanceFrom = kind === 'point'
            ? { kind: 'point', lat: 0, lon: 0 }
            : { kind: 'proposed' }
          onChange({ ...clause, from: next })
        }}
      >
        <option value="proposed">event location</option>
        <option value="point">fixed point</option>
      </select>
      {fromKind === 'point' && (
        <span className={styles['latLonRow']}>
          <input
            type="number"
            step="any"
            className={styles['numInput']}
            value={clause.from.kind === 'point' ? clause.from.lat : 0}
            aria-label="Latitude"
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({
              ...clause,
              from: { kind: 'point',
                lat: Number(e.target.value),
                lon: clause.from.kind === 'point' ? clause.from.lon : 0 },
            })}
          />
          <input
            type="number"
            step="any"
            className={styles['numInput']}
            value={clause.from.kind === 'point' ? clause.from.lon : 0}
            aria-label="Longitude"
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({
              ...clause,
              from: { kind: 'point',
                lat: clause.from.kind === 'point' ? clause.from.lat : 0,
                lon: Number(e.target.value) },
            })}
          />
        </span>
      )}
      <input
        type="number"
        min={0}
        className={styles['numInput']}
        value={(usingMiles ? clause.miles : clause.km) ?? ''}
        aria-label="Radius"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(setWithinRadius(clause, usingMiles, e.target.value === '' ? undefined : Number(e.target.value)))
        }
      />
      <select
        className={styles['unitPicker']}
        value={usingMiles ? 'mi' : 'km'}
        aria-label="Unit"
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          onChange(setWithinUnit(clause, e.target.value === 'mi'))
        }
      >
        <option value="mi">miles</option>
        <option value="km">km</option>
      </select>
    </div>
  )
}

// ─── Shared inputs ─────────────────────────────────────────────────────────

function PathInput({
  value, onChange, datalistId, unresolved,
}: {
  value: string
  onChange: (v: string) => void
  datalistId?: string | undefined
  /**
   * `true` when the parent has determined this path doesn't resolve
   * on any live resource. Renders a small ⚠ next to the input —
   * informational; doesn't block input.
   */
  unresolved?: boolean
}): JSX.Element {
  return (
    <span className={styles['pathInputWrap']}>
      <input
        type="text"
        className={styles['pathInput']}
        value={value}
        placeholder="meta.capabilities.refrigerated"
        aria-label="Field path"
        list={datalistId}
        aria-invalid={unresolved ? 'true' : undefined}
        data-unresolved={unresolved ? 'true' : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
      {unresolved && (
        <span
          className={styles['pathWarning']}
          role="img"
          aria-label="Path not found on any resource"
          title="This path doesn't resolve on any live resource. Could be a typo, or a forward-looking schema."
          data-testid="clause-path-warning"
        >⚠</span>
      )}
    </span>
  )
}

function ValueInput({
  value, onChange,
}: { value: ResourceQueryValue; onChange: (v: ResourceQueryValue) => void }): JSX.Element {
  // Type picker so the user can pick string / number / boolean / null
  // explicitly — comparators behave very differently for `'80000'`
  // vs `80000`, so we don't infer.
  const kind: 'string' | 'number' | 'boolean' | 'null' =
    value === null ? 'null'
    : typeof value === 'number' ? 'number'
    : typeof value === 'boolean' ? 'boolean'
    : 'string'
  return (
    <span className={styles['valueRow']}>
      <select
        className={styles['valueKind']}
        value={kind}
        aria-label="Value type"
        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
          switch (e.target.value) {
            case 'string':  onChange(typeof value === 'string' ? value : String(value ?? '')); break
            case 'number':  onChange(typeof value === 'number' ? value : 0); break
            case 'boolean': onChange(value === true); break
            case 'null':    onChange(null); break
          }
        }}
      >
        <option value="string">text</option>
        <option value="number">number</option>
        <option value="boolean">true/false</option>
        <option value="null">null</option>
      </select>
      {kind === 'string' && (
        <input
          type="text"
          className={styles['valueInput']}
          value={String(value ?? '')}
          aria-label="Value"
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        />
      )}
      {kind === 'number' && (
        <input
          type="number"
          className={styles['numInput']}
          value={typeof value === 'number' ? value : 0}
          aria-label="Value"
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
        />
      )}
      {kind === 'boolean' && (
        <select
          className={styles['valueKind']}
          value={value === true ? 'true' : 'false'}
          aria-label="Value"
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )}
      {kind === 'null' && <span className={styles['nullPlaceholder']}>(null)</span>}
    </span>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * When the user picks a different op from the dropdown, fold the
 * existing clause's `path` into the new shape if applicable; default
 * everything else. This keeps the user's typed path from disappearing
 * each time they tweak the comparator.
 */
function reshapeForOp(prev: ResourceQuery, op: ResourceQuery['op']): ResourceQuery {
  const path = 'path' in prev ? prev.path : ''
  switch (op) {
    case 'and':    return { op: 'and',    clauses: 'clauses' in prev ? prev.clauses : [] }
    case 'or':     return { op: 'or',     clauses: 'clauses' in prev ? prev.clauses : [] }
    case 'not':    return { op: 'not',    clause: 'clause' in prev ? prev.clause : defaultClause('eq') }
    case 'eq':     return { op: 'eq',     path, value: 'value' in prev ? prev.value as ResourceQueryValue : '' }
    case 'neq':    return { op: 'neq',    path, value: 'value' in prev ? prev.value as ResourceQueryValue : '' }
    case 'gt':     return { op: 'gt',     path, value: numericFrom(prev) }
    case 'gte':    return { op: 'gte',    path, value: numericFrom(prev) }
    case 'lt':     return { op: 'lt',     path, value: numericFrom(prev) }
    case 'lte':    return { op: 'lte',    path, value: numericFrom(prev) }
    case 'in':     return { op: 'in',     path, values: 'values' in prev ? prev.values : [] }
    case 'exists': return { op: 'exists', path }
    case 'within': return {
      op: 'within', path: path || 'meta.location',
      from: { kind: 'proposed' },
      miles: 50,
    }
  }
}

function defaultClause(op: ResourceQuery['op']): ResourceQuery {
  return reshapeForOp({ op: 'eq', path: '', value: '' } as ResourceQuery, op)
}

function numericFrom(prev: ResourceQuery): number {
  if ('value' in prev && typeof prev.value === 'number') return prev.value
  return 0
}

/**
 * Rebuild a `within` clause with the chosen radius set on exactly
 * one unit field. Spreading `{ miles, km: undefined }` leaks an
 * explicit `undefined` into the object, which TypeScript treats
 * differently from the field being absent — so we construct the
 * result without the unwanted property.
 */
function setWithinRadius(
  clause: Extract<ResourceQuery, { op: 'within' }>,
  usingMiles: boolean,
  value: number | undefined,
): ResourceQuery {
  const base = { op: 'within', path: clause.path, from: clause.from } as const
  return value === undefined
    ? base
    : usingMiles
      ? { ...base, miles: value }
      : { ...base, km: value }
}

function setWithinUnit(
  clause: Extract<ResourceQuery, { op: 'within' }>,
  toMiles: boolean,
): ResourceQuery {
  const cur = clause.miles ?? clause.km
  const base = { op: 'within', path: clause.path, from: clause.from } as const
  if (cur === undefined) return base
  return toMiles ? { ...base, miles: cur } : { ...base, km: cur }
}

function parseCommaList(raw: string): readonly ResourceQueryValue[] {
  return raw.split(',').map(s => s.trim()).filter(s => s.length > 0).map((s) => {
    if (s === 'true')  return true
    if (s === 'false') return false
    if (s === 'null')  return null
    const n = Number(s)
    if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(s)) return n
    return s
  })
}

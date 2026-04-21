/**
 * Workflow validator — Phase 2 visual builder.
 *
 * Pure, synchronous check that gates Save in the builder UI and surfaces
 * inline badges per node / edge. Runs against the draft `Workflow` before
 * the user is allowed to persist.
 *
 * Split into `error` (blocks save) and `warning` (surfaced but not
 * blocking). All rules refer exclusively to Phase 1 helpers so the
 * semantic contract cannot drift.
 */
import { evaluate, ExpressionError } from './expression'
import { interpolateTemplate, TemplateError } from './templateInterpolate'
import {
  findNode,
  resolveNextEdge,
  type EdgeGuard,
  type Workflow,
  type WorkflowNode,
} from './workflowSchema'

export type ValidationSeverity = 'error' | 'warning'

export type ValidationCode =
  | 'duplicate-node-id'
  | 'start-node-missing'
  | 'edge-endpoint-missing'
  | 'no-terminal-node'
  | 'unreachable-node'
  | 'dead-end-node'
  | 'multiple-default-edges'
  | 'approval-missing-signal-coverage'
  | 'condition-missing-signal-coverage'
  | 'illegal-guard-for-source'
  | 'expression-syntax'
  | 'terminal-has-outgoing'
  | 'timeout-edge-missing'
  | 'sla-without-on-timeout'
  | 'template-syntax'
  | 'unknown-channel'
  | 'empty-channel'

export interface ValidationIssue {
  readonly code: ValidationCode
  readonly severity: ValidationSeverity
  readonly message: string
  readonly nodeId?: string
  readonly edgeIndex?: number
}

export interface ValidateWorkflowOptions {
  /**
   * Channel ids the host has registered adapters for. When provided,
   * `unknown-channel` warnings flag notify nodes whose `channel` isn't
   * in this list. Omit (or pass empty) to skip the check.
   */
  readonly knownChannels?: readonly string[]
}

export function validateWorkflow(
  workflow: Workflow,
  options: ValidateWorkflowOptions = {},
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const knownChannels = options.knownChannels && options.knownChannels.length > 0
    ? new Set(options.knownChannels)
    : null

  // 1. unique node ids
  const seen = new Set<string>()
  for (const node of workflow.nodes) {
    if (seen.has(node.id)) {
      issues.push({
        code: 'duplicate-node-id',
        severity: 'error',
        message: `Duplicate node id "${node.id}"`,
        nodeId: node.id,
      })
    }
    seen.add(node.id)
  }

  // 2. startNodeId exists
  if (!findNode(workflow, workflow.startNodeId)) {
    issues.push({
      code: 'start-node-missing',
      severity: 'error',
      message: `Start node "${workflow.startNodeId}" is not in nodes`,
    })
  }

  // 3. edge endpoints resolve
  workflow.edges.forEach((edge, idx) => {
    if (!findNode(workflow, edge.from)) {
      issues.push({
        code: 'edge-endpoint-missing',
        severity: 'error',
        message: `Edge #${idx} source "${edge.from}" is not a node`,
        edgeIndex: idx,
      })
    }
    if (!findNode(workflow, edge.to)) {
      issues.push({
        code: 'edge-endpoint-missing',
        severity: 'error',
        message: `Edge #${idx} target "${edge.to}" is not a node`,
        edgeIndex: idx,
      })
    }
  })

  // 4. at least one terminal
  if (!workflow.nodes.some(n => n.type === 'terminal')) {
    issues.push({
      code: 'no-terminal-node',
      severity: 'error',
      message: 'Workflow needs at least one terminal node',
    })
  }

  // 5. reachability from startNodeId
  const reachable = reachableNodeIds(workflow)
  for (const node of workflow.nodes) {
    if (!reachable.has(node.id) && node.id !== workflow.startNodeId) {
      issues.push({
        code: 'unreachable-node',
        severity: 'warning',
        message: `Node "${node.id}" is not reachable from the start`,
        nodeId: node.id,
      })
    }
  }

  // 6. sink safety — non-terminal node with no outgoing edges
  for (const node of workflow.nodes) {
    if (node.type === 'terminal') continue
    const hasOut = workflow.edges.some(e => e.from === node.id)
    if (!hasOut) {
      issues.push({
        code: 'dead-end-node',
        severity: 'error',
        message: `Node "${node.id}" has no outgoing edges`,
        nodeId: node.id,
      })
    }
  }

  // 7. at most one default edge per source
  const defaultsPerSource = new Map<string, number>()
  for (const edge of workflow.edges) {
    if (edge.when === undefined || edge.when === 'default') {
      defaultsPerSource.set(edge.from, (defaultsPerSource.get(edge.from) ?? 0) + 1)
    }
  }
  for (const [from, count] of defaultsPerSource) {
    if (count > 1) {
      issues.push({
        code: 'multiple-default-edges',
        severity: 'error',
        message: `Node "${from}" has ${count} default edges (max 1)`,
        nodeId: from,
      })
    }
  }

  // 8 & 9. Signal coverage — every signal a node can emit must resolve
  // via `resolveNextEdge` (exact-match OR default edge). Reusing the
  // interpreter's resolver keeps the validator perfectly aligned with
  // runtime semantics.
  for (const node of workflow.nodes) {
    const required = requiredSignalsFor(node)
    for (const signal of required) {
      if (!resolveNextEdge(workflow, node.id, signal)) {
        const code: ValidationCode =
          node.type === 'approval'
            ? 'approval-missing-signal-coverage'
            : 'condition-missing-signal-coverage'
        issues.push({
          code,
          severity: 'error',
          message: `${capitalize(node.type)} "${node.id}" cannot resolve "${signal}" (add an exact or default edge)`,
          nodeId: node.id,
        })
      }
    }
  }

  // 10. guard legality vs. source type
  workflow.edges.forEach((edge, idx) => {
    const src = findNode(workflow, edge.from)
    if (!src) return
    const guard = edge.when
    if (guard === undefined || guard === 'default') return
    if (!isGuardLegal(src, guard)) {
      issues.push({
        code: 'illegal-guard-for-source',
        severity: 'error',
        message: `Edge #${idx} from ${src.type} "${src.id}" uses illegal guard "${guard}"`,
        edgeIndex: idx,
        nodeId: src.id,
      })
    }
  })

  // 11. expression syntax on condition nodes (uses err.kind, not string prefix)
  for (const node of workflow.nodes) {
    if (node.type !== 'condition') continue
    const syntaxError = validateExpressionSyntax(node.expr)
    if (syntaxError) {
      issues.push({
        code: 'expression-syntax',
        severity: 'error',
        message: `Condition "${node.id}": ${syntaxError}`,
        nodeId: node.id,
      })
    }
  }

  // 12. terminal has no outgoing edges (warning)
  for (const node of workflow.nodes) {
    if (node.type !== 'terminal') continue
    const hasOut = workflow.edges.some(e => e.from === node.id)
    if (hasOut) {
      issues.push({
        code: 'terminal-has-outgoing',
        severity: 'warning',
        message: `Terminal "${node.id}" has outgoing edges that will never fire`,
        nodeId: node.id,
      })
    }
  }

  // 13. SLA / timeout wiring on approval nodes (issue #222)
  for (const node of workflow.nodes) {
    if (node.type !== 'approval') continue
    const hasSla = typeof node.slaMinutes === 'number' && node.slaMinutes > 0
    if (!hasSla) continue
    if (node.onTimeout === undefined) {
      // SLA is declared but no behavior is configured — the interpreter
      // defaults to 'escalate' which would error at runtime if no
      // timeout edge exists. Warn now so authors catch this in the
      // builder.
      issues.push({
        code: 'sla-without-on-timeout',
        severity: 'warning',
        message: `Approval "${node.id}" sets slaMinutes but no onTimeout — defaults to 'escalate'`,
        nodeId: node.id,
      })
    }
    if ((node.onTimeout ?? 'escalate') === 'escalate') {
      const hasTimeoutEdge = workflow.edges.some(
        e => e.from === node.id && e.when === 'timeout',
      )
      if (!hasTimeoutEdge) {
        issues.push({
          code: 'timeout-edge-missing',
          severity: 'error',
          message: `Approval "${node.id}" with onTimeout='escalate' needs an outgoing edge with when: 'timeout'`,
          nodeId: node.id,
        })
      }
    }
  }

  // 14. notify templates + channels (issue #223)
  for (const node of workflow.nodes) {
    if (node.type !== 'notify') continue

    if (!node.channel || node.channel.trim().length === 0) {
      issues.push({
        code: 'empty-channel',
        severity: 'error',
        message: `Notify "${node.id}" has no channel`,
        nodeId: node.id,
      })
    } else if (knownChannels && !knownChannels.has(node.channel)) {
      issues.push({
        code: 'unknown-channel',
        severity: 'warning',
        message: `Notify "${node.id}" uses channel "${node.channel}" which has no registered adapter`,
        nodeId: node.id,
      })
    }

    if (node.template !== undefined) {
      const syntaxError = validateTemplateSyntax(node.template)
      if (syntaxError) {
        issues.push({
          code: 'template-syntax',
          severity: 'error',
          message: `Notify "${node.id}": ${syntaxError}`,
          nodeId: node.id,
        })
      }
    }
  }

  return issues
}

export function hasBlockingErrors(
  issues: readonly ValidationIssue[],
): boolean {
  return issues.some(i => i.severity === 'error')
}

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * BFS reachability from `startNodeId`. Uses an index-based queue (O(1)
 * dequeue) and a pre-built `nodeIds` Set + adjacency map so the
 * traversal is O(V + E) — the validator runs on every keystroke, so
 * accidental O(V*E) behavior from `queue.shift()` and in-loop
 * `findNode` scans would bite on larger graphs.
 */
function reachableNodeIds(workflow: Workflow): Set<string> {
  const reachable = new Set<string>()
  const nodeIds = new Set(workflow.nodes.map(n => n.id))
  if (!nodeIds.has(workflow.startNodeId)) return reachable
  const adj = new Map<string, string[]>()
  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    let list = adj.get(edge.from)
    if (!list) { list = []; adj.set(edge.from, list) }
    list.push(edge.to)
  }
  const queue: string[] = [workflow.startNodeId]
  reachable.add(workflow.startNodeId)
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]
    const neighbors = adj.get(id)
    if (!neighbors) continue
    for (const to of neighbors) {
      if (reachable.has(to)) continue
      reachable.add(to)
      queue.push(to)
    }
  }
  return reachable
}

function isGuardLegal(node: WorkflowNode, guard: EdgeGuard): boolean {
  switch (node.type) {
    case 'condition': return guard === 'true' || guard === 'false'
    case 'approval':
      if (guard === 'approved' || guard === 'denied') return true
      // `timeout` is only legal when the approval declares an SLA —
      // without one, the interpreter can never fire a timeout from
      // this node, so the edge would be dead code.
      return guard === 'timeout'
        && typeof node.slaMinutes === 'number'
        && node.slaMinutes > 0
    case 'notify':    return guard === 'default'
    case 'terminal':  return false
  }
}

function requiredSignalsFor(node: WorkflowNode): readonly EdgeGuard[] {
  switch (node.type) {
    case 'condition': return ['true', 'false']
    case 'approval':  return ['approved', 'denied']
    default:          return []
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * Best-effort syntax / shape check for condition expressions.
 *
 * This calls `evaluate(expr, {})`, which runs the full parse + eval
 * pipeline — it is NOT a pure parse-only check. Variable-binding
 * errors (`undefined-variable`, `non-object`, `unsupported-value`)
 * are expected at edit time when the user hasn't supplied vars yet,
 * so we suppress them by matching on `ExpressionError.kind`.
 *
 * Everything else surfaces: literal syntax errors (`kind: 'syntax'`),
 * type errors on constant sub-expressions (`1 + "a" * 2` → `'type'`),
 * and unknown operators (`kind: 'unknown-operator'`). If Phase 3 adds
 * a pure parse API we should switch to that here and reclassify this
 * as a true syntax check.
 */
/**
 * Best-effort syntax check for notify templates.
 *
 * Calls `interpolateTemplate(template, {})`, which runs the real
 * token + expression pipeline. Since no variables are bound at edit
 * time, `undefined-variable` / `non-object` expression errors are
 * suppressed (they're expected). Everything else — unterminated
 * `{{ }}`, empty tokens, expression syntax errors inside a token —
 * surfaces as a human-readable string so the builder can render a
 * badge next to the offending node.
 */
export function validateTemplateSyntax(template: string): string | null {
  try {
    interpolateTemplate(template, {})
    return null
  } catch (err) {
    if (err instanceof TemplateError) {
      const cause = err.cause
      if (cause instanceof ExpressionError) {
        if (cause.kind === 'undefined-variable') return null
        if (cause.kind === 'non-object') return null
        if (cause.kind === 'unsupported-value') return null
      }
      return err.message
    }
    return String(err)
  }
}

export function validateExpressionSyntax(expr: string): string | null {
  if (!expr.trim()) return 'Expression is empty'
  try {
    evaluate(expr, {})
    return null
  } catch (err) {
    if (err instanceof ExpressionError) {
      // Variable-bound kinds are runtime-only; ignore at edit time.
      if (err.kind === 'undefined-variable') return null
      if (err.kind === 'non-object') return null
      if (err.kind === 'unsupported-value') return null
      return err.message
    }
    return String(err)
  }
}

# Workflow DSL

_Phase 1 — JSON-only interpreter. Issue #219._

WorksCalendar ships a declarative, versioned approval workflow engine that
supersedes the hard-coded single/two-tier approval flow. Owners describe
the flow as a JSON graph of nodes and edges; a pure interpreter advances
it in lockstep with the existing approval state machine.

## What shipped in Phase 1

- **Workflow schema** (`src/core/workflow/workflowSchema.ts`) — types for
  `Workflow`, `WorkflowNode` (condition / approval / notify / terminal),
  `WorkflowEdge`, and a persisted `WorkflowInstance`.
- **Safe expression evaluator** (`src/core/workflow/expression.ts`) —
  ~220-line sandboxed evaluator used by `condition` nodes. Supports
  literals, dotted paths, arithmetic, comparison, and short-circuit
  boolean logic. No function calls, no indexing, no `eval`.
- **Interpreter** (`src/core/workflow/advance.ts`) — pure function
  `advance({ workflow, instance, action, variables })` that returns the
  next instance plus a structured `emit` list (lifecycle events). Auto-
  advances through `condition` / `notify` nodes, stops at `approval` or
  `terminal`. Cycle-guarded.
- **Starter templates** (`src/core/workflow/templates.ts`) —
  `singleApproverWorkflow`, `twoTierApproverWorkflow`,
  `conditionalByCostWorkflow`. Drop-in defaults or starting points.
- **Approval integration** — `transitionApproval` accepts optional
  `workflow` + `workflowInstance` + `variables`. When supplied, the
  reducer drives both the 5-state approval stage and the interpreter
  from a single call, so hosts can persist both on `event.meta`.

## Node types

| Type        | Purpose                                    | Exit signal            |
|-------------|--------------------------------------------|------------------------|
| `condition` | Branch on an expression                    | `'true'` / `'false'`   |
| `approval`  | Wait for approve/deny from an assignee     | `'approved'` / `'denied'` |
| `notify`    | Fire a `notify` emit event, then fall through | `'default'`        |
| `terminal`  | End the flow with an `outcome`             | — (no outgoing edges)  |

Edge resolution prefers an exact `when` match over a `default` edge
(or an edge with no `when` at all). At most one default edge per source
node.

## Minimal workflow

```ts
import type { Workflow } from 'works-calendar'

const myFlow: Workflow = {
  id: 'single-approver',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'approve',
  nodes: [
    { id: 'approve', type: 'approval', assignTo: 'role:manager' },
    { id: 'done',    type: 'terminal', outcome: 'finalized' },
    { id: 'denied',  type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'approve', to: 'done',   when: 'approved' },
    { from: 'approve', to: 'denied', when: 'denied'   },
  ],
}
```

## Driving a workflow from an approval action

```ts
import { transitionApproval } from 'works-calendar'

const result = transitionApproval(event.meta.approvalStage ?? null, {
  action: 'submit',
  actor: 'alice',
  workflow: myFlow,
  workflowInstance: event.meta.workflowInstance ?? null,
  variables: { event: { cost: event.cost } },
})

if (result.ok) {
  // Persist both — the engine returns them atomically.
  event.meta.approvalStage    = result.stage
  event.meta.workflowInstance = result.workflowInstance
  // Forward `result.emit` to Slack/email/webhook adapters.
}
```

### Action mapping

| Approval action | Workflow action  |
|-----------------|------------------|
| `submit`        | `{ type: 'start' }` |
| `approve`       | `{ type: 'approve' }` |
| `deny`          | `{ type: 'deny', reason }` |
| `revoke` / `downgrade` / `finalize` | *(no interpreter advance — host-level state move)* |

If a workflow is wired but the interpreter errors (unknown variable,
bad expression, no matching edge), the whole transition fails with
`code: 'WORKFLOW_FAILED'` — neither half is applied.

## Condition expressions

The expression language is a safe subset:

```
literals   123   1.5   "text"   'text'   true   false   null
paths      event.cost   actor.role   category
unary      !x   -x
arith      + - * /   (left-associative; `+` concatenates when either side is a string)
compare    == != < <= > >=   (strict equality, numeric ordering)
logical    && ||   (short-circuit)
grouping   ( ... )
```

Variables are supplied via the `variables` argument and resolved by
dotted path. Unknown paths throw — a typo fails loudly rather than
silently evaluating to `false`.

## Lifecycle events (emit)

The interpreter returns an `emit` array alongside the new instance:

```ts
| { type: 'node_entered'; nodeId; at }
| { type: 'node_exited';  nodeId; at; signal }
| { type: 'notify';       nodeId; channel; template?; at }
| { type: 'workflow_completed'; outcome; at }
| { type: 'workflow_failed';    nodeId;  reason; at }
```

Hosts forward these to their lifecycle bus so Slack, email, and webhook
nodes can fan out without the workflow engine caring about transport.

## Starter templates

| Template                       | Shape                                                     |
|--------------------------------|-----------------------------------------------------------|
| `singleApproverWorkflow`       | One approval → finalized or denied.                       |
| `twoTierApproverWorkflow`      | Manager → director chain, IHC-style.                      |
| `conditionalByCostWorkflow`    | Cheap requests finalize; `event.cost > 500` requires a director then notifies ops. |

Import from `works-calendar/workflow`:

```ts
import { WORKFLOW_TEMPLATES } from 'works-calendar'
```

## Planned phases

- **Phase 2** — visual `WorkflowBuilder` editor in ConfigPanel (drag-drop
  canvas, node inspector, JSON import/export).
- **Phase 3** — SLA timers + escalation; scheduled `tick` action fed by
  host-side cron/queue.
- **Phase 4** — `parallel` node (N-of-M approvals), pluggable notify
  channels.

## Related

- [#209](https://github.com/workscalendar/calendarthatworks/issues/209) —
  approval transition reducer (the core primitive).
- [#215](https://github.com/workscalendar/calendarthatworks/issues/215) —
  hash-chain audit trail (every workflow transition is tamper-evident).
- [#218](https://github.com/workscalendar/calendarthatworks/issues/218) —
  multi-tenancy primitives (workflows live per-tenant when set).

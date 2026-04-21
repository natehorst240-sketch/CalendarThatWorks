/**
 * Starter workflow templates — issue #219, Phase 1.
 *
 * Each template is a ready-to-use `Workflow` owners can either drop in
 * unchanged or fork as a starting point. They exercise every Phase-1
 * node type so hosts get a working demo without wiring anything.
 *
 *   - `singleApproverWorkflow`   — one approval, finalize or deny.
 *   - `twoTierApproverWorkflow`  — IHC-style two-tier approval chain.
 *   - `conditionalByCostWorkflow` — cheap requests finalize auto;
 *                                  expensive ones require a director.
 *
 * Version numbers start at 1. Any breaking change to a template's
 * node ids or edges MUST bump the version so hosts can detect stale
 * persisted instances.
 */
import type { Workflow } from './workflowSchema'

export const singleApproverWorkflow: Workflow = {
  id: 'single-approver',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'approve',
  nodes: [
    { id: 'approve', type: 'approval', assignTo: 'role:approver', label: 'Approve request' },
    { id: 'done',    type: 'terminal', outcome: 'finalized' },
    { id: 'denied',  type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'approve', to: 'done',   when: 'approved' },
    { from: 'approve', to: 'denied', when: 'denied'   },
  ],
}

export const twoTierApproverWorkflow: Workflow = {
  id: 'two-tier-approver',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'tier1',
  nodes: [
    { id: 'tier1',  type: 'approval', assignTo: 'role:manager',  label: 'Manager approval' },
    { id: 'tier2',  type: 'approval', assignTo: 'role:director', label: 'Director approval' },
    { id: 'done',   type: 'terminal', outcome: 'finalized' },
    { id: 'denied', type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'tier1', to: 'tier2',  when: 'approved' },
    { from: 'tier1', to: 'denied', when: 'denied'   },
    { from: 'tier2', to: 'done',   when: 'approved' },
    { from: 'tier2', to: 'denied', when: 'denied'   },
  ],
}

/**
 * Cheap requests (`event.cost <= 500`) finalize directly. Anything
 * over $500 escalates to a director-level approval. Demonstrates the
 * `condition` node plus true/false branching.
 */
export const conditionalByCostWorkflow: Workflow = {
  id: 'conditional-by-cost',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'check-cost',
  nodes: [
    { id: 'check-cost', type: 'condition', expr: 'event.cost > 500', label: 'Cost over $500?' },
    { id: 'director',   type: 'approval',  assignTo: 'role:director', label: 'Director approval' },
    { id: 'notify-ops', type: 'notify',    channel: 'slack', template: 'booking-finalized' },
    { id: 'done',       type: 'terminal',  outcome: 'finalized' },
    { id: 'denied',     type: 'terminal',  outcome: 'denied' },
  ],
  edges: [
    { from: 'check-cost', to: 'director',   when: 'true'  },
    { from: 'check-cost', to: 'notify-ops', when: 'false' },
    { from: 'director',   to: 'notify-ops', when: 'approved' },
    { from: 'director',   to: 'denied',     when: 'denied'   },
    { from: 'notify-ops', to: 'done' },
  ],
}

/**
 * Manager approves within 60 minutes, otherwise the request escalates
 * to a director. Demonstrates Phase-3 SLA timers + timeout edges
 * (issue #222): `slaMinutes` sets the countdown, `onTimeout: 'escalate'`
 * picks behavior, and the `timeout` edge routes the escalation.
 */
export const slaEscalationWorkflow: Workflow = {
  id: 'sla-escalation',
  version: 1,
  trigger: 'on_submit',
  startNodeId: 'manager',
  nodes: [
    {
      id: 'manager',
      type: 'approval',
      assignTo: 'role:manager',
      label: 'Manager approval (60m SLA)',
      slaMinutes: 60,
      onTimeout: 'escalate',
    },
    { id: 'director', type: 'approval', assignTo: 'role:director', label: 'Director escalation' },
    { id: 'done',     type: 'terminal', outcome: 'finalized' },
    { id: 'denied',   type: 'terminal', outcome: 'denied' },
  ],
  edges: [
    { from: 'manager',  to: 'done',     when: 'approved' },
    { from: 'manager',  to: 'denied',   when: 'denied'   },
    { from: 'manager',  to: 'director', when: 'timeout'  },
    { from: 'director', to: 'done',     when: 'approved' },
    { from: 'director', to: 'denied',   when: 'denied'   },
  ],
}

/** Ordered list of all shipped templates — drives the ConfigPanel picker. */
export const WORKFLOW_TEMPLATES: readonly Workflow[] = [
  singleApproverWorkflow,
  twoTierApproverWorkflow,
  conditionalByCostWorkflow,
  slaEscalationWorkflow,
]

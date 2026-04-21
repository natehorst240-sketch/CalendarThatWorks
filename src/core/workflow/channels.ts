/**
 * Workflow notification channels — issue #223, Phase 4.
 *
 * `advance()` is pure: `notify` nodes produce a `{ type: 'notify' }`
 * emit event but never touch the network. The channel registry is the
 * *impure* half — hosts register adapters (slack/email/webhook/…)
 * against the registry, and `dispatchWorkflowEvents()` walks the
 * engine's emit list and fans out to whichever adapter matches each
 * event's `channel` field.
 *
 * Adapter factories (`createSlackChannel`, `createEmailChannel`,
 * `createWebhookChannel`) are transport-agnostic shims: they wrap a
 * caller-supplied `send(payload)` function and attach a shape the
 * host's transport already understands. No HTTP client is baked in —
 * pick your own (`fetch`, `axios`, an internal queue, a test spy).
 *
 * Typical wiring:
 *
 *     const registry = createChannelRegistry()
 *     registry.register(createSlackChannel({ send: postToSlack }))
 *     registry.register(createEmailChannel({ send: sendEmail }))
 *
 *     const result = advanceWorkflow({ workflow, instance, action })
 *     if (result.ok) {
 *       await persist(result.instance)
 *       await dispatchWorkflowEvents(result.emit, registry)
 *     }
 */
import type { WorkflowEmitEvent } from './advance'

// ─── Public types ─────────────────────────────────────────────────────────

/**
 * Payload handed to a channel adapter for a single notify node emit.
 * Mirrors the shape of a `{ type: 'notify' }` emit event, pruned to
 * the fields adapters actually need.
 */
export interface ChannelDispatchPayload {
  readonly nodeId: string
  readonly channel: string
  readonly at: string
  /** Authored template (pre-interpolation), if the node carried one. */
  readonly template?: string
  /** Interpolated message — present when the template had no `{{ }}` tokens or when advance rendered them successfully. */
  readonly message?: string
}

/**
 * A channel adapter knows how to deliver one `ChannelDispatchPayload`.
 * Implementations may be synchronous or return a Promise; the
 * dispatcher awaits either form.
 */
export interface WorkflowChannelAdapter {
  readonly id: string
  dispatch(payload: ChannelDispatchPayload): void | Promise<void>
}

export interface WorkflowChannelRegistry {
  register(adapter: WorkflowChannelAdapter): void
  unregister(id: string): void
  has(id: string): boolean
  get(id: string): WorkflowChannelAdapter | undefined
  ids(): readonly string[]
}

/**
 * Per-event dispatch outcome. Failures don't throw — they're captured
 * here so a partial fan-out (slack OK, email down) doesn't take the
 * host process down with it.
 */
export type ChannelDispatchOutcome =
  | { readonly ok: true;  readonly channel: string; readonly nodeId: string }
  | { readonly ok: false; readonly channel: string; readonly nodeId: string; readonly reason: string; readonly unknown?: boolean }

export interface WorkflowDispatchReport {
  readonly outcomes: readonly ChannelDispatchOutcome[]
  readonly dispatched: number
  readonly skipped: number
  readonly failed: number
}

// ─── Registry ─────────────────────────────────────────────────────────────

export function createChannelRegistry(): WorkflowChannelRegistry {
  const map = new Map<string, WorkflowChannelAdapter>()
  return {
    register(adapter) {
      if (!adapter.id) throw new Error('channel adapter requires non-empty id')
      map.set(adapter.id, adapter)
    },
    unregister(id) { map.delete(id) },
    has(id)        { return map.has(id) },
    get(id)        { return map.get(id) },
    ids()          { return Array.from(map.keys()) },
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────

/**
 * Fan a workflow run's emit list out to registered channel adapters.
 *
 * Only `{ type: 'notify' }` events are dispatched; all others are
 * ignored (they're bookkeeping for host persistence / audit). If no
 * adapter is registered for an event's `channel`, the outcome is
 * recorded as `{ ok: false, unknown: true }` rather than throwing —
 * this way a misconfigured channel surfaces in the report without
 * dropping the rest of the batch.
 */
export async function dispatchWorkflowEvents(
  events: readonly WorkflowEmitEvent[],
  registry: WorkflowChannelRegistry,
): Promise<WorkflowDispatchReport> {
  const outcomes: ChannelDispatchOutcome[] = []
  let dispatched = 0
  let skipped = 0
  let failed = 0

  for (const event of events) {
    if (event.type !== 'notify') { skipped++; continue }
    const adapter = registry.get(event.channel)
    if (!adapter) {
      outcomes.push({
        ok: false,
        channel: event.channel,
        nodeId: event.nodeId,
        reason: `No adapter registered for channel "${event.channel}"`,
        unknown: true,
      })
      failed++
      continue
    }
    const payload: ChannelDispatchPayload = {
      nodeId: event.nodeId,
      channel: event.channel,
      at: event.at,
      ...(event.template !== undefined ? { template: event.template } : {}),
      ...(event.message  !== undefined ? { message:  event.message  } : {}),
    }
    try {
      await adapter.dispatch(payload)
      outcomes.push({ ok: true, channel: event.channel, nodeId: event.nodeId })
      dispatched++
    } catch (err) {
      outcomes.push({
        ok: false,
        channel: event.channel,
        nodeId: event.nodeId,
        reason: err instanceof Error ? err.message : String(err),
      })
      failed++
    }
  }

  return { outcomes, dispatched, skipped, failed }
}

// ─── Built-in adapter factories ───────────────────────────────────────────

/**
 * Slack adapter — shapes the payload as `{ text }` (Slack's simplest
 * incoming-webhook contract) and delegates delivery to the host's
 * `send` function.
 *
 * The `id` defaults to `'slack'` but can be overridden when the host
 * runs multiple Slack workspaces / bots.
 */
export interface SlackChannelOptions {
  readonly id?: string
  readonly send: (payload: { readonly text: string; readonly nodeId: string; readonly at: string }) => void | Promise<void>
}

export function createSlackChannel(opts: SlackChannelOptions): WorkflowChannelAdapter {
  const { id = 'slack', send } = opts
  return {
    id,
    dispatch(p) {
      const text = p.message ?? p.template ?? ''
      return send({ text, nodeId: p.nodeId, at: p.at })
    },
  }
}

/**
 * Email adapter — surfaces `{ subject, body }` to the host's mailer.
 * `subject` defaults to a workflow-agnostic stub; hosts that want
 * fancier subjects can post-process the `message` themselves or wrap
 * this factory.
 */
export interface EmailChannelOptions {
  readonly id?: string
  readonly send: (payload: {
    readonly subject: string
    readonly body: string
    readonly nodeId: string
    readonly at: string
  }) => void | Promise<void>
  /** Static subject prefix — e.g. "[Approvals]". */
  readonly subjectPrefix?: string
}

export function createEmailChannel(opts: EmailChannelOptions): WorkflowChannelAdapter {
  const { id = 'email', send, subjectPrefix = 'Workflow notification' } = opts
  return {
    id,
    dispatch(p) {
      const body = p.message ?? p.template ?? ''
      return send({ subject: subjectPrefix, body, nodeId: p.nodeId, at: p.at })
    },
  }
}

/**
 * Webhook adapter — forwards the raw `ChannelDispatchPayload` to the
 * host's send function. Useful for generic HTTP fan-out where the
 * receiver wants the full notify envelope (nodeId, timestamps, both
 * the template and the rendered message).
 */
export interface WebhookChannelOptions {
  readonly id?: string
  readonly send: (payload: ChannelDispatchPayload) => void | Promise<void>
}

export function createWebhookChannel(opts: WebhookChannelOptions): WorkflowChannelAdapter {
  const { id = 'webhook', send } = opts
  return { id, dispatch: send }
}

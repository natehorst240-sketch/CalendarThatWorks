/**
 * Workflow channels + dispatch — unit specs (issue #223 Phase 4).
 */
import { describe, it, expect, vi } from 'vitest'
import {
  createChannelRegistry,
  dispatchWorkflowEvents,
  createSlackChannel,
  createEmailChannel,
  createWebhookChannel,
} from '../channels'
import type { WorkflowEmitEvent } from '../advance'

const notify = (channel: string, overrides: Partial<Extract<WorkflowEmitEvent, { type: 'notify' }>> = {}): WorkflowEmitEvent => ({
  type: 'notify',
  nodeId: 'n1',
  channel,
  at: '2026-04-21T10:00:00.000Z',
  ...overrides,
})

describe('createChannelRegistry', () => {
  it('registers and looks up adapters by id', () => {
    const r = createChannelRegistry()
    const a = { id: 'slack', dispatch: vi.fn() }
    r.register(a)
    expect(r.has('slack')).toBe(true)
    expect(r.get('slack')).toBe(a)
    expect(r.ids()).toContain('slack')
  })

  it('unregisters adapters', () => {
    const r = createChannelRegistry()
    r.register({ id: 'slack', dispatch: vi.fn() })
    r.unregister('slack')
    expect(r.has('slack')).toBe(false)
  })

  it('rejects adapters without an id', () => {
    const r = createChannelRegistry()
    expect(() => r.register({ id: '', dispatch: vi.fn() })).toThrow()
  })

  it('overwrites when the same id registers twice', () => {
    const r = createChannelRegistry()
    const a1 = { id: 'x', dispatch: vi.fn() }
    const a2 = { id: 'x', dispatch: vi.fn() }
    r.register(a1)
    r.register(a2)
    expect(r.get('x')).toBe(a2)
  })
})

describe('dispatchWorkflowEvents', () => {
  it('routes notify events to matching adapters', async () => {
    const slack = vi.fn()
    const email = vi.fn()
    const r = createChannelRegistry()
    r.register({ id: 'slack', dispatch: slack })
    r.register({ id: 'email', dispatch: email })

    const events: WorkflowEmitEvent[] = [
      notify('slack', { message: 'hi slack' }),
      notify('email', { message: 'hi email' }),
    ]
    const report = await dispatchWorkflowEvents(events, r)

    expect(slack).toHaveBeenCalledTimes(1)
    expect(email).toHaveBeenCalledTimes(1)
    expect(slack.mock.calls[0][0]!).toMatchObject({ channel: 'slack', message: 'hi slack' })
    expect(report.dispatched).toBe(2)
    expect(report.failed).toBe(0)
  })

  it('skips non-notify events', async () => {
    const send = vi.fn()
    const r = createChannelRegistry()
    r.register({ id: 'slack', dispatch: send })
    const events: WorkflowEmitEvent[] = [
      { type: 'node_entered', nodeId: 'a', at: 't' },
      { type: 'node_exited', nodeId: 'a', at: 't', signal: 'approved' },
      notify('slack'),
    ]
    const report = await dispatchWorkflowEvents(events, r)
    expect(send).toHaveBeenCalledTimes(1)
    expect(report.skipped).toBe(2)
  })

  it('records unknown-channel events as failed without throwing', async () => {
    const r = createChannelRegistry()
    const report = await dispatchWorkflowEvents([notify('missing')], r)
    expect(report.failed).toBe(1)
    expect(report.dispatched).toBe(0)
    expect(report.outcomes[0]).toMatchObject({ ok: false, unknown: true })
  })

  it('captures adapter errors in the report instead of throwing', async () => {
    const r = createChannelRegistry()
    r.register({
      id: 'slack',
      dispatch: () => { throw new Error('slack down') },
    })
    const report = await dispatchWorkflowEvents([notify('slack')], r)
    expect(report.failed).toBe(1)
    const outcome = report.outcomes[0] as { ok: false; channel: string; nodeId: string; reason: string }
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toContain('slack down')
  })

  it('continues after a failed adapter', async () => {
    const r = createChannelRegistry()
    r.register({ id: 'a', dispatch: () => { throw new Error('x') } })
    const b = vi.fn()
    r.register({ id: 'b', dispatch: b })
    const report = await dispatchWorkflowEvents([notify('a'), notify('b')], r)
    expect(b).toHaveBeenCalledTimes(1)
    expect(report.dispatched).toBe(1)
    expect(report.failed).toBe(1)
  })

  it('awaits async adapter dispatches', async () => {
    const order: string[] = []
    const r = createChannelRegistry()
    r.register({
      id: 's',
      dispatch: async () => {
        await new Promise(res => setTimeout(res, 5))
        order.push('s')
      },
    })
    await dispatchWorkflowEvents([notify('s')], r)
    order.push('after')
    expect(order).toEqual(['s', 'after'])
  })

  it('forwards both template and message when both are present', async () => {
    const send = vi.fn()
    const r = createChannelRegistry()
    r.register({ id: 'slack', dispatch: send })
    await dispatchWorkflowEvents(
      [notify('slack', { template: 'Hello {{ name }}', message: 'Hello Alice' })],
      r,
    )
    expect(send.mock.calls[0][0]!).toMatchObject({
      template: 'Hello {{ name }}',
      message: 'Hello Alice',
    })
  })
})

describe('createSlackChannel', () => {
  it('shapes payload as { text } using the message', async () => {
    const send = vi.fn()
    const adapter = createSlackChannel({ send })
    await adapter.dispatch({
      nodeId: 'n1', channel: 'slack', at: 't',
      message: 'Hello Alice', template: 'Hello {{ x }}',
    })
    expect(send).toHaveBeenCalledWith({ text: 'Hello Alice', nodeId: 'n1', at: 't' })
  })

  it('falls back to template when message is absent', async () => {
    const send = vi.fn()
    const adapter = createSlackChannel({ send })
    await adapter.dispatch({ nodeId: 'n', channel: 'slack', at: 't', template: 'raw' })
    expect(send.mock.calls[0][0].text!).toBe('raw')
  })

  it('allows a custom id', () => {
    const adapter = createSlackChannel({ id: 'slack-ops', send: vi.fn() })
    expect(adapter.id).toBe('slack-ops')
  })
})

describe('createEmailChannel', () => {
  it('shapes payload as { subject, body } using the message as body', async () => {
    const send = vi.fn()
    const adapter = createEmailChannel({ send, subjectPrefix: '[Approvals]' })
    await adapter.dispatch({
      nodeId: 'n1', channel: 'email', at: 't', message: 'Event approved',
    })
    expect(send).toHaveBeenCalledWith({
      subject: '[Approvals]',
      body: 'Event approved',
      nodeId: 'n1',
      at: 't',
    })
  })
})

describe('createWebhookChannel', () => {
  it('forwards the raw payload', async () => {
    const send = vi.fn()
    const adapter = createWebhookChannel({ send })
    const payload = { nodeId: 'n', channel: 'webhook', at: 't', message: 'hi' }
    await adapter.dispatch(payload)
    expect(send).toHaveBeenCalledWith(payload)
  })
})

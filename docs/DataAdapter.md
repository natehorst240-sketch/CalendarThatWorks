# DataAdapter Pattern

The DataAdapter pattern decouples form UX from backend/storage providers.

## Contract

A calendar external form adapter must expose:

```ts
{
  submitEvent(payload, context): Promise<unknown>
}
```

## Why use it

- Swap persistence targets without rewriting UI
- Keep auth/token logic out of presentation code
- Standardize submit and error handling across providers

## Local storage adapter

```jsx
import { CalendarExternalForm, createLocalStorageDataAdapter } from 'works-calendar';

const adapter = createLocalStorageDataAdapter({ key: 'my-calendar:events' });

<CalendarExternalForm adapter={adapter} />
```

## Microsoft 365 adapter

See `examples/microsoft-365/` for an adapter implementation that demonstrates Graph API submission patterns. For the full OAuth + MSAL walkthrough, see the [Microsoft 365 setup guide](./Microsoft365Setup.md).

## Google Calendar adapter

See the [Google Calendar setup guide](./GoogleCalendarSetup.md) for the OAuth flow, scope configuration, and a minimal adapter that posts to the Calendar v3 API.

## Recommended production additions

- request idempotency keys
- structured error mapping
- retry/backoff for transient failures
- audit logging for compliance workflows

## Booking holds (issue #211)

Two users clicking *submit* on the same slot at the same time is the classic
booking race. The engine ships a short-lived **soft lock** ("hold") that
reserves a `(resource, window)` pair while the form is open, so the second
user sees a soft `hold-conflict` warning in the conflict engine output
immediately — not a save-time failure.

### Registry

```ts
import { createHoldRegistry } from 'works-calendar';

const holds = createHoldRegistry(); // default 5-min TTL, auto-generated ids
```

API (`HoldRegistry`):
- `acquire({ resourceId, window, holderId, ttlMs? })` — returns `{ ok, hold }`
  on success or `{ ok: false, error: { code: 'CONFLICTING_HOLD' | 'INVALID_WINDOW' } }`.
  Same-holder overlap is a TTL refresh; different-holder overlap is rejected.
- `release(holdId)` — idempotent.
- `active(now?)` — lazy expiry (no mutation); `prune(now?)` for explicit GC.

### React hook (`useBookingHold`)

The submit flow typically wires through the hook, which handles
acquire-on-mount / release-on-unmount and re-acquires when the selected
resource or window changes:

```tsx
import { useMemo } from 'react';
import { createHoldRegistry, useBookingHold } from 'works-calendar';

const holds = useMemo(() => createHoldRegistry(), []);

function BookingForm({ resourceId, start, end, userId }) {
  const hold = useBookingHold(holds, {
    resourceId, start, end,
    holderId: userId,
    enabled: Boolean(resourceId && start && end),
  });

  if (hold.status === 'error') {
    return <p>Someone else is currently booking this slot. Try again in a moment.</p>;
  }

  async function onSubmit() {
    await adapter.submitEvent(/* … */);
    hold.release(); // belt-and-suspenders; unmount also releases
  }

  return <form onSubmit={onSubmit}>{/* … */}</form>;
}
```

### Adapter contract

For multi-process deployments, adapters implement the optional
`acquireHold / releaseHold` methods and forward to a shared store
(Redis / row-locked DB / etc.) so sibling nodes honor the hold:

```ts
class RedisAdapter implements CalendarAdapter {
  async acquireHold(input) {
    const ok = await redis.set(`hold:${input.resourceId}`, input.holderId, {
      NX: true, PX: input.ttlMs ?? 300_000,
    });
    if (!ok) {
      return { ok: false, error: { code: 'CONFLICTING_HOLD', message: 'slot held elsewhere' } };
    }
    return {
      ok: true,
      hold: {
        id: input.id ?? crypto.randomUUID(),
        resourceId: input.resourceId,
        window: input.window,
        holderId: input.holderId,
        expiresAt: new Date(Date.now() + (input.ttlMs ?? 300_000)).toISOString(),
      },
    };
  }
  async releaseHold(holdId) { await redis.del(`hold:${holdId}`); }
  /* loadRange, createEvent, … */
}
```

Single-process embeds can skip the contract and use `createHoldRegistry()`
directly.

### Conflict engine integration

The `hold-conflict` rule dispatches to `findBlockingHold()` using
`evaluateConflicts({ …, holds: registry.active(), holderId })`. Proposer's
own holds are excluded; other-holder overlaps surface as a **soft**
violation so hosts can decide whether to block the save or offer a retry.

## Lifecycle event bus (issue #216)

The engine exposes a typed `EventBus` for booking and assignment lifecycle
events. Hosts wire a single bus to the engine and any number of adapters
subscribe to fan out to Slack, webhooks, billing, email, etc.

### Channels

| Channel              | When it fires                                         | Payload              |
| -------------------- | ----------------------------------------------------- | -------------------- |
| `booking.requested`  | New event created, or stage transitions to `requested`| `BookingLifecyclePayload` |
| `booking.approved`   | Stage transitions to `approved`                       | `BookingLifecyclePayload` |
| `booking.denied`     | Stage transitions to `denied`                         | `BookingLifecyclePayload` |
| `booking.cancelled`  | Event deleted                                         | `BookingLifecyclePayload` |
| `booking.completed`  | Stage transitions to `finalized`                      | `BookingLifecyclePayload` |
| `assignment.created` | `upsertAssignment` creates a new join                 | `AssignmentLifecyclePayload` |
| `assignment.removed` | `removeAssignment` succeeds                           | `AssignmentLifecyclePayload` |

Transitions to `pending_higher` are intentionally silent — they are internal
tier-escalation, not a fan-out-worthy event. The engine guarantees at most
one emit per `applyMutation` per change.

### Contract

- Handlers run **asynchronously** on the next microtask — `emit` never
  re-enters the caller's stack.
- Handlers are **error-isolated** — a throw (or rejection) in one handler
  does not affect siblings. Errors flow to the `onError` hook passed to
  the bus constructor; the default logs to `console.error`.
- Payloads are **serializable** — `eventSnapshot` is the `EngineEvent` at
  emit time, so handlers that queue work across ticks see a stable view.

### Wiring an adapter

```ts
import { CalendarEngine, EventBus } from 'works-calendar';

const bus = new EventBus({
  onError: (err, channel) => logger.warn({ err, channel }, 'bus handler failed'),
});
const engine = new CalendarEngine({ bus, /* events, config, … */ });

// Either subscribe inline …
bus.subscribe('booking.approved', async ({ eventSnapshot }) => {
  await slack.post(`Booked: ${eventSnapshot?.title}`);
});

// … or let an adapter do it via the optional `subscribeLifecycle` hook.
class SlackAdapter {
  subscribeLifecycle(bus: EventBus) {
    bus.subscribe('booking.approved', this.onApproved);
    bus.subscribe('booking.denied',   this.onDenied);
  }
  /* … loadRange, createEvent, etc. as usual */
}
const slack = new SlackAdapter();
slack.subscribeLifecycle?.(bus);
```

### Slack webhook example

```ts
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL!;

bus.subscribe('booking.approved', async ({ eventSnapshot, actor, at }) => {
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `:white_check_mark: *${eventSnapshot?.title}* approved by ${actor ?? 'system'} at ${at}`,
    }),
  });
});

bus.subscribe('booking.denied', async ({ eventSnapshot, reason }) => {
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: `:x: *${eventSnapshot?.title}* denied — ${reason ?? 'no reason given'}`,
    }),
  });
});
```

### Generic webhook example

Forward everything to an external service. Use `sourceActionId` as the
idempotency key so retries are safe:

```ts
for (const channel of ['booking.requested', 'booking.approved', 'booking.denied',
                       'booking.cancelled', 'booking.completed'] as const) {
  bus.subscribe(channel, async payload => {
    await fetch('https://ops.example.com/calendar-hooks', {
      method: 'POST',
      headers: {
        'content-type':  'application/json',
        'idempotency-key': `${channel}:${payload.sourceActionId}:${payload.eventId}:${payload.at}`,
      },
      body: JSON.stringify({ channel, ...payload }),
    });
  });
}
```

### Teardown

```ts
bus.unsubscribeAll(); // drops every handler on every channel
```

### Workflow DSL integration (#219)

Phase 4 of the Workflow DSL will emit through this bus for `notify` nodes.
Until then, the interpreter returns `WorkflowEmitEvent[]` on its
`advance()` result — host code that wants lifecycle-style fan-out today
can forward those emits into the bus manually.

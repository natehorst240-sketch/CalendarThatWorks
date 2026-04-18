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

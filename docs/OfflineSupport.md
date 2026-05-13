# Offline Support

CalendarThatWorks includes a lightweight offline indicator that reacts to the browser's network status. It is purely presentational — the calendar does not buffer writes or retry requests itself. Retry and queue logic is the responsibility of the host data adapter.

## The `showOfflineIndicator` prop

Set `showOfflineIndicator={true}` to enable a slide-in banner that appears when the browser reports it is offline. The banner dismisses automatically when connectivity is restored.

```tsx
<WorksCalendar
  events={events}
  showOfflineIndicator={true}
/>
```

## `useNetworkStatus`

`useNetworkStatus` is exported as a standalone hook for use anywhere in your application:

```ts
import { useNetworkStatus } from 'calendarthatworks/hooks';

const { isOnline, isInitializing } = useNetworkStatus();
```

### Return value

```ts
interface NetworkStatus {
  isOnline: boolean;
  isInitializing: boolean; // true until first client-side effect fires
}
```

The hook subscribes to the browser's `online` and `offline` events — no polling. It returns immediately on every re-render with the current connectivity state. Listeners are cleaned up on unmount, so there is no accumulation across React strict-mode double-mounts.

### SSR behavior

`useNetworkStatus` is SSR-safe. On the server and during the first render:

- `isOnline` defaults to `true` (the only safe assumption without a real browser).
- `isInitializing` is `true` when `navigator` is not available (server-side), and becomes `false` after the first client-side effect fires.

**The `OfflineIndicator` banner and any UI driven by `isInitializing` should render nothing during this window** to prevent a hydration mismatch between server HTML (which assumes online) and client HTML (which may already know the state).

```tsx
const { isOnline, isInitializing } = useNetworkStatus();

if (isInitializing) return null; // avoid hydration mismatch
if (!isOnline) return <OfflineBanner />;
return null;
```

## `OfflineIndicator` standalone export

`OfflineIndicator` is exported as a named component for use outside `<WorksCalendar>`:

```ts
import { OfflineIndicator } from 'calendarthatworks';
```

It calls `useNetworkStatus` internally and renders a `role="status"` / `aria-live="polite"` banner when offline. No props are required.

```tsx
export default function Layout({ children }) {
  return (
    <>
      <OfflineIndicator />
      <main>{children}</main>
    </>
  );
}
```

## What the indicator does NOT do

The offline indicator is intentionally thin:

- It does **not** block or queue write operations.
- It does **not** retry failed requests.
- It does **not** cache event data for offline reads.
- It does **not** integrate with `SyncManager` or `SyncQueue` — retry on reconnect is entirely the host's responsibility.

The relationship to `SyncManager` / `SyncQueue` is deliberately decoupled: the indicator tells the user they are offline; the host data adapter decides what to do about it.

## Relationship to `SyncManager` / `SyncQueue`

If your application has a sync layer (e.g., `SyncManager` + `SyncQueue`), wire it up independently:

```ts
const { isOnline } = useNetworkStatus();

useEffect(() => {
  if (isOnline) {
    syncQueue.flush(); // retry queued operations on reconnect
  }
}, [isOnline]);
```

The calendar's offline indicator and your sync layer react to the same browser events but are otherwise independent.

## Working example

```tsx
import { WorksCalendar, OfflineIndicator, useNetworkStatus } from 'calendarthatworks';

// Option A: built-in indicator inside the calendar
export function SimpleExample() {
  return (
    <WorksCalendar
      events={events}
      showOfflineIndicator={true}
    />
  );
}

// Option B: standalone indicator + custom offline behavior
export function AdvancedExample() {
  const { isOnline, isInitializing } = useNetworkStatus();

  return (
    <div>
      {/* Renders its own offline banner */}
      <OfflineIndicator />

      {!isInitializing && !isOnline && (
        <p className="warning">
          You're offline. New events will sync when you reconnect.
        </p>
      )}

      <WorksCalendar events={events} />
    </div>
  );
}
```

## References

- `src/hooks/useNetworkStatus.ts`
- `src/ui/OfflineIndicator.tsx`
- `docs/diagrams/level3j.mmd` / `level3j.png`

# LocationProvider

The Assets view's sticky left column shows a live location for every
rendered resource. The calendar doesn't know where the data comes from —
it asks a swappable `LocationProvider` plugin. Ship a custom provider to
integrate with SkyRouter, Samsara, a private HTTP endpoint, or anything
else your dispatch stack already surfaces.

## Contract

```ts
import type { LocationData, LocationProvider } from 'works-calendar';

export interface LocationProvider {
  readonly id: string;
  readonly refreshIntervalMs: number;

  fetchLocation(resourceId: string, signal?: AbortSignal): Promise<LocationData>;

  subscribe?(resourceId: string, onUpdate: (data: LocationData) => void): () => void;

  init?(): Promise<void>;
  dispose?(): void;
}

export interface LocationData {
  text: string;                          // "KPHX", "Depot 3", "In transit"
  coords?: { lat: number; lon: number };
  asOf: string;                          // ISO timestamp
  status: 'live' | 'stale' | 'unknown' | 'error';
  meta?: Record<string, unknown>;
}
```

### Lifecycle

1. `init()` runs once when the Assets view mounts (or when the provider
   is swapped). Open websockets, perform auth handshakes, or warm a cache
   here. Rejections are swallowed — the view degrades gracefully.
2. For every visible resource, the view decides between push and poll:
   - If `subscribe(id, cb)` is defined, it is used and polling is
     skipped for that resource. Call `cb(newData)` any time the upstream
     feed changes. The returned function must unsubscribe cleanly.
   - If `subscribe` is absent, the view calls `fetchLocation(id)` once
     on mount and then every `refreshIntervalMs` ms (clamped to a 5000ms
     minimum to protect upstream providers). Set `refreshIntervalMs: 0`
     to fetch once and never poll.
3. `dispose()` runs on unmount or provider swap. Close sockets here.

### Status semantics

| status    | What the banner does                               |
|-----------|----------------------------------------------------|
| `live`    | Green dot; no special treatment.                   |
| `stale`   | Amber dot; banner stays visible so users notice.   |
| `unknown` | Dimmed banner; no dot.                             |
| `error`   | Red dot; the calendar falls back to the last good value when available. |

The calendar never mutates `LocationData` — providers own what the banner
displays.

## Shipped default — `ManualLocationProvider`

Zero-config provider for hosts that don't have a live feed yet. It reads
`resource.meta[metaKey]` (default key: `'location'`) and never polls.

```ts
import { createManualLocationProvider } from 'works-calendar';

const provider = createManualLocationProvider({
  resources: [
    { id: 'N121AB', meta: { location: 'KPHX' } },
    { id: 'N505CD', meta: { location: { text: 'Depot 3', status: 'live', asOf: '...' } } },
  ],
});
```

Or with a resolver that defers to your own store:

```ts
createManualLocationProvider({
  getResource: (id) => myResourceStore.get(id),
});
```

String values are wrapped as `{ text, status: 'unknown' }`. Full
`LocationData` objects are passed through unchanged.

## Writing a custom provider

`examples/assets-custom-provider/FakeSkyRouterProvider.ts` is a complete
reference. Trimmed for the docs:

```ts
export class SkyRouterProvider implements LocationProvider {
  readonly id = 'skyrouter';
  readonly refreshIntervalMs = 0; // we push

  private socket: WebSocket | null = null;
  private subscribers = new Map<string, Set<(d: LocationData) => void>>();

  async init() {
    this.socket = new WebSocket('wss://skyrouter.example/live');
    this.socket.addEventListener('message', (e) => {
      const { tail, data } = JSON.parse(e.data);
      this.subscribers.get(tail)?.forEach(cb => cb(data));
    });
  }

  dispose() { this.socket?.close(); this.socket = null; this.subscribers.clear(); }

  async fetchLocation(id: string) {
    const res = await fetch(`/api/skyrouter/${id}/location`);
    return res.json();
  }

  subscribe(id: string, cb: (d: LocationData) => void) {
    let set = this.subscribers.get(id);
    if (!set) { set = new Set(); this.subscribers.set(id, set); }
    set.add(cb);
    return () => set!.delete(cb);
  }
}
```

## Testing

For unit tests, a simple synchronous `LocationProvider` stub is usually
enough:

```ts
const provider = {
  id: 'test',
  refreshIntervalMs: 0,
  fetchLocation: async (id) => ({
    text: `at ${id}`, status: 'live', asOf: new Date().toISOString(),
  }),
};
```

The Assets view calls `fetchLocation` once per resource on mount; testing
libraries can wait for the banner text to appear via `findByText`.

## FAQ

- **Why not a single `getAll()` call?** Resources can become visible
  incrementally (scrolling, zoom-out). Per-resource calls keep the view
  responsive without fetching data you don't need.
- **What about resources with no provider entry?** `fetchLocation` should
  resolve with `{ status: 'unknown', ... }`. The banner renders a dimmed
  row. It should not reject.
- **Can two providers coexist?** No — the calendar swaps the whole
  provider when the prop identity changes. Use an aggregator wrapper if
  you need fanout to multiple upstreams.

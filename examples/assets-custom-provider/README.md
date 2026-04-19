# Assets — custom `LocationProvider`

This example demonstrates how a host app plugs its own live-location feed
into the WorksCalendar **Assets** view.

`FakeSkyRouterProvider` is a demo-only stub that simulates push updates on
a timer. A real SkyRouter / Samsara / custom-HTTP adapter swaps the tick
loop for the vendor's websocket or polling client; the `LocationProvider`
contract is identical.

## Minimum wiring

```tsx
import { WorksCalendar } from 'works-calendar';
import { FakeSkyRouterProvider } from './FakeSkyRouterProvider';

const provider = new FakeSkyRouterProvider({
  tails: ['N121AB', 'N505CD', 'N88QR'],
  tickMs: 5_000,
});

export default function App() {
  return (
    <WorksCalendar
      initialView="assets"
      locationProvider={provider}
      events={yourEvents}
    />
  );
}
```

## Contract recap

1. `init()` runs once on mount. Open your socket / auth here.
2. If `subscribe(id, cb)` is defined, it wins — AssetsView never polls
   that resource. Push updates by calling `cb(newData)`.
3. If `subscribe` is absent, AssetsView polls `fetchLocation(id)` every
   `refreshIntervalMs` ms (clamped to 5000ms min).
4. `dispose()` runs on unmount or provider swap. Close your socket here.

See `docs/LocationProvider.md` for the full reference.

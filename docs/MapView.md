# MapView

`MapView` is the calendar's geographic view: events that carry coordinates
appear as markers on a MapLibre basemap. It is shipped as an **opt-in plugin**
so the calendar's main bundle stays slim — install the peers and the view
renders, skip them and a graceful install hint is shown instead.

> Why a plugin? MapLibre + `react-map-gl` add ~200 KB gz to the runtime, plus
> a tile provider. Most calendars don't need a map, so the cost shouldn't be
> paid by default. Hosts that want it install two peers and pass an
> `initialView="map"` (or render `<MapView />` directly).

## Installation

```bash
npm install maplibre-gl react-map-gl
```

`react-map-gl` ships both Mapbox and MapLibre adapters; this view imports
from the MapLibre subpath (`react-map-gl/maplibre`) so no Mapbox token is
required.

## Quick start

```jsx
import { WorksCalendar } from 'works-calendar';
import 'works-calendar/styles';

const events = [
  {
    id: 'phx-arrival',
    title: 'Phoenix arrival',
    start: new Date(),
    meta: { coords: { lat: 33.43, lon: -112.01 } },
  },
  {
    id: 'bos-departure',
    title: 'Boston departure',
    start: new Date(),
    meta: { coords: { lat: 42.36, lon: -71.06 } },
  },
];

<WorksCalendar events={events} initialView="map" />;
```

The Map tab also appears in the view picker when `'map'` is enabled in the
view list (it follows the same opt-in pattern as `dispatch` / `assets` /
`base`).

## Where coordinates come from

`MapView` plots an event when one of these is set on `event.meta`:

```ts
event.meta.coords = { lat: 33.43, lon: -112.01 };  // canonical — matches LocationData
event.meta = { lat: 33.43, lon: -112.01 };         // loose, lat/lon top-level
event.meta = { lat: 33.43, lng: -112.01 };         // loose, lng spelling
```

Events without coordinates are silently skipped. If **no** events have
coordinates, the view shows a hint instead of an empty map.

The `coords` shape intentionally matches
[`LocationData.coords`](./LocationProvider.md) — if you already wire up a
`LocationProvider` for the Assets view, the same coord pairs feed the map
without a translation layer.

## Marker color

Markers resolve through the same `colorRules` as every other view, so:

- `event.color` ⇒ marker fill
- otherwise the configured `colorRules` decide
- otherwise the theme's `--wc-accent` fallback

This means the map respects the same category palette as the rest of the
calendar without per-view configuration.

## Standalone usage

`MapView` is also exported directly for hosts that want to embed only the
map (no calendar shell, no toolbar):

```jsx
import { MapView } from 'works-calendar';
import 'works-calendar/styles';

<MapView
  events={events}
  onEventClick={ev => openSidebar(ev)}
  initialCenter={{ lat: 39.5, lng: -98.35 }}  // continental US center
  initialZoom={4}
  mapStyle="https://api.maptiler.com/maps/streets/style.json?key=YOUR_KEY"
/>;
```

### Props

| Prop            | Type                                       | Default                   | Notes |
| --------------- | ------------------------------------------ | ------------------------- | ----- |
| `events`        | `Array<{ id; title; start; meta?; … }>`    | required                  | Same shape as the rest of the calendar; only items with coords are plotted. |
| `onEventClick`  | `(event) => void`                          | —                         | Fired on marker click. |
| `initialCenter` | `{ lat: number; lng: number }`             | centroid of plotted events | Auto-fits the marker cloud when omitted. |
| `initialZoom`   | `number`                                   | `4` (or `2` if no events) | MapLibre zoom level. |
| `mapStyle`      | `string`                                   | demo tile server          | MapLibre style URL — see "Tile providers" below. |

## Tile providers

The default `mapStyle` is MapLibre's
[free demo style](https://demotiles.maplibre.org/style.json). It's fine for
local development but is rate-limited and not appropriate for production.
Pick one of these for live deployments:

| Provider | Notes |
| --- | --- |
| **MapTiler** | Free tier (100 K tile loads/mo). Style URL ends with `?key=...`. Easiest path. |
| **Stadia Maps** | Free tier for non-commercial; commercial plans available. |
| **Protomaps** | Self-host vector tiles from a single static `.pmtiles` file — no per-tile billing. |
| **OpenFreeMap** | Free, community-funded, no API key. |
| **Self-hosted OSM** | Full control; you operate the tile server. |

Pass the chosen style URL via the `mapStyle` prop. `WorksCalendar` accepts
it as a top-level prop and forwards it to the active map view:

```jsx
<WorksCalendar
  events={events}
  initialView="map"
  mapStyle="https://tiles.openfreemap.org/styles/liberty"
/>;
```

The same prop is accepted by the standalone `MapView` shown above. When
omitted, both fall back to the MapLibre demo style.

## Bundle impact

When the peers are **not** installed, `MapView` adds nothing meaningful to
the calendar bundle — only a small fallback component plus the dynamic-import
boundaries. The library build externalizes `maplibre-gl`, `react-map-gl`, and
`react-map-gl/maplibre` so they're never inlined into `dist/`.

When the peers **are** installed in the host app, the host bundler resolves
the dynamic imports into a separate chunk that loads only when the user
switches to the map view — the rest of the calendar remains unaffected.

## Custom map layers and overlays

This first cut keeps the surface narrow: markers + popup + navigation
control. If you need polylines, choropleths, clustering, or custom GL layers,
fall back to MapLibre directly inside your own component and reuse just the
event-iteration pattern from `MapView.tsx`. We expect to grow the prop
surface based on real-world feedback rather than guessing at the right
abstractions up front.

## Why MapLibre over a custom map?

- A from-scratch SVG/canvas marker map gets you ~2–3 days of work before you
  hit projection, tile loading, and gesture handling.
- A from-scratch raster-tile map (lat/lng → pixel, OSM tiles, clustering)
  is a 1–2 week project and loses GPU-accelerated panning.
- A vector-tile renderer with smooth interactions is a multi-month project
  and effectively reinvents MapLibre.
- MapLibre is BSD-3, no API key required, runs against any open-tile
  provider, and `react-map-gl` already gives idiomatic React bindings.

The "build it yourself" path was prototyped on the way to this view; the
trade-off didn't pencil out for what users actually wanted.

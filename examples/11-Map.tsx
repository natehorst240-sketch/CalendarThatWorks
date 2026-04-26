/**
 * Example 11 — Map View (optional plugin)
 *
 * Plots events that carry coordinates on a MapLibre basemap. The map runtime
 * is shipped as an opt-in plugin — if `react-map-gl` and `maplibre-gl` are
 * not installed in the host app, the view renders a clear install hint
 * instead of breaking. To run this example with a real map:
 *
 *   npm install maplibre-gl react-map-gl
 *
 * This page renders the standalone `MapView` so the tile-style picker can
 * customise the basemap. The same data also works inside the full calendar
 * shell — pass `initialView="map"` to `<WorksCalendar />` and switch tabs.
 *
 * See docs/MapView.md for the full plugin guide.
 *
 * Coordinate convention demonstrated:
 *   meta.coords = { lat, lon }   // canonical (matches LocationData)
 *   meta.lat / meta.lon          // loose convenience form
 */
import { useState, useCallback } from 'react';
import { MapView } from '../src/index.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────
const now = new Date();

function at(offsetDays, hour = 9, min = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, min, 0, 0);
  return d;
}

// ── Event data ────────────────────────────────────────────────────────────────
// Air-EMS-style mission set across the continental US.
const INITIAL_EVENTS = [
  {
    id: 'm-phx-1',
    title: 'KPHX — Inter-facility transfer',
    start: at(0, 9), end: at(0, 11),
    color: '#ef4444',
    meta: { coords: { lat: 33.434, lon: -112.012 } },
  },
  {
    id: 'm-bos-1',
    title: 'KBOS — Pediatric transport',
    start: at(0, 13), end: at(0, 15),
    color: '#ef4444',
    meta: { coords: { lat: 42.366, lon: -71.020 } },
  },
  {
    id: 'm-sea-1',
    title: 'KSEA — Trauma response',
    start: at(1, 6), end: at(1, 9),
    color: '#ef4444',
    meta: { coords: { lat: 47.450, lon: -122.309 } },
  },
  {
    id: 'm-mia-1',
    title: 'KMIA — Cardiac transfer',
    start: at(1, 12), end: at(1, 14),
    color: '#f97316',
    meta: { coords: { lat: 25.795, lon: -80.290 } },
  },
  {
    id: 'm-den-1',
    title: 'KDEN — Search and rescue',
    start: at(2, 8), end: at(2, 11),
    color: '#0ea5e9',
    meta: { coords: { lat: 39.861, lon: -104.673 } },
  },
  {
    id: 'm-ord-1',
    title: 'KORD — Organ transport',
    start: at(2, 16), end: at(2, 18),
    color: '#8b5cf6',
    meta: { coords: { lat: 41.978, lon: -87.904 } },
  },
  {
    id: 'm-aus-1',
    title: 'KAUS — Routine repositioning',
    start: at(3, 10), end: at(3, 12),
    color: '#10b981',
    // Loose form — meta.lat / meta.lon at the top level.
    meta: { lat: 30.194, lon: -97.670 },
  },
];

// ── Tile styles ──────────────────────────────────────────────────────────────
// In production swap the demo style for a provider you control. The demo
// style is rate-limited and not appropriate for live deployments.
const STYLES = [
  { id: 'demo',     label: 'MapLibre demo',           url: 'https://demotiles.maplibre.org/style.json' },
  { id: 'liberty',  label: 'OpenFreeMap · Liberty',   url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'positron', label: 'OpenFreeMap · Positron',  url: 'https://tiles.openfreemap.org/styles/positron' },
];

// ── Component ────────────────────────────────────────────────────────────────
export function MapExample() {
  const [styleId, setStyleId] = useState('demo');
  const mapStyle = STYLES.find(s => s.id === styleId).url;

  const handleEventClick = useCallback((ev) => {
    // In a real app: open a sidebar / drawer / mission detail page.
    // eslint-disable-next-line no-console
    console.log('Clicked mission marker:', ev);
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tile-style picker — demo aid only, not part of the component. */}
      <div style={{
        padding: '8px 12px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{
          fontSize: 11, color: '#94a3b8', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Tile style
        </span>
        {STYLES.map(s => (
          <button
            key={s.id}
            onClick={() => setStyleId(s.id)}
            style={{
              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
              fontWeight: styleId === s.id ? 700 : 400,
              background: styleId === s.id ? '#1e293b' : '#e2e8f0',
              color:      styleId === s.id ? '#fff'    : '#64748b',
            }}
          >
            {s.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
          Install <code>maplibre-gl</code> + <code>react-map-gl</code> to render the map.
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <MapView
          events={INITIAL_EVENTS}
          onEventClick={handleEventClick}
          mapStyle={mapStyle}
          initialCenter={{ lat: 39.5, lng: -98.35 }}
          initialZoom={3}
        />
      </div>
    </div>
  );
}

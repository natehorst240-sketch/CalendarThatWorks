/**
 * MapView — geographic plot of events that carry coordinates.
 *
 * Optional view. The map runtime (`maplibre-gl` + `react-map-gl/maplibre`) is
 * loaded lazily so it stays out of the calendar's main bundle when unused; if
 * the host app hasn't installed those peers we render an instructional empty
 * state instead of crashing.
 *
 * An event is plotted when any of these are present on `event.meta`:
 *   - `coords: { lat: number; lon: number }`     (matches LocationData.coords)
 *   - `lat: number` + (`lon` | `lng`): number    (loose convenience form)
 */
import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import styles from './MapView.module.css';

type MapEvent = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  resource?: string;
  status?: string;
  color?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

type LngLat = { lng: number; lat: number };

type Plotted = {
  ev: MapEvent;
  pos: LngLat;
  color: string | undefined;
};

export type MapViewProps = {
  events: MapEvent[];
  onEventClick?: (event: MapEvent) => void;
  /** Initial map center. Defaults to the centroid of plotted events, else (0, 20). */
  initialCenter?: LngLat;
  /** Initial zoom level. Defaults to 3 when auto-fitting fails. */
  initialZoom?: number;
  /**
   * MapLibre style URL. Defaults to a free demo style — fine for development,
   * but production hosts should pass their own (MapTiler, Stadia, Protomaps,
   * self-hosted, etc).
   */
  mapStyle?: string;
};

const DEFAULT_STYLE = 'https://demotiles.maplibre.org/style.json';

function readCoords(ev: MapEvent): LngLat | null {
  const meta = ev.meta;
  if (!meta) return null;

  const coords = meta['coords'];
  if (coords && typeof coords === 'object') {
    const c = coords as Record<string, unknown>;
    const lat = c['lat'];
    const lon = c['lon'] ?? c['lng'];
    if (typeof lat === 'number' && typeof lon === 'number') {
      return { lat, lng: lon };
    }
  }

  const lat = meta['lat'];
  const lon = meta['lon'] ?? meta['lng'];
  if (typeof lat === 'number' && typeof lon === 'number') {
    return { lat, lng: lon };
  }

  return null;
}

type MapModule = {
  Map: ComponentType<any>;
  Marker: ComponentType<any>;
  Popup: ComponentType<any>;
  NavigationControl: ComponentType<any>;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; mod: MapModule }
  | { status: 'missing' }
  | { status: 'error'; message: string };

/**
 * Lazy-load the map runtime. Falls back to a clear "missing dep" state instead
 * of breaking the app when the host hasn't opted in to maps.
 */
function useMapModule(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Resolved dynamically by string so TypeScript doesn't try to type-check
        // the optional peer at build time, and @vite-ignore keeps the calendar
        // bundle from trying to inline it. Host apps that opt in to the map
        // install both peers themselves.
        const mapModuleSpec = 'react-map-gl/maplibre';
        const cssModuleSpec = 'maplibre-gl/dist/maplibre-gl.css';
        const reactMap = (await import(/* @vite-ignore */ mapModuleSpec)) as any;
        await import(/* @vite-ignore */ cssModuleSpec);
        if (cancelled) return;
        const mod: MapModule = {
          Map: reactMap.Map ?? reactMap.default,
          Marker: reactMap.Marker,
          Popup: reactMap.Popup,
          NavigationControl: reactMap.NavigationControl,
        };
        if (!mod.Map || !mod.Marker) {
          setState({ status: 'error', message: 'react-map-gl/maplibre exports missing' });
          return;
        }
        setState({ status: 'ready', mod });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // Module-not-found is the expected "host hasn't installed it" path.
        if (/Cannot find|Failed to fetch|Failed to resolve|MODULE_NOT_FOUND/i.test(msg)) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: msg });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function centroidOf(plotted: Plotted[]): LngLat | null {
  if (plotted.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of plotted) {
    lat += p.pos.lat;
    lng += p.pos.lng;
  }
  return { lat: lat / plotted.length, lng: lng / plotted.length };
}

export default function MapView({
  events,
  onEventClick,
  initialCenter,
  initialZoom,
  mapStyle = DEFAULT_STYLE,
}: MapViewProps) {
  const ctx = useCalendarContext();
  const load = useMapModule();
  const [openId, setOpenId] = useState<string | null>(null);

  const plotted = useMemo<Plotted[]>(() => {
    const out: Plotted[] = [];
    for (const ev of events) {
      const pos = readCoords(ev);
      if (!pos) continue;
      const color = resolveColor(ev as any, ctx?.['colorRules']);
      out.push({ ev, pos, color });
    }
    return out;
  }, [events, ctx]);

  const initial = useMemo(() => {
    const center = initialCenter ?? centroidOf(plotted) ?? { lat: 20, lng: 0 };
    return {
      longitude: center.lng,
      latitude: center.lat,
      zoom: initialZoom ?? (plotted.length > 0 ? 4 : 2),
    };
  }, [initialCenter, initialZoom, plotted]);

  if (load.status === 'missing') {
    return (
      <div className={styles['fallback']}>
        <p className={styles['hint']}>
          Map view requires <code>maplibre-gl</code> and <code>react-map-gl</code>.
          Install them in your app, then this view will render automatically:
        </p>
        <pre className={styles['code']}>npm install maplibre-gl react-map-gl</pre>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className={styles['fallback']}>
        <p className={styles['hint']}>Map failed to load: {load.message}</p>
      </div>
    );
  }

  if (load.status === 'loading') {
    return <div className={styles['fallback']}><p className={styles['hint']}>Loading map…</p></div>;
  }

  if (plotted.length === 0) {
    return (
      <div className={styles['fallback']}>
        <p className={styles['hint']}>
          No events have coordinates yet. Add <code>meta.coords = {'{ lat, lon }'}</code>{' '}
          (or <code>meta.lat</code> + <code>meta.lon</code>) to plot events on the map.
        </p>
      </div>
    );
  }

  const { Map, Marker, Popup, NavigationControl } = load.mod;
  const openEvent = openId ? plotted.find(p => p.ev.id === openId) : null;

  return (
    <div className={styles['mapWrap']}>
      <Map
        initialViewState={initial}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' } as CSSProperties}
      >
        <NavigationControl position="top-right" />
        {plotted.map(({ ev, pos, color }) => (
          <Marker
            key={ev.id}
            longitude={pos.lng}
            latitude={pos.lat}
            anchor="bottom"
            onClick={(e: { originalEvent: MouseEvent }) => {
              e.originalEvent.stopPropagation();
              setOpenId(ev.id);
              onEventClick?.(ev);
            }}
          >
            <span
              className={styles['marker']}
              style={{ '--ev-color': color ?? 'var(--wc-accent)' } as CSSProperties}
              title={ev.title}
            />
          </Marker>
        ))}
        {openEvent && (
          <Popup
            longitude={openEvent.pos.lng}
            latitude={openEvent.pos.lat}
            anchor="top"
            onClose={() => setOpenId(null)}
            closeOnClick={false}
          >
            <div className={styles['popup']}>
              <strong>{openEvent.ev.title}</strong>
              {openEvent.ev.resource && (
                <span className={styles['popupMeta']}>{openEvent.ev.resource}</span>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}

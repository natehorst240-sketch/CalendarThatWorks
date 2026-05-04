/**
 * AssetMapWidget — strict, map-agnostic situational-awareness overlay.
 *
 * Lives alongside `<WorksCalendar />` rather than inside it: the calendar
 * stays a pure scheduling surface, this widget reads `AssetTrackerPosition`s
 * and renders one of three modes — peek (mini button), panel (floating
 * card), fullscreen (operations map).
 *
 * Map-agnostic by construction: when the host supplies a
 * `WorksCalendarMapAdapter`, the widget mounts it into the body container
 * and forwards `updatePositions`. With no adapter, it falls back to a
 * dependency-free SVG plot — useful for QA / demos, but the real renderer
 * (MapLibre, Leaflet, Cesium, …) lives in the host's package.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AssetTrackerPosition } from '../core/geo/geoTypes'
import type { WorksCalendarMapAdapter } from '../core/geo/mapAdapterTypes'
import { isValidPosition } from '../core/geo/positionGuards'
import styles from './asset-map-widget.module.css'

// Re-exported so a single subpath import covers both the component and
// the contract types a host needs to wire a custom renderer.
export type { AssetTrackerPosition } from '../core/geo/geoTypes'
export type { WorksCalendarMapAdapter } from '../core/geo/mapAdapterTypes'

export type AssetMapWidgetMode = 'peek' | 'panel' | 'fullscreen'
export type AssetMapWidgetCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

export interface AssetMapWidgetProps {
  /** Live or last-known asset positions. Filtered by `isValidPosition`. */
  readonly positions: readonly AssetTrackerPosition[]
  /**
   * Optional renderer. When omitted, the widget renders a tiny built-in
   * SVG plot — enough for situational awareness, but the host should
   * supply a real adapter (`asset-tracker-maplibre`, `-leaflet`, etc.)
   * for production.
   */
  readonly adapter?: WorksCalendarMapAdapter
  /** Initial mode. Defaults to `'peek'`. */
  readonly initialMode?: AssetMapWidgetMode
  /** Corner anchor for `peek` and `panel` modes. Defaults to `'top-right'`. */
  readonly position?: AssetMapWidgetCorner
  /** Ages above this (seconds) flag a position as stale. Defaults to 120. */
  readonly staleThresholdSeconds?: number
  /** `() => epoch seconds`. Override for tests / SSR. Defaults to `Date.now`. */
  readonly nowSeconds?: () => number
  /** Title shown in panel/fullscreen toolbars. Defaults to `'Asset map'`. */
  readonly title?: string
  /** Notified on mode transitions so hosts can persist `panel` / `fullscreen`. */
  readonly onModeChange?: (mode: AssetMapWidgetMode) => void
}

const DEFAULT_STALE = 120
const defaultNow = () => Math.floor(Date.now() / 1000)

export function AssetMapWidget({
  positions,
  adapter,
  initialMode = 'peek',
  position = 'top-right',
  staleThresholdSeconds = DEFAULT_STALE,
  nowSeconds = defaultNow,
  title = 'Asset map',
  onModeChange,
}: AssetMapWidgetProps) {
  const [mode, setModeRaw] = useState<AssetMapWidgetMode>(initialMode)
  const setMode = (next: AssetMapWidgetMode) => {
    setModeRaw(next)
    onModeChange?.(next)
  }

  const valid = useMemo(() => positions.filter(isValidPosition), [positions])
  const now = nowSeconds()
  const staleCount = useMemo(
    () => valid.reduce((n, p) => (now - p.timestamp > staleThresholdSeconds ? n + 1 : n), 0),
    [valid, now, staleThresholdSeconds],
  )

  if (mode === 'peek') {
    return (
      <div className={styles['host']} data-position={position}>
        <button
          type="button"
          className={styles['peek']}
          onClick={() => setMode('panel')}
          aria-label={`Open ${title} (${valid.length} assets${staleCount > 0 ? `, ${staleCount} stale` : ''})`}
        >
          <span className={styles['peekIcon']} aria-hidden="true">🛰️</span>
          <span>{title}</span>
          <span className={styles['peekCount']}>· {valid.length}</span>
          {staleCount > 0 && (
            <span
              className={styles['staleDot']}
              title={`${staleCount} stale position${staleCount === 1 ? '' : 's'}`}
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    )
  }

  const isFullscreen = mode === 'fullscreen'
  return (
    <div
      className={isFullscreen ? styles['fullscreen'] : styles['host']}
      data-position={isFullscreen ? undefined : position}
      role="dialog"
      aria-label={title}
    >
      <div className={isFullscreen ? styles['fullscreen'] : styles['panel']}>
        <div className={styles['toolbar']}>
          <span className={styles['title']}>
            {title}
            <span className={styles['subtitle']}>
              {valid.length} asset{valid.length === 1 ? '' : 's'}
              {staleCount > 0 ? ` · ${staleCount} stale` : ''}
            </span>
          </span>
          {!isFullscreen && (
            <button
              type="button"
              className={styles['iconBtn']}
              onClick={() => setMode('fullscreen')}
              aria-label="Expand to fullscreen"
              title="Expand"
            >
              ⤢
            </button>
          )}
          {isFullscreen && (
            <button
              type="button"
              className={styles['iconBtn']}
              onClick={() => setMode('panel')}
              aria-label="Restore panel"
              title="Restore"
            >
              ⤡
            </button>
          )}
          <button
            type="button"
            className={styles['iconBtn']}
            onClick={() => setMode('peek')}
            aria-label="Minimize"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className={styles['body']}>
          {adapter
            ? <AdapterMount adapter={adapter} positions={valid} />
            : <FallbackPlot positions={valid} now={now} staleThresholdSeconds={staleThresholdSeconds} />}
        </div>
      </div>
    </div>
  )
}

// ─── Adapter mount ────────────────────────────────────────────────────────

interface AdapterMountProps {
  readonly adapter: WorksCalendarMapAdapter
  readonly positions: readonly AssetTrackerPosition[]
}

function AdapterMount({ adapter, positions }: AdapterMountProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  // Mount/destroy keyed on adapter identity so a host swapping renderers
  // gets a clean teardown of the previous one.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    adapter.mount(el)
    return () => adapter.destroy()
  }, [adapter])
  // Position updates are pushed every render so the adapter can decide
  // its own diffing strategy.
  useEffect(() => { adapter.updatePositions(positions) }, [adapter, positions])
  return <div ref={ref} className={styles['adapterMount']} />
}

// ─── Fallback SVG plot ────────────────────────────────────────────────────

interface FallbackPlotProps {
  readonly positions: readonly AssetTrackerPosition[]
  readonly now: number
  readonly staleThresholdSeconds: number
}

function FallbackPlot({ positions, now, staleThresholdSeconds }: FallbackPlotProps) {
  if (positions.length === 0) {
    return <div className={styles['empty']}>No live positions yet.</div>
  }

  // Bounding-box-fit projection: no tile dependency, just enough to show
  // relative geography. Hosts that need a real basemap supply an adapter.
  const W = 360
  const H = 240
  const PAD = 16
  let project: (p: AssetTrackerPosition) => { x: number; y: number }
  if (positions.length === 1) {
    project = () => ({ x: W / 2, y: H / 2 })
  } else {
    const lats = positions.map(p => p.lat)
    const lons = positions.map(p => p.lon)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLon = Math.min(...lons), maxLon = Math.max(...lons)
    const dLat = maxLat - minLat || 1
    const dLon = maxLon - minLon || 1
    project = ({ lat, lon }) => ({
      x: PAD + ((lon - minLon) / dLon) * (W - 2 * PAD),
      y: PAD + (1 - (lat - minLat) / dLat) * (H - 2 * PAD),
    })
  }

  return (
    <div className={styles['fallback']}>
      <svg
        className={styles['fallbackSvg']}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${positions.length} asset position${positions.length === 1 ? '' : 's'}`}
      >
        {positions.map(p => {
          const { x, y } = project(p)
          const stale = now - p.timestamp > staleThresholdSeconds
          return (
            <circle
              key={p.id}
              cx={x}
              cy={y}
              r={4}
              className={stale ? styles['fallbackDotStale'] : styles['fallbackDot']}
            >
              <title>{p.label}{stale ? ' (stale)' : ''}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}

export default AssetMapWidget

/**
 * The dispatch board — header chrome + tactical map + asset sidebar +
 * time slider + footer status. Asset-agnostic: events with `meta.lat/lng`
 * + `meta.facilityCode` (and optional `assets` rows with `meta.color`)
 * drive everything.
 *
 * Wired into WorksCalendar via `src/views/DispatchView.tsx` — that
 * adapter pulls normalized events + assets from the calendar context
 * and hands them off here.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import '../../styles/tailwind.css';
import { TacticalMap } from './TacticalMap';
import { AssetSidebar } from './AssetSidebar';
import { TimeSlider } from './TimeSlider';
import { deriveDispatchData } from './deriveData';
import { deriveConflicts } from './deriveConflicts';
import { DatePickerDropdown } from '../../ui/DatePickerDropdown';
import type { MapLayer } from './types';
import type { NormalizedEvent } from 'works-calendar-engine';

export interface DispatchAssetEntry {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly meta?: Record<string, unknown>;
}

export interface DispatchBoardProps {
  readonly events: readonly NormalizedEvent[];
  readonly assets?: readonly DispatchAssetEntry[];
  /** Initial "now" — only consulted when no controlled `currentDate` is
   *  supplied. Defaults to current wall clock. */
  readonly initialDate?: Date;
  /** Controlled "as of" timestamp. When provided, the board uses this as
   *  its single source of truth and any slider / date-picker change
   *  emits via `onCurrentDateChange`. Keeps the dispatch view in sync
   *  with the host calendar's currentDate when both are rendered. */
  readonly currentDate?: Date;
  readonly onCurrentDateChange?: (d: Date) => void;
  /** Optional view-switcher tabs to render inline in the board header,
   *  used when the host calendar hands over its full chrome to this view. */
  readonly viewSwitcher?: ReactNode;
  /** Optional host-provided route-waypoint lookup. When present and the
   *  lookup returns a non-empty list for a leg's `from`/`to` facility
   *  codes, the breadcrumb traces those waypoints as a polyline. */
  readonly getRouteWaypoints?: (fromCode: string, toCode: string) => readonly { lat: number; lng: number }[] | null;
}

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: 'region', label: 'Region' },
  { id: 'state', label: 'State' },
  { id: '5k', label: '5k ft' },
  { id: '1k', label: '1k ft' },
];

export function DispatchBoard({
  events, assets = [], initialDate, currentDate, onCurrentDateChange, viewSwitcher,
  getRouteWaypoints,
}: DispatchBoardProps) {
  const [uncontrolledDate, setUncontrolledDate] = useState<Date>(() => {
    if (currentDate) return currentDate;
    if (initialDate) return initialDate;
    // Default: median event time so the slider lands inside the dataset's
    // window. Falls through to real "now" only when there are no events.
    if (events.length === 0) return new Date();
    const sorted = [...events].map((e) => e.start.getTime()).sort((a, b) => a - b);
    return new Date(sorted[Math.floor(sorted.length / 2)]!);
  });
  const selectedDate = currentDate ?? uncontrolledDate;
  const setSelectedDate = (next: Date) => {
    if (onCurrentDateChange) onCurrentDateChange(next);
    if (currentDate === undefined) setUncontrolledDate(next);
  };
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [layer, setLayer] = useState<MapLayer>('region');

  const derived = useMemo(() => deriveDispatchData(events, assets), [events, assets]);
  const conflicts = useMemo(
    () => deriveConflicts(derived.facilities, derived.stopsByAsset),
    [derived.facilities, derived.stopsByAsset],
  );

  const todayConflicts = useMemo(() => {
    const dayStart = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    return conflicts.filter((c) => c.timeA.getTime() >= dayStart.getTime() && c.timeA.getTime() < dayEnd.getTime());
  }, [conflicts, selectedDate]);

  const conflictFacilities = useMemo(
    () => new Set(todayConflicts.map((c) => c.facilityCode)),
    [todayConflicts],
  );

  // Roll up driver HOS / duty-day totals for the currently-selected day so
  // the sidebar can surface FMCSA-style violations alongside the dock
  // conflict badge. Reads shift-class events (kind === 'shift') emitted
  // by the host alongside the stop / leg event streams.
  const hosByAsset = useMemo(() => {
    const dayStart = new Date(
      Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const map = new Map<string, { dutyHours: number; drivingHours: number; flags: string[] }>();
    for (const ev of events) {
      const meta = (ev.meta ?? {}) as Record<string, unknown>;
      if (meta['kind'] !== 'shift') continue;
      const start = ev.start instanceof Date ? ev.start : new Date(ev.start as string);
      if (start.getTime() < dayStart.getTime() || start.getTime() >= dayEnd.getTime()) continue;
      const flags = Array.isArray(meta['hosFlags']) ? (meta['hosFlags'] as string[]) : [];
      const dutyHours = typeof meta['dutyHours'] === 'number' ? (meta['dutyHours'] as number) : 0;
      const drivingHours = typeof meta['drivingHours'] === 'number' ? (meta['drivingHours'] as number) : 0;
      const key = ev.resource ?? '';
      if (key) map.set(key, { dutyHours, drivingHours, flags });
    }
    return map;
  }, [events, selectedDate]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: '#e8dcc8' }}>
      {/* Header */}
      <header className="h-10 flex items-center px-3 border-b-2 border-[#3d2b1f]/30 bg-[#d4c4a8] flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {viewSwitcher}
          <DatePickerDropdown
            currentDate={selectedDate}
            label={selectedDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
            onDateChange={(d) => {
              // Preserve the current hour/minute when picking a new month —
              // we want to scrub to the same time-of-day in a different week.
              const next = new Date(d);
              next.setUTCHours(selectedDate.getUTCHours(), selectedDate.getUTCMinutes(), 0, 0);
              setSelectedDate(next);
            }}
            onToday={() => setSelectedDate(new Date())}
            onPrev={() => {
              const d = new Date(selectedDate);
              d.setUTCDate(d.getUTCDate() - 1);
              setSelectedDate(d);
            }}
            onNext={() => {
              const d = new Date(selectedDate);
              d.setUTCDate(d.getUTCDate() + 1);
              setSelectedDate(d);
            }}
          />
        </div>
        <div className="flex items-center gap-4">
          {todayConflicts.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#c0392b]">
              <span className="w-2 h-2 rounded-full bg-[#c0392b] animate-pulse" />
              {todayConflicts.length} CONFLICTS
              <span className="text-[#5a3e2b] font-normal ml-1">
                ({conflictFacilities.size} facilities)
              </span>
            </div>
          )}
          <div className="flex gap-1">
            <button
              type="button"
              className="h-6 text-[10px] px-2 bg-transparent border border-[#3d2b1f]/30 text-[#3d2b1f] hover:bg-[#3d2b1f]/10 rounded-sm"
              onClick={() => setSelectedAsset(null)}
            >
              CLEAR
            </button>
          </div>
        </div>
      </header>

      {/* Main body */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 flex-shrink-0">
          <AssetSidebar
            assets={derived.assets}
            facilities={derived.facilities}
            stopsByAsset={derived.stopsByAsset}
            conflicts={conflicts}
            selectedDate={selectedDate}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            hosByAsset={hosByAsset}
          />
        </div>

        <div className="flex-1 relative">
          <TacticalMap
            assets={derived.assets}
            facilities={derived.facilities}
            stopsByAsset={derived.stopsByAsset}
            segmentsByAsset={derived.segmentsByAsset}
            conflicts={conflicts}
            selectedDate={selectedDate}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
            layer={layer}
            {...(getRouteWaypoints ? { getRouteWaypoints } : {})}
          />

          {/* Layer switcher */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            {LAYERS.map((l) => {
              const active = layer === l.id;
              return (
                <button
                  key={l.id}
                  className={[
                    'px-2 py-1 text-[10px] font-bold border border-[#3d2b1f]/30 transition-colors rounded-sm',
                    active
                      ? 'bg-[#3d2b1f] text-[#f5e6c8]'
                      : 'bg-[#f5e6c8]/90 text-[#3d2b1f] hover:bg-[#3d2b1f]/10',
                  ].join(' ')}
                  onClick={() => setLayer(l.id)}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-[#f5e6c8]/90 border border-[#3d2b1f]/30 p-2 rounded-sm text-[9px] text-[#5a3e2b]">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="inline-block w-3 h-1 bg-[#3d2b1f]" />
              <span>Traveled</span>
            </div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="inline-block w-3 h-0 border-t-2 border-dashed border-[#999]" />
              <span>Scheduled</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0 border-t-2 border-dashed border-[#c0392b]" />
              <span className="text-[#c0392b] font-bold">Conflict</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: time slider + per-asset Gantt */}
      <div className="h-44 flex-shrink-0">
        <TimeSlider
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedAsset={selectedAsset}
          assets={derived.assets}
          segmentsByAsset={derived.segmentsByAsset}
        />
      </div>

      {/* Footer */}
      <div className="h-7 flex items-center justify-between px-4 border-t-2 border-[#3d2b1f]/30 bg-[#d4c4a8] flex-shrink-0">
        <div className="flex items-center gap-3 text-[9px] text-[#5a3e2b]">
          <span>{derived.assets.length} ASSETS</span>
          <span>{derived.facilities.length} FACILITIES</span>
          <span>{todayConflicts.length} ACTIVE CONFLICTS</span>
        </div>
        <div className="text-[9px] text-[#7a6e5b] font-mono">works-calendar-engine</div>
      </div>
    </div>
  );
}

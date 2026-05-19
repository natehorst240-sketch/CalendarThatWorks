/**
 * Time slider + mini Gantt for the dispatch view.
 *
 * Day + hour sliders scrub the visibleAt timestamp; selecting an asset
 * draws its route legs in the mini Gantt strip. Past legs render solid;
 * future legs render dimmed.
 *
 * Ported from `demo/app/src/components/TimeSlider.tsx`. Window
 * (default 14 days) and origin date are configurable via props so
 * the slider doesn't hardcode the truck demo's July 2025 baseline.
 */
import { useEffect, useMemo, useState } from 'react';
import { Slider } from './Slider';
import type { DispatchAsset, DispatchSegment } from './types';

interface Props {
  readonly selectedDate: Date;
  readonly onDateChange: (date: Date) => void;
  readonly selectedAsset: string | null;
  readonly assets: readonly DispatchAsset[];
  readonly segmentsByAsset: ReadonlyMap<string, DispatchSegment[]>;
  /** Origin (day 0) of the 14-day window. Defaults to selectedDate − 4 days. */
  readonly windowOrigin?: Date;
  /** Length of the day window. Default 14. */
  readonly windowDays?: number;
}

const HOURS_PER_DAY = 24;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

export function TimeSlider({
  selectedDate,
  onDateChange,
  selectedAsset,
  assets,
  segmentsByAsset,
  windowOrigin,
  windowDays = 14,
}: Props) {
  // Anchor the window once and only re-anchor when the consumer overrides
  // it explicitly OR the current selection scrubs outside the visible
  // range. Recomputing origin on every selectedDate change made the
  // window track the thumb, pinning the slider position visually even
  // though the underlying date was advancing.
  const [origin, setOrigin] = useState<Date>(() => {
    if (windowOrigin) return windowOrigin;
    const d = new Date(selectedDate);
    d.setUTCDate(d.getUTCDate() - Math.floor(windowDays / 2));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  });
  // Sync to an externally-supplied origin if it changes.
  useEffect(() => {
    if (windowOrigin) setOrigin(windowOrigin);
  }, [windowOrigin]);
  // Re-anchor if the selection scrubs outside the current window — keeps
  // the thumb on-screen when the calendar jumps to a far-away date.
  useEffect(() => {
    const diffDays = Math.floor((selectedDate.getTime() - origin.getTime()) / MS_PER_DAY);
    if (diffDays < 0 || diffDays >= windowDays) {
      const d = new Date(selectedDate);
      d.setUTCDate(d.getUTCDate() - Math.floor(windowDays / 2));
      d.setUTCHours(0, 0, 0, 0);
      setOrigin(d);
    }
  }, [selectedDate, origin, windowDays]);

  // Index that today's wall-clock date falls on within the window — used
  // for the dashed red "now" cursor and the bottom-row TODAY tick.
  const todayIndex = useMemo(() => {
    const t = new Date();
    t.setUTCHours(0, 0, 0, 0);
    const diff = Math.floor((t.getTime() - origin.getTime()) / MS_PER_DAY);
    return diff >= 0 && diff < windowDays ? diff : -1;
  }, [origin, windowDays]);

  const days = useMemo(
    () =>
      Array.from({ length: windowDays }, (_, i) => {
        const d = new Date(origin);
        d.setUTCDate(d.getUTCDate() + i);
        return {
          index: i,
          date: d,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
          isToday: i === todayIndex,
        };
      }),
    [origin, windowDays, todayIndex],
  );

  const currentDay = useMemo(() => {
    const diff = selectedDate.getTime() - origin.getTime();
    return Math.max(0, Math.min(windowDays - 1, Math.floor(diff / MS_PER_DAY)));
  }, [selectedDate, origin, windowDays]);

  const selectedAssetData = assets.find((a) => a.id === selectedAsset) ?? null;
  const segments = selectedAsset ? segmentsByAsset.get(selectedAsset) ?? [] : [];

  const handleDayChange = (value: number[]) => {
    const dayIndex = value[0] ?? 0;
    const next = new Date(origin);
    next.setUTCDate(next.getUTCDate() + dayIndex);
    next.setUTCHours(selectedDate.getUTCHours(), selectedDate.getUTCMinutes(), 0, 0);
    onDateChange(next);
  };

  const handleHourChange = (value: number[]) => {
    const d = new Date(selectedDate);
    d.setUTCHours(value[0] ?? 0, 0, 0, 0);
    onDateChange(d);
  };

  return (
    <div className="h-full flex bg-[#f5e6c8] border-t-2 border-[#3d2b1f]/30">
      {/* Day + Hour controls */}
      <div className="w-64 flex-shrink-0 border-r border-[#3d2b1f]/20 px-3 py-2 flex flex-col justify-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-serif text-[#5a3e2b] uppercase tracking-wider w-8">Day</span>
          <Slider
            value={[currentDay]}
            onValueChange={handleDayChange}
            min={0}
            max={windowDays - 1}
            step={1}
            className="flex-1"
          />
          <span className="text-[10px] font-bold text-[#3d2b1f] w-16 text-right">
            {days[currentDay]?.label ?? ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-serif text-[#5a3e2b] uppercase tracking-wider w-8">Hr</span>
          <Slider
            value={[selectedDate.getUTCHours()]}
            onValueChange={handleHourChange}
            min={0}
            max={HOURS_PER_DAY - 1}
            step={1}
            className="flex-1"
          />
          <span className="text-[10px] font-bold text-[#3d2b1f] w-16 text-right">
            {selectedDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'UTC' })}
          </span>
        </div>

        <div className="flex gap-0 mt-0.5">
          {days.map((d) => (
            <div
              key={d.index}
              className="flex-1 text-center text-[7px]"
              style={{ color: d.isToday ? '#c0392b' : '#7a6e5b' }}
            >
              {d.isToday ? 'TODAY' : d.date.getUTCDate()}
            </div>
          ))}
        </div>
      </div>

      {/* Mini Gantt for the selected asset */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-3 pt-2 text-[10px] font-serif text-[#5a3e2b] uppercase tracking-wider">
          {selectedAssetData
            ? `${selectedAssetData.id} — ${selectedAssetData.name}`
            : 'Select an asset to view route timeline'}
        </div>
        {selectedAssetData ? (
          <>
            {/* Date headers strip — one cell per day, evenly distributed
                 across the timeline so bars align with their date column. */}
            <div className="flex border-b border-[#3d2b1f]/20 mt-1">
              {days.map((d) => (
                <div
                  key={d.index}
                  className="flex-1 px-1 py-0.5 text-center border-r border-[#3d2b1f]/10 last:border-r-0 leading-tight"
                  style={{ minWidth: 0 }}
                >
                  <div
                    className="text-[9px] font-bold"
                    style={{ color: d.isToday ? '#c0392b' : '#3d2b1f' }}
                  >
                    {d.date.getUTCDate()}
                  </div>
                  <div className="text-[7px] uppercase tracking-wide text-[#7a6e5b]">
                    {d.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                  </div>
                </div>
              ))}
            </div>

            {/* Gantt body — bars positioned as % of the windowDays timeline.
                 Day gridlines + today/selected cursors render as absolutely
                 positioned overlays so bars and grid stay aligned. */}
            <div className="flex-1 relative overflow-hidden">
              {/* Day gridlines */}
              {Array.from({ length: windowDays + 1 }, (_, i) => (
                <div
                  key={`grid-${i}`}
                  className="absolute top-0 bottom-0 border-l border-[#3d2b1f]/15"
                  style={{ left: `${(i / windowDays) * 100}%` }}
                />
              ))}
              {/* Wall-clock "now" cursor (dashed red) */}
              {todayIndex >= 0 && (
                <div
                  className="absolute top-0 bottom-0 border-l border-dashed border-[#c0392b]/60 pointer-events-none"
                  style={{ left: `${(todayIndex / windowDays) * 100}%` }}
                  aria-hidden
                />
              )}
              {/* Selected-time cursor (solid black) */}
              <div
                className="absolute top-0 bottom-0 border-l-2 border-[#3d2b1f] pointer-events-none"
                style={{
                  left: `${
                    ((currentDay * HOURS_PER_DAY + selectedDate.getUTCHours()) /
                      (windowDays * HOURS_PER_DAY)) *
                    100
                  }%`,
                }}
                aria-hidden
              />
              {/* Route bars */}
              {segments.map((seg, i) => {
                const startHour =
                  (seg.from.time.getTime() - origin.getTime()) / MS_PER_HOUR;
                const endHour =
                  (seg.to.time.getTime() - origin.getTime()) / MS_PER_HOUR;
                const totalHours = windowDays * HOURS_PER_DAY;
                const leftPct = Math.max(0, (startHour / totalHours) * 100);
                const widthPct = Math.max(
                  0.6,
                  ((endHour - startHour) / totalHours) * 100,
                );
                const isPast = seg.to.time.getTime() <= selectedDate.getTime();
                const lane = i % 3;
                const fromTime = seg.from.time.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  hour12: true,
                  timeZone: 'UTC',
                });
                const toTime = seg.to.time.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  hour12: true,
                  timeZone: 'UTC',
                });
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onDateChange(new Date(seg.from.time))}
                    title={`${seg.from.facilityCode} → ${seg.to.facilityCode}\n${fromTime} – ${toTime}`}
                    className="absolute rounded-sm text-[9px] font-medium text-white overflow-hidden whitespace-nowrap px-1 leading-[18px] border border-black/10 hover:ring-2 hover:ring-[#3d2b1f] hover:z-10 focus:outline-none focus:ring-2 focus:ring-[#3d2b1f] focus:z-10"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      top: `${6 + lane * 22}px`,
                      height: '18px',
                      background: isPast ? selectedAssetData.color : '#999',
                      opacity: isPast ? 0.95 : 0.55,
                    }}
                  >
                    {seg.from.facilityCode}→{seg.to.facilityCode}
                  </button>
                );
              })}
              {segments.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#7a6e5b] italic">
                  No route segments in this window
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[10px] text-[#7a6e5b] italic">
            Click an asset on the map or sidebar to see its route
          </div>
        )}
      </div>
    </div>
  );
}

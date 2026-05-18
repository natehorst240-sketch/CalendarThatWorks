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
import { useMemo } from 'react';
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
  const origin = useMemo<Date>(() => {
    if (windowOrigin) return windowOrigin;
    const d = new Date(selectedDate);
    d.setUTCDate(d.getUTCDate() - 4);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [windowOrigin, selectedDate]);

  const days = useMemo(
    () =>
      Array.from({ length: windowDays }, (_, i) => {
        const d = new Date(origin);
        d.setUTCDate(d.getUTCDate() + i);
        return {
          index: i,
          date: d,
          label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
          isToday: i === Math.floor(windowDays / 2 - 3),
        };
      }),
    [origin, windowDays],
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
              {d.isToday ? 'TODAY' : d.label.split(' ')[0]}
            </div>
          ))}
        </div>
      </div>

      {/* Mini Gantt for the selected asset */}
      <div className="flex-1 px-3 py-2 overflow-hidden">
        <div className="text-[10px] font-serif text-[#5a3e2b] uppercase tracking-wider mb-1">
          {selectedAssetData
            ? `${selectedAssetData.id} — ${selectedAssetData.name}`
            : 'Select an asset to view route timeline'}
        </div>
        {selectedAssetData ? (
          <svg
            viewBox={`0 0 ${windowDays * HOURS_PER_DAY} 60`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Day gridlines */}
            {Array.from({ length: windowDays + 1 }, (_, i) => (
              <line
                key={i}
                x1={i * HOURS_PER_DAY}
                y1={0}
                x2={i * HOURS_PER_DAY}
                y2={60}
                stroke="#3d2b1f"
                strokeWidth={0.3}
                opacity={0.2}
              />
            ))}
            {/* "Now" cursor (interpreted as the originally-loaded "today" at the
                 midpoint of the window) — dashed red guide */}
            <line
              x1={Math.floor(windowDays / 2 - 3) * HOURS_PER_DAY}
              y1={0}
              x2={Math.floor(windowDays / 2 - 3) * HOURS_PER_DAY}
              y2={60}
              stroke="#c0392b"
              strokeWidth={1}
              opacity={0.5}
              strokeDasharray="4,2"
            />
            {/* Current selectedDate cursor — solid */}
            {(() => {
              const dayOffset = currentDay * HOURS_PER_DAY;
              const x = dayOffset + selectedDate.getUTCHours();
              return <line x1={x} y1={0} x2={x} y2={60} stroke="#3d2b1f" strokeWidth={1.5} />;
            })()}
            {/* Route bars */}
            {segments.map((seg, i) => {
              const startHour = (seg.from.time.getTime() - origin.getTime()) / MS_PER_HOUR;
              const endHour = (seg.to.time.getTime() - origin.getTime()) / MS_PER_HOUR;
              const isPast = seg.to.time.getTime() <= selectedDate.getTime();
              return (
                <g key={i}>
                  <rect
                    x={startHour}
                    y={12 + (i % 3) * 16}
                    width={Math.max(endHour - startHour, 2)}
                    height={12}
                    rx={2}
                    fill={isPast ? selectedAssetData.color : '#999'}
                    opacity={isPast ? 0.9 : 0.3}
                  />
                  {endHour - startHour > 20 && (
                    <text
                      x={startHour + 2}
                      y={22 + (i % 3) * 16}
                      fontSize={5}
                      fill="#fff"
                      fontFamily="sans-serif"
                    >
                      {seg.from.facilityCode}→{seg.to.facilityCode}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="h-full flex items-center justify-center text-[10px] text-[#7a6e5b] italic">
            Click an asset on the map or sidebar to see its route
          </div>
        )}
      </div>
    </div>
  );
}

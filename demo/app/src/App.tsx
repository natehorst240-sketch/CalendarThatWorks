import { useState } from "react";
import TacticalMap from "@/components/TacticalMap";
import TruckSidebar from "@/components/TruckSidebar";
import TimeSlider from "@/components/TimeSlider";
import { FACILITIES, ALL_CONFLICTS } from "@/data/trucks";
import type { MapLayer } from "@/data/trucks";
import { Button } from "@/components/ui/button";

const LAYERS: { id: MapLayer; label: string }[] = [
  { id: "region", label: "Region" },
  { id: "state", label: "State" },
  { id: "5k", label: "5k ft" },
  { id: "1k", label: "1k ft" },
];

export default function App() {
  // "Today" is July 11, 2025 (Friday)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(Date.UTC(2025, 6, 8, 14, 0))); // Tuesday = most conflicts
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);
  const [layer, setLayer] = useState<MapLayer>("region");

  const dayStart = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const conflicts = ALL_CONFLICTS.filter((c) => {
    const t = new Date(c.timeA);
    return t >= dayStart && t < dayEnd;
  });
  const conflictFacilities = new Set(conflicts.map((c) => c.facility));

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "#e8dcc8" }}>
      {/* Header */}
      <header className="h-10 flex items-center justify-between px-4 border-b-2 border-[#3d2b1f]/30 bg-[#d4c4a8] flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-base font-bold text-[#3d2b1f] tracking-wider">
            DISPATCH BOARD
          </h1>
          <span className="text-[10px] text-[#5a3e2b] font-mono">
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "UTC",
            })}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {conflicts.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#c0392b]">
              <span className="w-2 h-2 rounded-full bg-[#c0392b] animate-pulse" />
              {conflicts.length} CONFLICTS
              <span className="text-[#5a3e2b] font-normal ml-1">
                ({conflictFacilities.size} facilities)
              </span>
            </div>
          )}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 bg-transparent border-[#3d2b1f]/30 text-[#3d2b1f] hover:bg-[#3d2b1f]/10"
              onClick={() => setSelectedDate(new Date(Date.UTC(2025, 6, 11, 12, 0)))}
            >
              NOW
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 bg-transparent border-[#3d2b1f]/30 text-[#3d2b1f] hover:bg-[#3d2b1f]/10"
              onClick={() => setSelectedTruck(null)}
            >
              CLEAR
            </Button>
          </div>
        </div>
      </header>

      {/* Main body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-56 flex-shrink-0">
          <TruckSidebar
            selectedDate={selectedDate}
            selectedTruck={selectedTruck}
            onSelectTruck={setSelectedTruck}
          />
        </div>

        {/* Map area */}
        <div className="flex-1 relative">
          <TacticalMap
            selectedDate={selectedDate}
            selectedTruck={selectedTruck}
            onSelectTruck={setSelectedTruck}
            layer={layer}
          />

          {/* Layer switcher overlay */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            {LAYERS.map((l) => {
              const active = layer === l.id;
              return (
                <button
                  key={l.id}
                  className={[
                    "px-2 py-1 text-[10px] font-bold border border-[#3d2b1f]/30 transition-colors rounded-sm",
                    active
                      ? "bg-[#3d2b1f] text-[#f5e6c8]"
                      : "bg-[#f5e6c8]/90 text-[#3d2b1f] hover:bg-[#3d2b1f]/10",
                  ].join(" ")}
                  onClick={() => setLayer(l.id)}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          {/* Legend overlay */}
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

      {/* Bottom panel — time slider + gantt */}
      <div className="h-36 flex-shrink-0">
        <TimeSlider
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedTruck={selectedTruck}
        />
      </div>

      {/* Bottom bar */}
      <div className="h-7 flex items-center justify-between px-4 border-t-2 border-[#3d2b1f]/30 bg-[#d4c4a8] flex-shrink-0">
        <div className="flex items-center gap-3 text-[9px] text-[#5a3e2b]">
          <span>30 TRUCKS</span>
          <span>{Object.keys(FACILITIES).length} FACILITIES</span>
          <span>{conflicts.length} ACTIVE CONFLICTS</span>
        </div>
        <div className="text-[9px] text-[#7a6e5b] font-mono">
          works-calendar-engine v0.1.0
        </div>
      </div>
    </div>
  );
}

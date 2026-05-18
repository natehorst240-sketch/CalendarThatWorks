/**
 * Asset sidebar — list of dispatchable assets with a conflict badge and
 * a "current location" hint, driven by the time slider's selected
 * timestamp. Click an asset to focus it on the map.
 *
 * Ported from `demo/app/src/components/TruckSidebar.tsx`. Renamed for
 * the asset-agnostic positioning.
 */
import { positionAt } from './deriveData';
import type {
  DispatchAsset,
  DispatchConflict,
  DispatchFacility,
  DispatchStop,
} from './types';

interface Props {
  readonly assets: readonly DispatchAsset[];
  readonly facilities: readonly DispatchFacility[];
  readonly stopsByAsset: ReadonlyMap<string, DispatchStop[]>;
  readonly conflicts: readonly DispatchConflict[];
  readonly selectedDate: Date;
  readonly selectedAsset: string | null;
  readonly onSelectAsset: (id: string) => void;
}

export function AssetSidebar({
  assets,
  facilities,
  stopsByAsset,
  conflicts,
  selectedDate,
  selectedAsset,
  onSelectAsset,
}: Props) {
  const dayStart = new Date(
    Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const todayConflicts = conflicts.filter(
    (c) => c.timeA.getTime() >= dayStart.getTime() && c.timeA.getTime() < dayEnd.getTime(),
  );
  const conflictedAssets = new Set<string>();
  for (const c of todayConflicts) {
    conflictedAssets.add(c.assetA);
    conflictedAssets.add(c.assetB);
  }

  const facilitiesByCode = new Map(facilities.map((f) => [f.code, f]));

  return (
    <div className="h-full flex flex-col border-r-2 border-[#3d2b1f]/20 bg-[#f5e6c8]">
      <div className="px-3 py-2 border-b border-[#3d2b1f]/20">
        <h2 className="font-serif text-sm font-bold text-[#3d2b1f] tracking-wider uppercase">
          Fleet Status
        </h2>
        <div className="flex gap-2 mt-1 text-[10px] text-[#5a3e2b]">
          <span>{assets.length} active</span>
          <span className="text-[#c0392b] font-bold">{conflictedAssets.size} conflicted</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <div className="py-1">
          {assets.map((asset) => {
            const pos = positionAt(stopsByAsset.get(asset.id), selectedDate);
            const fac = pos?.facilityCode ? facilitiesByCode.get(pos.facilityCode) : null;
            const hasConflict = conflictedAssets.has(asset.id);
            const isSelected = selectedAsset === asset.id;

            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelectAsset(isSelected ? '' : asset.id)}
                className={[
                  'w-full text-left px-3 py-2 border-b border-[#3d2b1f]/10 transition-all',
                  isSelected
                    ? 'bg-[#3d2b1f] text-white shadow-inner'
                    : 'hover:bg-[#3d2b1f]/5',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-white/50"
                    style={{ backgroundColor: asset.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-white' : 'text-[#3d2b1f]'}`}>
                        {asset.id}
                      </span>
                      {hasConflict && (
                        <span className="text-[9px] bg-[#c0392b] text-white px-1 rounded">
                          CONFLICT
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] truncate ${isSelected ? 'text-white/80' : 'text-[#5a3e2b]'}`}>
                      {asset.name}
                    </div>
                    <div className={`text-[9px] mt-0.5 ${isSelected ? 'text-white/60' : 'text-[#7a6e5b]'}`}>
                      {pos?.moving ? 'En route' : fac ? `@ ${fac.code}` : 'Unknown'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * BaseView — location-first grid. One row per configured base/region, with
 * sub-sections showing assets assigned there, employees assigned there, and
 * every event whose resource resolves to one of those (plus events tagged
 * directly via meta.base).
 *
 * Multi-base selection is driven by the onBaseSelectionChange callback so the
 * same widget feeds both the visible row set and any tab-scoped saved view.
 */
import { useMemo } from 'react';
import { format } from 'date-fns';
import { useCalendarContext, resolveColor } from '../core/CalendarContext';
import styles from './BaseView.module.css';

type BaseDef = { id: string; name: string };
type EmployeeDef = { id: string; name?: string; base?: string | null };
type AssetDef = { id: string; label?: string; meta?: { base?: string | null } | null };

export default function BaseView({
  currentDate,
  events,
  onEventClick,
  employees = [],
  assets = [],
  bases = [],
  locationLabel = 'Base',
  selectedBaseIds = [],
  onBaseSelectionChange,
}: {
  currentDate: Date
  events: any[]
  onEventClick?: (ev: any) => void
  employees?: EmployeeDef[]
  assets?: AssetDef[]
  bases?: BaseDef[]
  locationLabel?: string
  selectedBaseIds?: string[]
  onBaseSelectionChange?: (ids: string[]) => void
}) {
  const ctx = useCalendarContext();

  const visibleBases = useMemo(() => {
    if (selectedBaseIds.length === 0) return bases;
    const set = new Set(selectedBaseIds);
    return bases.filter(b => set.has(b.id));
  }, [bases, selectedBaseIds]);

  const empsByBase = useMemo(() => {
    const m = new Map<string, EmployeeDef[]>();
    employees.forEach(e => {
      if (!e.base) return;
      if (!m.has(e.base)) m.set(e.base, []);
      m.get(e.base)!.push(e);
    });
    return m;
  }, [employees]);

  const assetsByBase = useMemo(() => {
    const m = new Map<string, AssetDef[]>();
    assets.forEach(a => {
      const b = a?.meta?.base;
      if (!b) return;
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(a);
    });
    return m;
  }, [assets]);

  const eventsByBase = useMemo(() => {
    const m = new Map<string, any[]>();
    visibleBases.forEach(b => m.set(b.id, []));
    const empIndex = new Map<string, string>(); // empId -> baseId
    employees.forEach(e => { if (e.base) empIndex.set(e.id, e.base); });
    const assetIndex = new Map<string, string>();
    assets.forEach(a => { if (a?.meta?.base) assetIndex.set(a.id, a.meta.base!); });

    events.forEach(ev => {
      let bId: string | undefined = ev?.meta?.base;
      if (!bId && ev?.resource) {
        bId = empIndex.get(ev.resource) ?? assetIndex.get(ev.resource);
      }
      if (bId && m.has(bId)) m.get(bId)!.push(ev);
    });
    return m;
  }, [events, visibleBases, employees, assets]);

  const toggleBase = (id: string) => {
    if (!onBaseSelectionChange) return;
    const next = selectedBaseIds.includes(id)
      ? selectedBaseIds.filter(b => b !== id)
      : [...selectedBaseIds, id];
    onBaseSelectionChange(next);
  };

  if (bases.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No {locationLabel.toLowerCase()}s configured yet.</p>
        <p>Add one in Settings → Team → {locationLabel}s.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>
          {locationLabel}s · {format(currentDate, 'MMMM yyyy')}
        </span>
        <div className={styles.picker} role="group" aria-label={`Select ${locationLabel.toLowerCase()}s`}>
          {bases.map(b => {
            const active = selectedBaseIds.length === 0 || selectedBaseIds.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                className={[styles.pickerChip, active && styles.pickerChipActive].filter(Boolean).join(' ')}
                aria-pressed={active}
                onClick={() => toggleBase(b.id)}
              >
                {b.name}
              </button>
            );
          })}
          {selectedBaseIds.length > 0 && (
            <button
              type="button"
              className={styles.pickerClear}
              onClick={() => onBaseSelectionChange?.([])}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className={styles.rows}>
        {visibleBases.map(b => {
          const emps     = empsByBase.get(b.id)   ?? [];
          const baseAssets = assetsByBase.get(b.id) ?? [];
          const evs      = eventsByBase.get(b.id) ?? [];
          return (
            <section key={b.id} className={styles.row}>
              <header className={styles.rowHeader}>
                <span className={styles.rowTitle}>{b.name}</span>
                <span className={styles.rowCounts}>
                  {baseAssets.length} assets · {emps.length} people · {evs.length} events
                </span>
              </header>

              {baseAssets.length > 0 && (
                <div className={styles.section}>
                  <h4 className={styles.sectionLabel}>Assets</h4>
                  <ul className={styles.chipList}>
                    {baseAssets.map(a => (
                      <li key={a.id} className={styles.chip}>{a.label ?? a.id}</li>
                    ))}
                  </ul>
                </div>
              )}

              {emps.length > 0 && (
                <div className={styles.section}>
                  <h4 className={styles.sectionLabel}>People</h4>
                  <ul className={styles.chipList}>
                    {emps.map(e => (
                      <li key={e.id} className={styles.chip}>{e.name ?? e.id}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.section}>
                <h4 className={styles.sectionLabel}>Events</h4>
                {evs.length === 0 ? (
                  <p className={styles.emptyLine}>No events scheduled.</p>
                ) : (
                  <ul className={styles.eventList}>
                    {evs.map((ev, index) => {
                      const bg = resolveColor(ev, ctx.colorRules);
                      return (
                        <li key={ev.id ?? `${ev.title ?? 'untitled'}-${String(ev.start)}-${index}`} className={styles.eventRow}>
                          <button
                            type="button"
                            className={styles.eventBtn}
                            style={{ borderLeftColor: bg }}
                            onClick={() => onEventClick?.(ev)}
                          >
                            <span className={styles.eventTime}>
                              {format(ev.start, 'MMM d, p')}
                            </span>
                            <span className={styles.eventTitle}>{ev.title}</span>
                            {ev.category && (
                              <span className={styles.eventCategory}>{ev.category}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

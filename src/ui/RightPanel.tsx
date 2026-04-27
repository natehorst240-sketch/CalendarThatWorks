import type { ReactNode } from 'react';
import cls from './RightPanel.module.css';

// ──────────────────────────────────────────────────────────────────────────────
// Layout: wrapper + section
// ──────────────────────────────────────────────────────────────────────────────

export type RightPanelProps = {
  children?: ReactNode;
};

/** Docked aside in <AppShell>'s rightPanel slot. Fixed 240px wide. */
export function RightPanel({ children }: RightPanelProps) {
  return <div className={cls['root']}>{children}</div>;
}

export type RightPanelSectionProps = {
  title: string;
  children?: ReactNode;
};

/** Titled section block inside RightPanel. */
export function RightPanelSection({ title, children }: RightPanelSectionProps) {
  return (
    <section className={cls['section']} aria-label={title}>
      <header className={cls['sectionHeader']}>{title}</header>
      <div className={cls['sectionBody']}>{children}</div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Widget: region map (lightweight SVG plot of event coordinates)
// ──────────────────────────────────────────────────────────────────────────────

type EventLike = { id?: string | number; meta?: Record<string, unknown> | null };

function readCoords(ev: EventLike): { lat: number; lon: number } | null {
  const meta = ev.meta;
  if (!meta) return null;
  const c = meta['coords'];
  if (c && typeof c === 'object') {
    const co = c as Record<string, unknown>;
    const lat = co['lat'];
    const lon = co['lon'] ?? co['lng'];
    if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon };
  }
  const lat = meta['lat'];
  const lon = meta['lon'] ?? meta['lng'];
  if (typeof lat === 'number' && typeof lon === 'number') return { lat, lon };
  return null;
}

const MAP_W = 200;
const MAP_H = 120;
const MAP_PAD = 14;

export type RegionMapWidgetProps = {
  events: EventLike[];
};

/**
 * RegionMapWidget — slim SVG plot of event coordinates. Bounding-box-fit
 * projection (no tile layer, no maplibre dep). Renders an empty-state
 * message when no events carry coords.
 */
export function RegionMapWidget({ events }: RegionMapWidgetProps) {
  const points = events
    .map(e => {
      const c = readCoords(e);
      return c ? { id: String(e.id ?? ''), ...c } : null;
    })
    .filter((p): p is { id: string; lat: number; lon: number } => p !== null);

  if (points.length === 0) {
    return (
      <div className={cls['mapEmpty']} role="note">
        No events with coordinates yet.
      </div>
    );
  }

  // Single point: center it.
  // Multiple points: bounding-box fit with padding.
  let project: (p: { lat: number; lon: number }) => { x: number; y: number };
  if (points.length === 1) {
    project = () => ({ x: MAP_W / 2, y: MAP_H / 2 });
  } else {
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const dLat = maxLat - minLat || 1;
    const dLon = maxLon - minLon || 1;
    project = ({ lat, lon }) => ({
      x: MAP_PAD + ((lon - minLon) / dLon) * (MAP_W - 2 * MAP_PAD),
      // Latitude grows north; flip so higher lat is higher on the SVG.
      y: MAP_PAD + (1 - (lat - minLat) / dLat) * (MAP_H - 2 * MAP_PAD),
    });
  }

  const projected = points.map(p => ({ ...p, ...project(p) }));

  return (
    <svg
      className={cls['mapSvg']}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="img"
      aria-label={`${points.length} event${points.length === 1 ? '' : 's'} on the region map`}
    >
      {projected.map(p => (
        <circle key={p.id} cx={p.x} cy={p.y} r={3} className={cls['mapDot']} />
      ))}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Widget: crew list (configured team members)
// ──────────────────────────────────────────────────────────────────────────────

export type CrewMember = { id: string | number; name?: string };
export type CrewOnShiftListProps = {
  employees: CrewMember[];
  /**
   * When provided, narrows the rendered list to only the employees whose id
   * is in this set (matched by `String(emp.id)`). Pass `null` / omit to
   * render the full roster — the legacy "show everyone configured" mode.
   */
  onShiftIds?: ReadonlySet<string> | null | undefined;
};

function initials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

const AVATAR_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'];

/**
 * CrewOnShiftList — configured team members, optionally narrowed to those
 * whose schedule says they're working right now (see shiftEmployeeIdsAt).
 * Without `onShiftIds` the list renders the full roster so the panel still
 * has useful content for calendars that don't track shifts.
 */
export function CrewOnShiftList({ employees, onShiftIds }: CrewOnShiftListProps) {
  const filtered = onShiftIds
    ? employees.filter(emp => onShiftIds.has(String(emp.id)))
    : employees;

  if (employees.length === 0) {
    return (
      <div className={cls['crewEmpty']} role="note">
        No team members configured yet.
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div className={cls['crewEmpty']} role="note">
        Nobody is on shift right now.
      </div>
    );
  }
  return (
    <ul className={cls['crewList']}>
      {filtered.map((emp, i) => {
        const name = emp.name ?? String(emp.id);
        const swatch = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
        return (
          <li key={String(emp.id)} className={cls['crewItem']}>
            <span className={cls['crewAvatar']} style={{ background: swatch }} aria-hidden="true">
              {initials(emp.name)}
            </span>
            <span className={cls['crewName']}>{name}</span>
          </li>
        );
      })}
    </ul>
  );
}

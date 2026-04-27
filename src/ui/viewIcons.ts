/**
 * viewIcons.ts — Single source of truth for the lucide icon + accessible
 * label paired with each calendar view id.
 *
 * Used by:
 *   - ProfileBar (saved-view chip strip, where chips group under their view)
 *   - LeftRail   (icon rail in the AppShell — tap to switch view)
 *
 * Keep the keyset aligned with `ALL_VIEWS` in `WorksCalendar.tsx`. New
 * view ids should land here too so every surface that renders a view
 * picker gets the icon for free.
 */
import type { ComponentType, SVGProps } from 'react';
import {
  CalendarDays, Calendar, Columns3, List, CalendarRange,
  Boxes, MapPin, Radio, Map as MapIcon,
} from 'lucide-react';

export type ViewIconEntry = {
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  label: string;
};

export const VIEW_ICON_MAP: Record<string, ViewIconEntry> = {
  month:    { Icon: CalendarDays,  label: 'Month view' },
  week:     { Icon: Columns3,      label: 'Week view' },
  day:      { Icon: Calendar,      label: 'Day view' },
  agenda:   { Icon: List,          label: 'Agenda view' },
  schedule: { Icon: CalendarRange, label: 'Schedule view' },
  base:     { Icon: MapPin,        label: 'Base view' },
  assets:   { Icon: Boxes,         label: 'Assets view' },
  dispatch: { Icon: Radio,         label: 'Dispatch view' },
  map:      { Icon: MapIcon,       label: 'Map view' },
};

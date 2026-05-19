'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorksCalendar } from 'works-calendar';
import type { WorksCalendarEvent } from 'works-calendar';
import { createClient } from '@/lib/supabase/client';
import { AIRCRAFT, BASES, INSTRUCTORS, REGIONS, seedEvents } from '@/lib/seed/flightSchool';

interface Props {
  readonly userEmail: string | null;
}

const CALENDAR_ID = 'reference-host-v1';

// WorksCalendar reads its owner config (team registry, labels, etc) from
// localStorage under `wc-config-{calendarId}`. Seed it on first mount before
// the calendar reads it, so the Base / Schedule / Dispatch views all know
// about the airport list and use aviation-flavored labels.
function seedOwnerConfig() {
  if (typeof window === 'undefined') return;
  const key = `wc-config-${CALENDAR_ID}`;
  if (window.localStorage.getItem(key)) return;
  window.localStorage.setItem(
    key,
    JSON.stringify({
      title: 'Flight School',
      team: {
        locationLabel: 'Airport',
        assetsLabel: 'Aircraft',
        roles: ['CFI', 'CFII', 'MEI', 'Student', 'Dispatcher'],
        bases: BASES,
        regions: REGIONS,
      },
    }),
  );
}

export function CalendarMount({ userEmail }: Props) {
  const router = useRouter();
  const [events, setEvents] = useState<WorksCalendarEvent[]>(() => {
    seedOwnerConfig();
    return seedEvents();
  });

  // Wired up here so callers can see the shape of an event save handler
  // without the database round-trip — the Supabase persistence layer is
  // tracked as a follow-up. For now we mutate local state so the calendar
  // round-trip works in the demo.
  const onEventSave = (ev: WorksCalendarEvent) => {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.id === ev.id);
      if (idx === -1) return [...prev, ev];
      const next = [...prev];
      next[idx] = ev;
      return next;
    });
  };

  const employees = useMemo(
    () => INSTRUCTORS.map((i) => ({ id: i.id, name: i.name, role: i.role, base: i.base, color: i.color })),
    [],
  );

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#d4c4a8',
          borderBottom: '2px solid rgba(61,43,31,0.3)',
          fontSize: 13,
        }}
      >
        <strong>Flight School Schedule</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {userEmail && <span style={{ color: '#5a3e2b' }}>{userEmail}</span>}
          <button
            type="button"
            onClick={signOut}
            style={{
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid rgba(61,43,31,0.3)',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorksCalendar
          calendarId={CALENDAR_ID}
          initialView="schedule"
          events={events}
          assets={AIRCRAFT}
          employees={employees}
          onEventSave={onEventSave}
        />
      </div>
    </div>
  );
}

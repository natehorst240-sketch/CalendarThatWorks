'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WorksCalendar } from 'works-calendar';
import type { WorksCalendarEvent } from 'works-calendar';
import { createClient } from '@/lib/supabase/client';
import { AIRCRAFT, BASES, INSTRUCTORS, REGIONS, seedEvents } from '@/lib/seed/flightSchool';
import {
  bulkInsertEvents,
  deleteEvent,
  loadEvents,
  upsertEvent,
} from '@/lib/supabase/events';

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

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; events: WorksCalendarEvent[] }
  | { kind: 'error'; message: string };

export function CalendarMount({ userEmail }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => {
    seedOwnerConfig();
    return createClient();
  }, []);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [seeding, setSeeding] = useState(false);
  // Avoids a flash of optimism: when the user drags an event, we update local
  // state immediately and round-trip to Supabase in the background. If the
  // save fails we revert. This ref holds the pre-save snapshot for rollback.
  const lastSnapshotRef = useRef<WorksCalendarEvent[] | null>(null);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const events = await loadEvents(supabase);
        if (cancelled) return;
        setState(events.length === 0 ? { kind: 'empty' } : { kind: 'ready', events });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'error', message });
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const onEventSave = useCallback(
    async (ev: WorksCalendarEvent) => {
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        lastSnapshotRef.current = prev.events;
        const idx = prev.events.findIndex((e) => e.id === ev.id);
        const nextEvents = idx === -1 ? [...prev.events, ev] : prev.events.map((e, i) => (i === idx ? ev : e));
        return { kind: 'ready', events: nextEvents };
      });
      try {
        await upsertEvent(supabase, ev);
      } catch (err) {
        console.error('[reference-host] upsert failed, reverting', err);
        const snapshot = lastSnapshotRef.current;
        if (snapshot) {
          setState({ kind: 'ready', events: snapshot });
        }
      }
    },
    [supabase],
  );

  const onEventDelete = useCallback(
    async (eventId: string) => {
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        lastSnapshotRef.current = prev.events;
        return { kind: 'ready', events: prev.events.filter((e) => e.id !== eventId) };
      });
      try {
        await deleteEvent(supabase, eventId);
      } catch (err) {
        console.error('[reference-host] delete failed, reverting', err);
        const snapshot = lastSnapshotRef.current;
        if (snapshot) {
          setState({ kind: 'ready', events: snapshot });
        }
      }
    },
    [supabase],
  );

  const onSeedClick = useCallback(async () => {
    setSeeding(true);
    try {
      const demo = seedEvents();
      await bulkInsertEvents(supabase, demo);
      setState({ kind: 'ready', events: demo });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message });
    } finally {
      setSeeding(false);
    }
  }, [supabase]);

  const employees = useMemo(
    () => INSTRUCTORS.map((i) => ({ id: i.id, name: i.name, role: i.role, base: i.base, color: i.color })),
    [],
  );

  async function signOut() {
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
        {state.kind === 'loading' && <CenterMessage>Loading schedule…</CenterMessage>}
        {state.kind === 'error' && (
          <CenterMessage>
            <div style={{ color: '#c0392b', fontWeight: 600 }}>Couldn't load events</div>
            <div style={{ fontSize: 12, color: '#5a3e2b', marginTop: 6, maxWidth: 540, textAlign: 'center' }}>
              {state.message}
            </div>
            <div style={{ fontSize: 12, color: '#5a3e2b', marginTop: 12, maxWidth: 540, textAlign: 'center' }}>
              If this is the first time running, did you paste{' '}
              <code style={{ background: 'rgba(0,0,0,0.05)', padding: '0 4px' }}>supabase/schema.sql</code>{' '}
              into the Supabase SQL editor?
            </div>
          </CenterMessage>
        )}
        {state.kind === 'empty' && (
          <CenterMessage>
            <div style={{ fontWeight: 600 }}>No events yet</div>
            <div style={{ fontSize: 12, color: '#5a3e2b', marginTop: 6, maxWidth: 420, textAlign: 'center' }}>
              Seed a small flight-school dataset so you can see the calendar in action — 1 airport, 2
              aircraft, 2 CFIs, six lessons across today and tomorrow.
            </div>
            <button
              type="button"
              onClick={onSeedClick}
              disabled={seeding}
              style={{
                marginTop: 14,
                padding: '8px 14px',
                background: '#3d2b1f',
                color: '#f5e6c8',
                border: 'none',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 600,
                cursor: seeding ? 'wait' : 'pointer',
              }}
            >
              {seeding ? 'Seeding…' : 'Seed demo data'}
            </button>
          </CenterMessage>
        )}
        {state.kind === 'ready' && (
          <WorksCalendar
            calendarId={CALENDAR_ID}
            initialView="schedule"
            events={state.events}
            assets={AIRCRAFT}
            employees={employees}
            onEventSave={onEventSave}
            onEventDelete={onEventDelete}
          />
        )}
      </div>
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#3d2b1f',
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

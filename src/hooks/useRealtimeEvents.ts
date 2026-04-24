/**
 * useRealtimeEvents — subscribe to Supabase Realtime postgres_changes.
 * Returns live events and connection status.
 *
 * Usage:
 *   const { events, status } = useRealtimeEvents({
 *     supabaseClient,
 *     table: 'calendar_events',
 *     filter: 'calendar_id=eq.my-cal',
 *   });
 */
import { useState, useEffect, useRef } from 'react';

type RealtimeStatus = 'disabled' | 'connecting' | 'live' | 'error';
type RealtimeRow = any;

export function useRealtimeEvents({ supabaseClient, table, filter }: { supabaseClient: any; table?: string; filter?: string }): { events: RealtimeRow[]; status: RealtimeStatus } {
  const [events, setEvents] = useState<RealtimeRow[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>('disabled');
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!supabaseClient || !table) {
      setStatus('disabled');
      setEvents([]);
      return;
    }

    setStatus('connecting');

    const chanName = `wc-rt-${table}-${filter ?? 'all'}`;
    const pgFilter: { event: string; schema: string; table: any; filter?: any } = { event: '*', schema: 'public', table };
    if (filter) pgFilter.filter = filter;

    const channel = supabaseClient
      .channel(chanName)
      .on('postgres_changes', pgFilter, (payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setEvents((prev: RealtimeRow[]) => {
          switch (eventType) {
            case 'INSERT': return [...prev, newRow];
            case 'UPDATE': return prev.map((e: RealtimeRow) => String(e.id) === String(newRow.id) ? newRow : e);
            case 'DELETE': return prev.filter((e: RealtimeRow) => String(e.id) !== String(oldRow.id));
            default: return prev;
          }
        });
      })
      .subscribe((s: string) => {
        if (s === 'SUBSCRIBED')    setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error');
      });

    channelRef.current = channel;

    // Initial fetch — merged with any realtime rows that arrive before it resolves.
    // A cancelled flag guards against setState after unmount.
    let cancelled = false;
    supabaseClient
      .from(table)
      .select('*')
      .then(({ data, error }: { data: RealtimeRow[] | null; error: unknown }) => {
        if (cancelled || error || !data) return;
        setEvents((prev: RealtimeRow[]) => {
          // prev may already contain INSERT payloads from the realtime channel.
          // Build a map keyed by id: initial data wins for rows it knows about,
          // but any realtime rows not in the initial fetch are preserved.
          const map = new Map(data.map((r: RealtimeRow) => [String(r.id), r]));
          prev.forEach((r: RealtimeRow) => { if (!map.has(String(r.id))) map.set(String(r.id), r); });
          return [...map.values()];
        });
      })
      .catch(() => { /* select permission is optional */ });

    return () => {
      cancelled = true;
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [supabaseClient, table, filter]);

  return { events, status };
}

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

export function useRealtimeEvents({ supabaseClient, table, filter }: { supabaseClient: any; table: any; filter?: any }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('disabled');
  const channelRef = useRef(null);

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
      .on('postgres_changes', pgFilter, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setEvents(prev => {
          switch (eventType) {
            case 'INSERT': return [...prev, newRow];
            case 'UPDATE': return prev.map(e => String(e.id) === String(newRow.id) ? newRow : e);
            case 'DELETE': return prev.filter(e => String(e.id) !== String(oldRow.id));
            default: return prev;
          }
        });
      })
      .subscribe((s) => {
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
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setEvents(prev => {
          // prev may already contain INSERT payloads from the realtime channel.
          // Build a map keyed by id: initial data wins for rows it knows about,
          // but any realtime rows not in the initial fetch are preserved.
          const map = new Map(data.map(r => [String(r.id), r]));
          prev.forEach(r => { if (!map.has(String(r.id))) map.set(String(r.id), r); });
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

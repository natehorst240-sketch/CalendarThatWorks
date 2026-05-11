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

/**
 * A row delivered by Realtime or the initial select. The concrete shape is
 * consumer-defined (it mirrors their table columns); the hook only requires an
 * `id` it can key on when reconciling INSERT/UPDATE/DELETE events.
 */
export interface RealtimeRow {
  id: string | number;
  [key: string]: unknown;
}

interface RealtimePayload {
  eventType: string;
  new: RealtimeRow;
  old: RealtimeRow;
}

interface PostgresChangesFilter {
  event: string;
  schema: string;
  table: string;
  filter?: string;
}

/** The subset of the Supabase Realtime channel API this hook depends on. */
interface RealtimeChannelLike {
  on(
    type: 'postgres_changes',
    filter: PostgresChangesFilter,
    callback: (payload: RealtimePayload) => void,
  ): RealtimeChannelLike;
  subscribe(callback?: (status: string) => void): RealtimeChannelLike;
  unsubscribe(): void;
}

/** The subset of the Supabase client this hook depends on. */
export interface SupabaseRealtimeClientLike {
  channel(name: string): RealtimeChannelLike;
  from(table: string): {
    select(columns: string): Promise<{ data: RealtimeRow[] | null; error: unknown }>;
  };
  removeChannel?: (channel: RealtimeChannelLike) => void;
}

export function useRealtimeEvents({ supabaseClient, table, filter }: {
  supabaseClient: SupabaseRealtimeClientLike | null;
  table?: string | undefined;
  filter?: string | undefined;
}): { events: RealtimeRow[]; status: RealtimeStatus } {
  const [events, setEvents] = useState<RealtimeRow[]>([]);
  const [status, setStatus] = useState<RealtimeStatus>('disabled');
  const channelRef = useRef<RealtimeChannelLike | null>(null);

  useEffect(() => {
    if (!supabaseClient || !table) {
      setStatus('disabled');
      setEvents([]);
      return;
    }

    setStatus('connecting');

    const chanName = `wc-rt-${table}-${filter ?? 'all'}`;
    const pgFilter: PostgresChangesFilter = { event: '*', schema: 'public', table };
    if (filter) pgFilter.filter = filter;

    const channel = supabaseClient
      .channel(chanName)
      .on('postgres_changes', pgFilter, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        setEvents((prev) => {
          switch (eventType) {
            case 'INSERT': return [...prev, newRow];
            case 'UPDATE': return prev.map((e) => String(e.id) === String(newRow.id) ? newRow : e);
            case 'DELETE': return prev.filter((e) => String(e.id) !== String(oldRow.id));
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
        setEvents((prev) => {
          // prev may already contain INSERT payloads from the realtime channel.
          // Build a map keyed by id: initial data wins for rows it knows about,
          // but any realtime rows not in the initial fetch are preserved.
          const map = new Map(data.map((r) => [String(r.id), r]));
          prev.forEach((r) => { if (!map.has(String(r.id))) map.set(String(r.id), r); });
          return [...map.values()];
        });
      })
      .catch(() => { /* select permission is optional */ });

    return () => {
      cancelled = true;
      // removeChannel both unsubscribes the WebSocket and drops the channel
      // from supabaseClient.channels, which channel.unsubscribe() alone does
      // not — required to avoid registry buildup across mount/unmount cycles.
      if (typeof supabaseClient.removeChannel === 'function') {
        supabaseClient.removeChannel(channel);
      } else {
        channel.unsubscribe();
      }
      channelRef.current = null;
    };
  }, [supabaseClient, table, filter]);

  return { events, status };
}

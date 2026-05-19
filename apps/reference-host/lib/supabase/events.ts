/**
 * Supabase data adapter for the events table.
 *
 * Maps between the Supabase row shape (snake_case, ISO strings) and the
 * shape the calendar component expects (camelCase, Date objects). Anything
 * the component doesn't have a dedicated column for lives in `meta` so the
 * schema doesn't have to grow every time the host adds a field.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorksCalendarEvent } from 'works-calendar';

interface EventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  resource: string | null;
  category: string | null;
  color: string | null;
  meta: Record<string, unknown> | null;
}

function rowToEvent(row: EventRow): WorksCalendarEvent {
  return {
    id: row.id,
    title: row.title,
    start: new Date(row.start_at),
    end: new Date(row.end_at),
    allDay: row.all_day,
    ...(row.resource ? { resource: row.resource } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.color ? { color: row.color } : {}),
    meta: row.meta ?? {},
  };
}

function eventToRow(ev: WorksCalendarEvent): EventRow {
  // `id` and `end` are optional on the calendar's public type. New events
  // dropped from the inline form usually carry their own id, but defensive
  // fallbacks here keep the database happy if a caller forgets.
  const id = ev.id ?? (typeof crypto !== 'undefined' ? crypto.randomUUID() : `ev-${Date.now()}`);
  const start = ev.start instanceof Date ? ev.start : new Date(ev.start as string);
  const endRaw = ev.end ?? ev.start;
  const end = endRaw instanceof Date ? endRaw : new Date(endRaw as string);
  return {
    id,
    title: ev.title,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: ev.allDay ?? false,
    resource: (ev.resource as string | undefined) ?? null,
    category: (ev.category as string | undefined) ?? null,
    color: (ev.color as string | undefined) ?? null,
    meta: (ev.meta as Record<string, unknown> | undefined) ?? {},
  };
}

export async function loadEvents(supabase: SupabaseClient): Promise<WorksCalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, start_at, end_at, all_day, resource, category, color, meta')
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => rowToEvent(row as EventRow));
}

export async function upsertEvent(supabase: SupabaseClient, ev: WorksCalendarEvent): Promise<void> {
  const row = eventToRow(ev);
  const { error } = await supabase.from('events').upsert(row);
  if (error) throw error;
}

export async function deleteEvent(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

export async function bulkInsertEvents(
  supabase: SupabaseClient,
  events: readonly WorksCalendarEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map(eventToRow);
  const { error } = await supabase.from('events').upsert(rows);
  if (error) throw error;
}

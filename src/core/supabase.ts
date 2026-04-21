/**
 * supabase.js — Optional Supabase client.
 * Only instantiated if @supabase/supabase-js is available.
 */

type SupabaseClientLike = {
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, vals: unknown[]) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    upsert: (row: unknown, opts?: { onConflict?: string }) => {
      select: () => { single: () => Promise<{ data: unknown; error: unknown }> };
    };
    delete: () => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> };
  };
};

let _client: SupabaseClientLike | null = null;

export function getSupabaseClient(url: string, anonKey: string): SupabaseClientLike | null {
  if (_client) return _client;
  try {
    // Dynamic import so the entire library doesn't hard-depend on Supabase
    const { createClient } = require('@supabase/supabase-js');
    _client = createClient(url, anonKey) as SupabaseClientLike;
  } catch {
    console.warn('[WorksCalendar] @supabase/supabase-js not installed — notes will not persist remotely.');
    _client = null;
  }
  return _client;
}

/** Fetch notes for a list of event IDs */
export async function fetchNotes(client: SupabaseClientLike | null, eventIds: string[]): Promise<unknown[]> {
  if (!client || !eventIds.length) return [];
  const { data, error } = await client
    .from('notes')
    .select('*')
    .in('event_id', eventIds);
  if (error) { console.error('[WorksCalendar] fetchNotes error', error); return []; }
  return data ?? [];
}

/** Upsert a single note */
export async function upsertNote(client: SupabaseClientLike | null, note: unknown): Promise<unknown> {
  if (!client) return null;
  const { data, error } = await client
    .from('notes')
    .upsert(note, { onConflict: 'id' })
    .select()
    .single();
  if (error) { console.error('[WorksCalendar] upsertNote error', error); return null; }
  return data;
}

/** Delete a note by id */
export async function deleteNote(client: SupabaseClientLike | null, noteId: string): Promise<void> {
  if (!client) return;
  const { error } = await client.from('notes').delete().eq('id', noteId);
  if (error) console.error('[WorksCalendar] deleteNote error', error);
}

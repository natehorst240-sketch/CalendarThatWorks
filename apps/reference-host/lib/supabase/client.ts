/**
 * Browser-side Supabase client. Use from client components only.
 * Calls in server components / route handlers / middleware must go through
 * `./server` and `./middleware` respectively so the auth cookie round-trips
 * correctly.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

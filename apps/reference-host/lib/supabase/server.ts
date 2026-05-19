/**
 * Server-side Supabase client. Use from server components, route handlers,
 * and server actions. Reads / writes the session cookie via Next.js'
 * `cookies()` API.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll throws when called from a server component (read-only
            // cookies). The middleware refreshes the session for us, so we
            // can swallow this safely.
          }
        },
      },
    },
  );
}

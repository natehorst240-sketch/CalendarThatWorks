/**
 * createNextHandler — Next.js App Router route handler factory.
 *
 * Drop this into a single `app/api/events/[...slug]/route.ts` file and wire
 * up your data layer (Prisma, Drizzle, raw pg, etc.).  The factory generates
 * GET / POST / PATCH / DELETE handlers that the client-side RestAdapter talks
 * to out of the box.
 *
 * @example — with Prisma
 *   // app/api/events/[...slug]/route.ts
 *   import { createNextHandler } from 'works-calendar/api/v1/server';
 *   import { prisma } from '@/lib/prisma';
 *
 *   const { GET, POST, PATCH, DELETE } = createNextHandler({
 *     async loadRange(start, end) {
 *       return prisma.calendarEvent.findMany({
 *         where: { start: { gte: start }, end: { lt: end } },
 *       });
 *     },
 *     async createEvent(event) {
 *       return prisma.calendarEvent.create({ data: event });
 *     },
 *     async updateEvent(id, patch) {
 *       return prisma.calendarEvent.update({ where: { id }, data: patch });
 *     },
 *     async deleteEvent(id) {
 *       await prisma.calendarEvent.delete({ where: { id } });
 *     },
 *   });
 *
 *   export { GET, POST, PATCH, DELETE };
 *
 * @example — with Drizzle ORM
 *   import { createNextHandler } from 'works-calendar/api/v1/server';
 *   import { db } from '@/lib/db';
 *   import { events } from '@/lib/schema';
 *   import { and, gte, lt, eq } from 'drizzle-orm';
 *
 *   const { GET, POST, PATCH, DELETE } = createNextHandler({
 *     async loadRange(start, end) {
 *       return db.select().from(events).where(
 *         and(gte(events.start, start), lt(events.start, end))
 *       );
 *     },
 *     async createEvent(event) {
 *       const [row] = await db.insert(events).values(event).returning();
 *       return row;
 *     },
 *     async updateEvent(id, patch) {
 *       const [row] = await db.update(events)
 *         .set(patch).where(eq(events.id, id)).returning();
 *       return row;
 *     },
 *     async deleteEvent(id) {
 *       await db.delete(events).where(eq(events.id, id));
 *     },
 *   });
 *
 *   export { GET, POST, PATCH, DELETE };
 *
 * Then on the client, point RestAdapter at the same route:
 *   const adapter = new RestAdapter({ baseUrl: '/api/events' });
 *
 * The handler also supports an optional `auth` hook so you can validate
 * the incoming request before any DB operation runs:
 *   createNextHandler({
 *     auth: async (req) => {
 *       const session = await getServerSession(req);
 *       if (!session) throw new Error('Unauthorized');
 *     },
 *     ...
 *   });
 */

import type { CalendarEventV1 } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal Next.js Request / Response duck-types so no next dep is required. */
interface NextRequest {
  nextUrl: { searchParams: URLSearchParams; pathname: string };
  json(): Promise<unknown>;
  headers: { get(name: string): string | null };
}

interface NextResponse {
  json(body: unknown, init?: { status?: number }): unknown;
}

type NextResponseConstructor = {
  json(body: unknown, init?: { status?: number }): unknown;
};

/** Shape returned by the factory — drop directly into route.ts exports. */
export interface NextRouteHandlers {
  GET(req: NextRequest): Promise<unknown>;
  POST(req: NextRequest): Promise<unknown>;
  PATCH(req: NextRequest, ctx: { params: { slug?: string[] } }): Promise<unknown>;
  DELETE(req: NextRequest, ctx: { params: { slug?: string[] } }): Promise<unknown>;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface NextHandlerOptions {
  /**
   * Load events overlapping [start, end).
   * Return an array of plain objects — they are serialised as JSON.
   * Objects must be compatible with CalendarEventV1 (dates as ISO strings are fine).
   */
  loadRange(start: Date, end: Date): Promise<unknown[]>;

  /**
   * Create a new event.  `event` is the body parsed from the POST request.
   * Return the created record (including server-assigned id/timestamps).
   */
  createEvent?(event: CalendarEventV1): Promise<unknown>;

  /**
   * Update event with `id`.  `patch` contains only the changed fields.
   * Return the full updated record.
   */
  updateEvent?(id: string, patch: Partial<CalendarEventV1>): Promise<unknown>;

  /**
   * Permanently delete event with `id`.
   */
  deleteEvent?(id: string): Promise<void>;

  /**
   * Optional authentication / authorisation hook.
   * Called before every operation.  Throw an error to abort the request
   * with a 401 response.
   */
  auth?(req: NextRequest): Promise<void> | void;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Build a set of Next.js App Router route handlers backed by the provided
 * data layer functions.
 *
 * Usage: destructure and re-export from your `route.ts` file.
 */
export function createNextHandler(options: NextHandlerOptions): NextRouteHandlers {
  // We duck-type NextResponse so the file does not hard-depend on 'next'.
  // At runtime in a Next.js project, NextResponse is globally available via
  // the next/server import. Pass it in or rely on globalThis.NextResponse.
  const NR: NextResponseConstructor =
    ((typeof globalThis !== 'undefined' && (globalThis as Record<string, unknown>)['NextResponse']) as NextResponseConstructor | undefined) ??
    {
      json(body: unknown, init?: { status?: number }) {
        return new Response(JSON.stringify(body), {
          status:  init?.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    };

  async function runWithAuth(req: NextRequest, fn: () => Promise<unknown>): Promise<unknown> {
    try {
      if (options.auth) await options.auth(req);
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.toLowerCase().includes('unauthorized') ||
                     msg.toLowerCase().includes('forbidden') ? 401 : 500;
      return NR.json({ error: msg }, { status });
    }
  }

  // ── GET /api/events?start=<ISO>&end=<ISO> ──────────────────────────────────

  async function GET(req: NextRequest): Promise<unknown> {
    return runWithAuth(req, async () => {
      const sp    = req.nextUrl.searchParams;
      const start = new Date(sp.get('start') ?? sp.get('from') ?? '');
      const end   = new Date(sp.get('end')   ?? sp.get('to')   ?? '');

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return NR.json({ error: 'start and end query params required (ISO 8601)' }, { status: 400 });
      }

      const events = await options.loadRange(start, end);
      return NR.json(events);
    });
  }

  // ── POST /api/events  (create) ─────────────────────────────────────────────

  async function POST(req: NextRequest): Promise<unknown> {
    return runWithAuth(req, async () => {
      if (!options.createEvent) {
        return NR.json({ error: 'createEvent not implemented' }, { status: 405 });
      }
      const body = await req.json() as CalendarEventV1;
      const created = await options.createEvent(body);
      return NR.json(created, { status: 201 });
    });
  }

  // ── PATCH /api/events/[id]  (update) ───────────────────────────────────────

  async function PATCH(
    req: NextRequest,
    ctx: { params: { slug?: string[] } },
  ): Promise<unknown> {
    return runWithAuth(req, async () => {
      if (!options.updateEvent) {
        return NR.json({ error: 'updateEvent not implemented' }, { status: 405 });
      }
      const id = ctx.params?.slug?.[0] ?? req.nextUrl.pathname.split('/').pop() ?? '';
      if (!id) return NR.json({ error: 'id required' }, { status: 400 });

      const patch = await req.json() as Partial<CalendarEventV1>;
      const updated = await options.updateEvent(id, patch);
      return NR.json(updated);
    });
  }

  // ── DELETE /api/events/[id]  (delete) ──────────────────────────────────────

  async function DELETE(
    req: NextRequest,
    ctx: { params: { slug?: string[] } },
  ): Promise<unknown> {
    return runWithAuth(req, async () => {
      if (!options.deleteEvent) {
        return NR.json({ error: 'deleteEvent not implemented' }, { status: 405 });
      }
      const id = ctx.params?.slug?.[0] ?? req.nextUrl.pathname.split('/').pop() ?? '';
      if (!id) return NR.json({ error: 'id required' }, { status: 400 });

      await options.deleteEvent(id);
      return NR.json({ ok: true });
    });
  }

  return { GET, POST, PATCH, DELETE };
}

/**
 * works-calendar/api/v1/server — server-side utilities.
 *
 * Import from here in Next.js route handlers, Express middleware, etc.
 * Do NOT import in client-side (browser) code.
 *
 * @example
 *   import { createNextHandler } from 'works-calendar/api/v1/server';
 */

export { createNextHandler } from './NextHandler';
export type { NextHandlerOptions, NextRouteHandlers } from './NextHandler';

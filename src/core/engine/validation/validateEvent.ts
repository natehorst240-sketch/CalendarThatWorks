import type { EngineEvent } from '../schema/eventSchema.js';

export type ValidationMode = 'strict' | 'prod';

export type EventValidationCode =
  | 'INVALID_EVENT'
  | 'INVALID_ID'
  | 'INVALID_TITLE'
  | 'INVALID_START'
  | 'INVALID_END'
  | 'INVALID_RANGE'
  | 'INVALID_EXDATES';

export interface EventValidationIssue {
  readonly code: EventValidationCode;
  readonly field: keyof EngineEvent | 'event';
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface EventValidationResult {
  readonly ok: boolean;
  readonly issues: readonly EventValidationIssue[];
}

export interface ValidateEventOptions {
  /**
   * strict: fail on schema/shape drift and questionable values.
   * prod: best-effort validation; allows callers to log+continue where possible.
   */
  readonly mode?: ValidationMode;
}

/**
 * Drop-in skeleton validator for event payloads.
 *
 * TODO(team):
 * - Expand this to full schema-driven validation (zod/io-ts/custom rules).
 * - Add per-source policy overrides in prod mode.
 * - Wire to onError contract for centralized telemetry.
 */
export function validateEvent(
  input: unknown,
  opts: ValidateEventOptions = {},
): EventValidationResult {
  const mode = opts.mode ?? 'strict';
  const issues: EventValidationIssue[] = [];

  if (!input || typeof input !== 'object') {
    return {
      ok: false,
      issues: [{ code: 'INVALID_EVENT', field: 'event', message: 'Event must be an object.' }],
    };
  }

  const ev = input as Partial<EngineEvent>;

  if (typeof ev.id !== 'string' || ev.id.trim().length === 0) {
    issues.push({ code: 'INVALID_ID', field: 'id', message: 'Event id must be a non-empty string.' });
  }

  if (typeof ev.title !== 'string' || ev.title.trim().length === 0) {
    issues.push({ code: 'INVALID_TITLE', field: 'title', message: 'Event title must be a non-empty string.' });
  }

  if (!(ev.start instanceof Date) || Number.isNaN(ev.start.getTime())) {
    issues.push({ code: 'INVALID_START', field: 'start', message: 'Event start must be a valid Date.' });
  }

  if (!(ev.end instanceof Date) || Number.isNaN(ev.end.getTime())) {
    issues.push({ code: 'INVALID_END', field: 'end', message: 'Event end must be a valid Date.' });
  }

  if (ev.start instanceof Date && ev.end instanceof Date && ev.end <= ev.start) {
    issues.push({
      code: 'INVALID_RANGE',
      field: 'end',
      message: 'Event end must be after start.',
      details: { start: ev.start.toISOString(), end: ev.end.toISOString() },
    });
  }

  if (ev.exdates && !Array.isArray(ev.exdates)) {
    issues.push({
      code: 'INVALID_EXDATES',
      field: 'exdates',
      message: 'exdates must be an array of Date values.',
    });
  }

  // In prod mode, callers may choose to continue with warnings; we still return
  // all issues so policy can be decided at integration boundaries.
  if (mode === 'prod') {
    return { ok: issues.length === 0, issues };
  }

  return { ok: issues.length === 0, issues };
}

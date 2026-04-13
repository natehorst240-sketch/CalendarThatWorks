import { expandOccurrences, type ExpandOptions } from './expandOccurrences.js';
import type { EngineEvent } from '../schema/eventSchema.js';
import type { EngineOccurrence } from '../schema/occurrenceSchema.js';
import type { OnError } from '../errors/onError.js';
import { toStructuredError } from '../errors/onError.js';

export interface ExpandRecurrenceSafeOptions extends ExpandOptions {
  readonly onError?: OnError;
  /** Hard cap across all series for one expansion call. */
  readonly maxTotalOccurrences?: number;
}

const DEFAULT_MAX_TOTAL = 10_000;

/**
 * Guarded recurrence expansion with malformed-input and bounds protection.
 *
 * TODO(team):
 * - Attach per-series diagnostics in return value.
 * - Add source-isolated expansion for partial rendering.
 * - Add perf instrumentation hooks around expansion.
 */
export function expandRecurrenceSafe(
  events: readonly EngineEvent[],
  rangeStart: Date,
  rangeEnd: Date,
  opts: ExpandRecurrenceSafeOptions = {},
): EngineOccurrence[] {
  const maxTotal = opts.maxTotalOccurrences ?? DEFAULT_MAX_TOTAL;

  if (!(rangeStart instanceof Date) || Number.isNaN(rangeStart.getTime())
   || !(rangeEnd instanceof Date) || Number.isNaN(rangeEnd.getTime())
   || rangeEnd <= rangeStart) {
    opts.onError?.(
      toStructuredError({
        code: 'RECURRENCE_INVALID_RANGE',
        message: 'expandRecurrenceSafe received an invalid range.',
        domain: 'recurrence',
        severity: 'error',
        recoverable: true,
        context: { rangeStart, rangeEnd },
      }),
      { phase: 'expand' },
    );
    return [];
  }

  const sanitized: EngineEvent[] = [];
  for (const ev of events) {
    if (!(ev.start instanceof Date) || !(ev.end instanceof Date) || ev.end <= ev.start) {
      opts.onError?.(
        toStructuredError({
          code: 'RECURRENCE_MALFORMED_EVENT',
          message: 'Skipping malformed event during recurrence expansion.',
          domain: 'recurrence',
          severity: 'warning',
          recoverable: true,
          context: { eventId: ev.id },
        }),
        { eventId: ev.id, phase: 'expand' },
      );
      continue;
    }
    sanitized.push(ev);
  }

  try {
    const occurrences = expandOccurrences(sanitized, rangeStart, rangeEnd, opts);

    if (occurrences.length > maxTotal) {
      opts.onError?.(
        toStructuredError({
          code: 'RECURRENCE_MAX_TOTAL_EXCEEDED',
          message: 'Occurrence expansion exceeded maxTotalOccurrences cap.',
          domain: 'recurrence',
          severity: 'warning',
          recoverable: true,
          context: { maxTotal, actual: occurrences.length },
        }),
        { phase: 'expand' },
      );
      return occurrences.slice(0, maxTotal);
    }

    return occurrences;
  } catch (cause) {
    opts.onError?.(
      toStructuredError({
        code: 'RECURRENCE_EXPANSION_FAILED',
        message: 'Unhandled recurrence expansion failure.',
        domain: 'recurrence',
        severity: 'error',
        recoverable: true,
        cause,
      }),
      { phase: 'expand' },
    );
    return [];
  }
}

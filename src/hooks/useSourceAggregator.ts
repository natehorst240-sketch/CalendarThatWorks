/**
 * useSourceAggregator — merge multiple calendar sources into one event stream.
 *
 * Sources (processed in order):
 *   1. icalFeedsProp   — ICS URLs from the `icalFeeds` prop      (always on)
 *   2. ICS sources     — feeds added via the UI                  (togglable)
 *   3. CSV sources     — datasets imported by the user           (togglable)
 *
 * Each event is tagged with `_sourceId` and `_sourceLabel` so downstream
 * filter bars and source-aware UIs can group or hide per-source events.
 *
 * @param {object}             opts
 * @param {ICalFeed[]}         opts.icalFeedsProp   — prop-level ICS feeds (always shown)
 * @param {useSourceStore}     opts.sourceStore      — result of useSourceStore()
 *
 * @returns {{ events: CalendarEvent[], feedErrors: Array }}
 */
import { useMemo } from 'react';
import { useFeedEvents } from './useFeedEvents';

type FeedLike = Record<string, any> & { url?: string; label?: string; refreshInterval?: number };
type SourceEvent = Record<string, any>;
type CsvSource = { id: string; label?: string; enabled?: boolean; events?: SourceEvent[] };
type SourceStoreLike = {
  activeIcsSources: FeedLike[];
  activeCsvSources: CsvSource[];
};

export function useSourceAggregator({ icalFeedsProp = [], sourceStore }: {
  icalFeedsProp?: FeedLike[];
  sourceStore: SourceStoreLike;
}): {
  events: SourceEvent[];
  feedErrors: Array<{ feed: { url: string; label?: string; refreshInterval?: number }; err: unknown }>;
} {
  // Merge prop-level feeds + store-managed ICS feeds for the polling hook.
  // We use a stable JSON key so that referentially-new but semantically-identical
  // arrays do not trigger unnecessary re-fetches.
  const allIcsFeedsKey = useMemo(
    () => JSON.stringify([...(icalFeedsProp ?? []), ...sourceStore.activeIcsSources]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(icalFeedsProp), JSON.stringify(sourceStore.activeIcsSources)],
  );

  const allIcsFeeds = useMemo(
    () => [...(icalFeedsProp ?? []), ...sourceStore.activeIcsSources].filter((f): f is FeedLike & { url: string } => typeof f.url === 'string'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allIcsFeedsKey],
  );

  const { feedEvents, feedErrors } = useFeedEvents(allIcsFeeds);

  // Tag ICS events with source metadata
  const taggedFeedEvents = useMemo(
    () =>
      feedEvents.map((ev) => ({
        ...ev,
        _sourceId:    ev._feedLabel ?? 'ics',
        _sourceLabel: ev._feedLabel,
      })),
    [feedEvents],
  );

  // CSV source events — already parsed, just merge when the source is enabled
  const csvEvents = useMemo(
    () =>
      sourceStore.activeCsvSources.flatMap((src) =>
        (src.events ?? []).map((ev) => ({
          ...ev,
          _sourceId:    src.id,
          _sourceLabel: src.label,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(sourceStore.activeCsvSources.map((s) => ({ id: s.id, enabled: s.enabled, count: s.events?.length })))],
  );

  const events = useMemo(
    () => [...taggedFeedEvents, ...csvEvents],
    [taggedFeedEvents, csvEvents],
  );

  return { events, feedErrors };
}

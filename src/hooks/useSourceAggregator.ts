/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: remove as types are tightened */
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

type FeedLike = Record<string, any> & { url?: string | undefined; label?: string | undefined; refreshInterval?: number | undefined };
type SourceEvent = Record<string, any>;
type CsvSource = { id: string; label?: string | undefined; color?: string | undefined; enabled?: boolean | undefined; events?: SourceEvent[] | undefined };
type SourceStoreLike = {
  sources: Array<{ id: string; label?: string | undefined; color?: string | undefined; type?: string | undefined; enabled?: boolean | undefined }>;
  activeIcsSources: FeedLike[];
  activeCsvSources: CsvSource[];
};

export function useSourceAggregator({ icalFeedsProp = [], sourceStore }: {
  icalFeedsProp?: FeedLike[] | undefined;
  sourceStore: SourceStoreLike;
}): {
  events: SourceEvent[];
  feedErrors: Array<{ feed: { url: string; label?: string | undefined; refreshInterval?: number | undefined }; err: unknown }>;
  /** True while iCal feeds are fetching (initial load or scheduled refresh). */
  isFetchingFeeds: boolean;
} {
  // Merge prop-level feeds + store-managed ICS feeds for the polling hook.
  // We use a stable JSON key so that referentially-new but semantically-identical
  // arrays do not trigger unnecessary re-fetches.
  const allIcsFeedsKey = useMemo(
    () => JSON.stringify([...(icalFeedsProp ?? []), ...sourceStore.activeIcsSources]),
    [JSON.stringify(icalFeedsProp), JSON.stringify(sourceStore.activeIcsSources)],
  );

  const allIcsFeeds = useMemo(
    () => [...(icalFeedsProp ?? []), ...sourceStore.activeIcsSources].filter((f): f is FeedLike & { url: string } => typeof f.url === 'string'),
    [allIcsFeedsKey],
  );

  const { feedEvents, feedErrors, isFetching: isFetchingFeeds } = useFeedEvents(allIcsFeeds);

  // Build lookup maps from store sources so ICS events can be identified by
  // their actual store ID rather than the mutable label string.
  const { sourceColorById, labelToSourceId } = useMemo(() => {
    const colorById = new Map<string, string>();
    const labelToId = new Map<string, string>();
    for (const s of sourceStore.sources) {
      if (s.color) colorById.set(s.id, s.color);
      if (s.label) labelToId.set(s.label, s.id);
    }
    return { sourceColorById: colorById, labelToSourceId: labelToId };
  }, [sourceStore.sources]);

  // Tag ICS events with source metadata and source color (when available).
  // Resolve _sourceId to the actual store ID when the feed is store-managed
  // (matched by label); prop-level feeds fall back to their label string.
  const taggedFeedEvents = useMemo(
    () =>
      feedEvents.map((ev) => {
        const label = ev._feedLabel as string | undefined;
        const resolvedId = (label ? labelToSourceId.get(label) : undefined) ?? label ?? 'ics';
        const sourceColor = sourceColorById.get(resolvedId);
        return {
          ...ev,
          _sourceId:    resolvedId,
          _sourceLabel: label,
          ...(sourceColor ? { color: sourceColor } : {}),
        };
      }),
    [feedEvents, sourceColorById, labelToSourceId],
  );

  // CSV source events — already parsed, apply source color when present
  const csvEvents = useMemo(
    () =>
      sourceStore.activeCsvSources.flatMap((src) =>
        (src.events ?? []).map((ev) => ({
          ...ev,
          _sourceId:    src.id,
          _sourceLabel: src.label,
          ...(src.color ? { color: src.color } : {}),
        })),
      ),
    [JSON.stringify(sourceStore.activeCsvSources.map((s) => ({ id: s.id, enabled: s.enabled, count: s.events?.length, color: s.color })))],
  );

  const events = useMemo(
    () => [...taggedFeedEvents, ...csvEvents],
    [taggedFeedEvents, csvEvents],
  );

  return { events, feedErrors, isFetchingFeeds };
}

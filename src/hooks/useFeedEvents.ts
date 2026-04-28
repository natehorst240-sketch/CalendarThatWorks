/**
 * useFeedEvents — fetch and poll live iCal feed URLs.
 *
 * Accepts an array of ICalFeed objects:
 *   { url: string, label?: string, refreshInterval?: number }
 *
 * Fetches all feeds on mount, then re-fetches each feed on its
 * refreshInterval (default 5 minutes). Merges all feed events into
 * a single flat array tagged with { _feedLabel } for identification.
 */
import { useState, useEffect } from 'react';
import { fetchAndParseICS } from '../core/icalParser';

type ICalFeedInput = {
  url: string;
  label?: string | undefined;
  refreshInterval?: number | undefined;
};

type FeedEvent = Record<string, any> & { _feedLabel: string };
type FeedError = { feed: ICalFeedInput; err: unknown };

export function useFeedEvents(icalFeeds: ICalFeedInput[] = []): {
  feedEvents: FeedEvent[];
  feedErrors: FeedError[];
  /** True while at least one fetch (initial or polled) is in flight. */
  isFetching: boolean;
} {
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedErrors, setFeedErrors] = useState<FeedError[]>([]);
  // Counter, not a boolean. Each feed has its own setInterval so multiple
  // fetchAll() runs can overlap (one per feed × the global timing skew);
  // a flat boolean would let the faster run flip "syncing" off while the
  // slower run was still pending. Tracking concurrency keeps the flag
  // sticky until every poll has settled.
  const [inflight, setInflight] = useState(0);
  const isFetching = inflight > 0;

  useEffect(() => {
    if (!icalFeeds?.length) {
      setFeedEvents([]);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      setInflight((n) => n + 1);
      const results: FeedEvent[] = [];
      const errors: FeedError[] = [];

      try {
        await Promise.allSettled(icalFeeds.map(async (feed: ICalFeedInput) => {
          try {
            const evs = await fetchAndParseICS(feed.url) as Array<Record<string, any>>;
            const label = feed.label ?? feed.url;
            results.push(...evs.map((ev) => ({ ...ev, _feedLabel: label })));
          } catch (err: unknown) {
            errors.push({ feed, err });
            const message = err instanceof Error ? err.message : String(err);
            console.warn('[WorksCalendar] iCal feed error:', feed.url, message);
          }
        }));

        if (!cancelled) {
          setFeedEvents(results);
          setFeedErrors(errors);
        }
      } finally {
        // Always balance the counter — even when cancelled — so concurrent
        // polls and effect re-runs leave the gauge accurate.
        setInflight((n) => Math.max(0, n - 1));
      }
    }

    fetchAll();

    // Set up per-feed refresh timers
    const timers = icalFeeds.map((feed: ICalFeedInput) => {
      const interval = feed.refreshInterval ?? 300_000; // 5 minutes
      return setInterval(fetchAll, interval);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearInterval);
    };
  }, [icalFeeds]);

  return { feedEvents, feedErrors, isFetching };
}

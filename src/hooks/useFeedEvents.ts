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
  /** True while a fetch (initial or polled) is in flight for any feed. */
  isFetching: boolean;
} {
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedErrors, setFeedErrors] = useState<FeedError[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (!icalFeeds?.length) {
      setFeedEvents([]);
      setIsFetching(false);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      if (!cancelled) setIsFetching(true);
      const results: FeedEvent[] = [];
      const errors: FeedError[] = [];

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
        setIsFetching(false);
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

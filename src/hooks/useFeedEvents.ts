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
import { fetchAndParseICS } from '../core/icalParser.js';

export function useFeedEvents(icalFeeds) {
  const [feedEvents, setFeedEvents] = useState([]);
  const [feedErrors, setFeedErrors] = useState([]);

  useEffect(() => {
    if (!icalFeeds?.length) {
      setFeedEvents([]);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      const results = [];
      const errors  = [];

      await Promise.allSettled(icalFeeds.map(async feed => {
        try {
          const evs = await fetchAndParseICS(feed.url);
          const label = feed.label ?? feed.url;
          results.push(...evs.map(ev => ({ ...ev, _feedLabel: label })));
        } catch (err) {
          errors.push({ feed, err });
          console.warn('[WorksCalendar] iCal feed error:', feed.url, err.message);
        }
      }));

      if (!cancelled) {
        setFeedEvents(results);
        setFeedErrors(errors);
      }
    }

    fetchAll();

    // Set up per-feed refresh timers
    const timers = icalFeeds.map(feed => {
      const interval = feed.refreshInterval ?? 300_000; // 5 minutes
      return setInterval(fetchAll, interval);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearInterval);
    };
  }, [icalFeeds]);

  return { feedEvents, feedErrors };
}

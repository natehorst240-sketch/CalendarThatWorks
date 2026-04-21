/**
 * useFeedStore — persist iCal feed configurations in localStorage.
 *
 * Feeds are stored per calendar instance under `wc-feeds-${calendarId}`.
 * Each stored feed has an `enabled` flag so users can toggle sources without
 * deleting them.
 *
 * Returns:
 *   feeds        — full array of stored feed objects (including disabled ones)
 *   activeFeeds  — enabled feeds mapped to the ICalFeed shape for useFeedEvents
 *   addFeed      — add a new feed (returns the created feed object)
 *   removeFeed   — remove feed by id
 *   updateFeed   — patch feed fields by id
 *   toggleFeed   — flip the enabled flag by id
 */
import { useState, useCallback, useEffect } from 'react';

// ── Shape ──────────────────────────────────────────────────────────────────────
//
// StoredFeed: {
//   id:              string  — generated on add
//   url:             string  — ICS URL (https:// or webcal://)
//   label:           string  — display name
//   color:           string  — hex color dot in the feed list
//   enabled:         boolean — whether to fetch this feed
//   refreshInterval: number  — ms between polls (default 5 min)
//   addedAt:         string  — ISO timestamp
// }

const STORAGE_PREFIX = 'wc-feeds-';
type StoredFeed = {
  id: string;
  url: string;
  label: string;
  color: string;
  enabled: boolean;
  refreshInterval: number;
  addedAt: string;
};

function key(calendarId: string): string {
  return `${STORAGE_PREFIX}${calendarId}`;
}

function load(calendarId: string): StoredFeed[] {
  try {
    const raw = localStorage.getItem(key(calendarId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(calendarId: string, feeds: StoredFeed[]): void {
  try {
    localStorage.setItem(key(calendarId), JSON.stringify(feeds));
  } catch {
    // storage quota exceeded or private-mode restriction — silently skip
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFeedStore(calendarId: string): {
  feeds: StoredFeed[];
  activeFeeds: Array<{ url: string; label: string; refreshInterval: number }>;
  addFeed: (partial: Partial<StoredFeed>) => StoredFeed;
  removeFeed: (id: string) => void;
  updateFeed: (id: string, patch: Partial<StoredFeed>) => void;
  toggleFeed: (id: string) => void;
} {
  const [feeds, setFeeds] = useState(() => load(calendarId));

  // Re-load when calendarId changes (switching between embedded instances)
  useEffect(() => {
    setFeeds(load(calendarId));
  }, [calendarId]);

  // Persist on every change
  useEffect(() => {
    persist(calendarId, feeds);
  }, [calendarId, feeds]);

  const addFeed = useCallback((partial: Partial<StoredFeed>) => {
    const feed = {
      id:              `feed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url:             '',
      label:           '',
      color:           '#3b82f6',
      enabled:         true,
      refreshInterval: 300_000,  // 5 minutes
      addedAt:         new Date().toISOString(),
      ...partial,
    };
    setFeeds((prev: StoredFeed[]) => [...prev, feed]);
    return feed;
  }, []);

  const removeFeed = useCallback((id: string) => {
    setFeeds((prev: StoredFeed[]) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFeed = useCallback((id: string, patch: Partial<StoredFeed>) => {
    setFeeds((prev: StoredFeed[]) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const toggleFeed = useCallback((id: string) => {
    setFeeds((prev: StoredFeed[]) => prev.map((f) => f.id === id ? { ...f, enabled: !f.enabled } : f));
  }, []);

  // The shape expected by useFeedEvents — only enabled feeds, only the fields
  // that hook cares about.
  const activeFeeds = feeds
    .filter((f: StoredFeed) => f.enabled && f.url)
    .map(({ url, label, refreshInterval }) => ({ url, label, refreshInterval }));

  return { feeds, activeFeeds, addFeed, removeFeed, updateFeed, toggleFeed };
}

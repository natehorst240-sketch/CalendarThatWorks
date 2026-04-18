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

function key(calendarId) {
  return `${STORAGE_PREFIX}${calendarId}`;
}

function load(calendarId) {
  try {
    const raw = localStorage.getItem(key(calendarId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(calendarId, feeds) {
  try {
    localStorage.setItem(key(calendarId), JSON.stringify(feeds));
  } catch {
    // storage quota exceeded or private-mode restriction — silently skip
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFeedStore(calendarId) {
  const [feeds, setFeeds] = useState(() => load(calendarId));

  // Re-load when calendarId changes (switching between embedded instances)
  useEffect(() => {
    setFeeds(load(calendarId));
  }, [calendarId]);

  // Persist on every change
  useEffect(() => {
    persist(calendarId, feeds);
  }, [calendarId, feeds]);

  const addFeed = useCallback((partial) => {
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
    setFeeds(prev => [...prev, feed]);
    return feed;
  }, []);

  const removeFeed = useCallback((id) => {
    setFeeds(prev => prev.filter(f => f.id !== id));
  }, []);

  const updateFeed = useCallback((id, patch) => {
    setFeeds(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const toggleFeed = useCallback((id) => {
    setFeeds(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  }, []);

  // The shape expected by useFeedEvents — only enabled feeds, only the fields
  // that hook cares about.
  const activeFeeds = feeds
    .filter(f => f.enabled && f.url)
    .map(({ url, label, refreshInterval }) => ({ url, label, refreshInterval }));

  return { feeds, activeFeeds, addFeed, removeFeed, updateFeed, toggleFeed };
}

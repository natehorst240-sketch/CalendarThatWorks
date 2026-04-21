/**
 * useEventOptions — persists admin-managed category options per calendar.
 * Stored in localStorage under `wc-options-${calendarId}`.
 */
import { useState, useCallback } from 'react';

function load(calendarId: string): string[] {
  try {
    const raw = localStorage.getItem(`wc-options-${calendarId}`);
    return JSON.parse(raw)?.categories ?? [];
  } catch {
    return [];
  }
}

function save(calendarId: string, categories: string[]): void {
  try {
    localStorage.setItem(`wc-options-${calendarId}`, JSON.stringify({ categories }));
  } catch {}
}

export function useEventOptions(calendarId: string): {
  categories: string[];
  addCategory: (cat: string) => void;
  removeCategory: (cat: string) => void;
} {
  const [categories, setCategories] = useState(() => load(calendarId));

  const addCategory = useCallback((cat: string) => {
    const trimmed = String(cat).trim();
    if (!trimmed) return;
    setCategories(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      save(calendarId, next);
      return next;
    });
  }, [calendarId]);

  const removeCategory = useCallback((cat: string) => {
    setCategories(prev => {
      const next = prev.filter(c => c !== cat);
      save(calendarId, next);
      return next;
    });
  }, [calendarId]);

  return { categories, addCategory, removeCategory };
}

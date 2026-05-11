import { describe, it, expect } from 'vitest';
import { opAnnouncement, viewRange, ALL_VIEWS } from '../calendarViewConfig';

// ─── opAnnouncement ───────────────────────────────────────────────────────────

describe('opAnnouncement', () => {
  it('announces create with title', () => {
    expect(opAnnouncement({ type: 'create', event: { title: 'Meeting' } }))
      .toBe('Event "Meeting" created.');
  });

  it('announces create with fallback title when missing', () => {
    expect(opAnnouncement({ type: 'create', event: {} }))
      .toBe('Event "Untitled" created.');
  });

  it('announces create with fallback title when event is absent', () => {
    expect(opAnnouncement({ type: 'create' }))
      .toBe('Event "Untitled" created.');
  });

  it('announces update', () => {
    expect(opAnnouncement({ type: 'update' })).toBe('Event updated.');
  });

  it('announces delete', () => {
    expect(opAnnouncement({ type: 'delete' })).toBe('Event deleted.');
  });

  it('announces move', () => {
    expect(opAnnouncement({ type: 'move' })).toBe('Event moved.');
  });

  it('announces resize', () => {
    expect(opAnnouncement({ type: 'resize' })).toBe('Event resized.');
  });

  it('announces group-change', () => {
    expect(opAnnouncement({ type: 'group-change' })).toBe('Event reassigned.');
  });

  it('returns generic message for unknown type', () => {
    expect(opAnnouncement({ type: 'unknown-op' })).toBe('Change applied.');
  });
});

// ─── viewRange ────────────────────────────────────────────────────────────────

describe('viewRange', () => {
  const monday = new Date(2026, 0, 5, 12, 0, 0); // Jan 5 2026 is a Monday

  it('week view returns full week around the date (Sunday start)', () => {
    const range = viewRange('week', monday, 0);
    expect(range.start.getDay()).toBe(0); // Sunday
    expect(range.end.getDay()).toBe(6);   // Saturday
  });

  it('week view returns Mon–Sun when weekStartDay=1', () => {
    const range = viewRange('week', monday, 1);
    expect(range.start.getDay()).toBe(1); // Monday
    expect(range.end.getDay()).toBe(0);   // Sunday
  });

  it('day view returns 1-day range', () => {
    const range = viewRange('day', monday);
    const diffMs = range.end.getTime() - range.start.getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  it('base view returns 90-day window starting today', () => {
    const range = viewRange('base', monday);
    const diffDays = (range.end.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(90);
  });

  it('month view spans at least the full month', () => {
    const mid = new Date(2026, 0, 15); // Jan 15 2026
    const range = viewRange('month', mid, 0);
    expect(range.start.getTime()).toBeLessThanOrEqual(new Date(2026, 0, 1).getTime());
    expect(range.end.getTime()).toBeGreaterThanOrEqual(new Date(2026, 0, 31).getTime());
  });

  it('agenda view returns full calendar month', () => {
    const range = viewRange('agenda', monday);
    expect(range.start.getMonth()).toBe(0); // January
    expect(range.end.getMonth()).toBe(0);
    expect(range.start.getDate()).toBe(1);
  });

  it('schedule view returns the calendar month (default branch)', () => {
    const range = viewRange('schedule', monday);
    expect(range.start.getDate()).toBe(1);
  });

  it('unknown view falls back to month range', () => {
    const range = viewRange('requests', monday);
    expect(range.start.getDate()).toBe(1);
  });
});

// ─── ALL_VIEWS ────────────────────────────────────────────────────────────────

describe('ALL_VIEWS', () => {
  it('includes a month view that is alwaysOn', () => {
    const month = ALL_VIEWS.find(v => v.id === 'month');
    expect(month).toBeDefined();
    expect(month!.alwaysOn).toBe(true);
  });

  it('includes a week view that is alwaysOn', () => {
    const week = ALL_VIEWS.find(v => v.id === 'week');
    expect(week!.alwaysOn).toBe(true);
  });

  it('day view is not alwaysOn', () => {
    const day = ALL_VIEWS.find(v => v.id === 'day');
    expect(day!.alwaysOn).toBe(false);
  });

  it('all views have id, label, and group', () => {
    for (const view of ALL_VIEWS) {
      expect(view.id).toBeTruthy();
      expect(view.label).toBeTruthy();
      expect(['calendar', 'operations']).toContain(view.group);
    }
  });
});

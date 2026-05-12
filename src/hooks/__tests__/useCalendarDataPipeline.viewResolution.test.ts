/**
 * resolveActiveView — pure view-resolution logic (issue #604).
 *
 * The consolidated effect in `useCalendarDataPipeline` owns all active-view
 * decisions. `resolveActiveView` is the pure core of that effect, covering:
 *
 *   Priority (first match wins on first resolution per calendarId):
 *     1. initialView (if set and in enabledIds)
 *     2. configDefault (if set and in enabledIds) — one-shot per calendarId
 *     3. calView (if still in enabledIds)
 *   Post-initial fallback (view became invalid after user navigation):
 *     4. configDefault (if in enabledIds)
 *     5. 'month'
 */
import { describe, it, expect } from 'vitest';
import { resolveActiveView } from '../useCalendarDataPipeline';

const ALWAYS_ON = new Set(['month', 'week', 'day', 'agenda', 'schedule']);

function ids(...views: string[]): Set<string> {
  return new Set(views);
}

describe('resolveActiveView — initial resolution (isNewCalendar = true)', () => {
  it('returns initialView when set and enabled', () => {
    expect(resolveActiveView({
      enabledIds: ALWAYS_ON,
      calView: 'month',
      initialView: 'week',
      configDefault: 'day',
      isNewCalendar: true,
    })).toBe('week');
  });

  it('skips initialView that is not in enabledIds and falls to configDefault', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'month',
      initialView: 'schedule', // not enabled
      configDefault: 'week',
      isNewCalendar: true,
    })).toBe('week');
  });

  it('returns configDefault when initialView is absent and configDefault is enabled', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week', 'day'),
      calView: 'month',
      initialView: undefined,
      configDefault: 'day',
      isNewCalendar: true,
    })).toBe('day');
  });

  it('keeps calView when initialView and configDefault are absent but view is valid', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'week',
      initialView: undefined,
      configDefault: undefined,
      isNewCalendar: true,
    })).toBe('week');
  });

  it('falls through to month when calView is invalid and no initialView or configDefault', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'schedule', // not enabled
      initialView: undefined,
      configDefault: undefined,
      isNewCalendar: true,
    })).toBe('month');
  });

  it('falls through to month when configDefault is set but not in enabledIds', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'schedule', // not enabled
      initialView: undefined,
      configDefault: 'day',   // not enabled
      isNewCalendar: true,
    })).toBe('month');
  });

  it('inconsistent config: defaultView not in enabledViews — lands on calView (no flash)', () => {
    // The key regression: old code would flash to defaultView then be overridden.
    // Consolidated resolver goes directly to calView when defaultView is disabled.
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'month',
      initialView: undefined,
      configDefault: 'schedule', // disabled
      isNewCalendar: true,
    })).toBe('month');
  });

  it('inconsistent config: initialView not in enabledViews — falls to configDefault', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'day', // started here (useState)
      initialView: 'day',   // not enabled
      configDefault: 'week', // enabled
      isNewCalendar: true,
    })).toBe('week');
  });
});

describe('resolveActiveView — post-initial fallback (isNewCalendar = false)', () => {
  it('returns configDefault when calView became invalid', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'day', // was valid, now disabled
      initialView: 'day',
      configDefault: 'week',
      isNewCalendar: false,
    })).toBe('week');
  });

  it('returns month when calView invalid and configDefault is also not enabled', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'day',
      initialView: 'day',
      configDefault: 'schedule', // not enabled
      isNewCalendar: false,
    })).toBe('month');
  });

  it('returns month when calView invalid and no configDefault', () => {
    expect(resolveActiveView({
      enabledIds: ids('month'),
      calView: 'week',
      initialView: undefined,
      configDefault: undefined,
      isNewCalendar: false,
    })).toBe('month');
  });

  it('does not re-apply initialView on post-initial resolution (respects user navigation)', () => {
    // User navigated away from initialView ('week') to 'day'. 'day' is now disabled.
    // Should NOT jump back to initialView — it should use configDefault/month.
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'day',
      initialView: 'week',
      configDefault: undefined,
      isNewCalendar: false,
    })).toBe('month');
  });
});

describe('resolveActiveView — calendarId switch semantics', () => {
  it('applies new calendarId defaultView on switch (isNewCalendar = true)', () => {
    // User was on calA (view='week'), switches to calB with defaultView='schedule'.
    expect(resolveActiveView({
      enabledIds: ids('month', 'week', 'schedule'),
      calView: 'week',
      initialView: undefined,
      configDefault: 'schedule',
      isNewCalendar: true, // new calendar
    })).toBe('schedule');
  });

  it('respects initialView over new calendarId defaultView', () => {
    // Host passed initialView='week'; switching calendar should still land on 'week'.
    expect(resolveActiveView({
      enabledIds: ids('month', 'week', 'schedule'),
      calView: 'week',
      initialView: 'week',
      configDefault: 'schedule',
      isNewCalendar: true,
    })).toBe('week');
  });

  it('keeps current view when new calendar has no defaultView and view is still valid', () => {
    expect(resolveActiveView({
      enabledIds: ids('month', 'week'),
      calView: 'week',
      initialView: undefined,
      configDefault: undefined,
      isNewCalendar: true,
    })).toBe('week');
  });

  it('falls to month when new calendar has no defaultView and current view is not enabled', () => {
    expect(resolveActiveView({
      enabledIds: ids('month'),
      calView: 'week', // not in new calendar's enabled set
      initialView: undefined,
      configDefault: undefined,
      isNewCalendar: true,
    })).toBe('month');
  });
});

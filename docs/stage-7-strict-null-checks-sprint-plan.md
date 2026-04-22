# Stage 7 — `strictNullChecks` Epic Sprint Plan

## Purpose

This document starts the Stage 7 planning effort for enabling `strictNullChecks` repo-wide.

---

## Sprint 2 — Targeted UI + Test Reduction Sprint (Post-Pilot)

**Date:** 2026-04-22  
**Status:** ACTIVE (based on latest CI checkpoint)

### Goal

Reduce strict-null error count by attacking **mid-sized UI seams + mechanical test debt** while continuing to avoid root composition (`WorksCalendar.tsx`).

This sprint is designed to:

- shrink total diagnostics meaningfully
- reduce noise before view-layer work
- prepare for future `views/**` slicing

---

## Why this sprint focus

Latest CI checkpoint shows:

- root file (`WorksCalendar.tsx`) still too high-cascade
- views still high-risk and not yet ready for broad changes
- **UI panels and tests contain high-density, low-risk fixes**

This sprint targets the highest ROI per PR.

---

## Sprint 2 Target Areas

### Slice A — ICSFeedPanel (UI seam)

Files:
- `src/ui/ICSFeedPanel.tsx`

Problems:
- state inferred as `null`, later treated as object
- `never` cascades on `ok`, `count`, `error`

Fix pattern:

```ts
type FeedState = {
  ok: boolean;
  count?: number;
  error?: string;
} | null;
```

- explicitly type state
- guard before access

PR size: 1 file
Risk: LOW

---

### Slice B — SourcePanel (UI seam)

Files:
- `src/ui/SourcePanel.tsx`

Problems:
- `boolean | undefined` used as boolean
- `string | undefined` used as string
- nullable draft objects

Fix pattern:

- normalize inputs at boundary
- use defaulting (`?? false`, `?? ''`)
- guard draft before usage

PR size: 1 file
Risk: LOW–MED

---

### Slice C — Form normalization fixes

Files:
- `AvailabilityForm.tsx`
- `CalendarExternalForm.tsx`

Problems:
- writing `undefined` into `Record<string,string>`

Fix pattern:

```ts
setState(prev => ({
  ...prev,
  title: value ?? ''
}))
```

PR size: 1–2 files
Risk: LOW

---

### Slice D — Mechanical test cleanup batch

Targets:
- `src/__tests__/**`
- `src/hooks/__tests__/**`
- `src/api/v1/__tests__/sync.test.ts`

Patterns to fix:

- `.get(...)!` or guard instead of assuming existence
- `element!` or null check before fireEvent
- `.find(...)` → guard or fallback

Example:

```ts
const el = screen.queryByText('foo');
expect(el).not.toBeNull();
fireEvent.click(el!);
```

PR size: 3–5 files per PR
Risk: LOW (mechanical)

---

### Slice E — First view micro-slice (TimelineView)

Files:
- `src/views/TimelineView.tsx`

Scope (STRICTLY limited):

- one ref or scroll handler cluster
- one hover/selection state cluster

Do NOT:
- touch full render pipeline
- refactor entire file

Goal:
- prove view-level slicing works without cascade

PR size: 1 file
Risk: MEDIUM

---

## Sprint 2 PR Plan (ordered)

1. PR1 — ICSFeedPanel
2. PR2 — SourcePanel
3. PR3 — Form normalization
4. PR4–PR6 — test cleanup batches
5. PR7 — TimelineView micro-slice

---

## Exit Criteria

Sprint 2 is successful if:

- strict-null error count decreases meaningfully
- no new regressions introduced
- at least one view file is partially migrated safely
- noise from tests is reduced

---

## What we are NOT doing yet

Explicitly out of scope:

- `src/WorksCalendar.tsx`
- full `views/**` migrations
- root config flip stabilization

Those require a later dedicated sprint after noise reduction.

---

## Next Sprint Preview (Sprint 3)

If Sprint 2 succeeds:

- expand view slicing (Timeline + WeekView)
- begin hook normalization (`useSyncedCalendar`, etc.)
- prepare for root composition stabilization sprint

---

## Key Insight

The fastest path to `strictNullChecks: true` is **not fixing the biggest file first**.

It is:

> reduce cascade pressure → shrink error surface → then attack root composition cleanly

This sprint executes that strategy.

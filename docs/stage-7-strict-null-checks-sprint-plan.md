# Stage 7 — `strictNullChecks` Epic Sprint Plan

## Purpose

This document starts the Stage 7 planning effort for enabling `strictNullChecks` repo-wide.

---

## Sprint 2 — Targeted UI + Test Reduction Sprint (Post-Pilot)

**Date:** 2026-04-22  
**Status:** COMPLETE

### Outcome

Sprint 2 successfully:

- reduced strict-null diagnostic noise
- stabilized UI seams
- cleaned up test null-safety issues
- proved view micro-slicing works (TimelineView)

This created a lower-noise environment for deeper structural work.

---

## Sprint 3 — Core Boundary Hardening & Type Flow Control

**Status:** IN PROGRESS (PR4 + PR5 update recorded on 2026-04-23)

### Goal

Prevent null/undefined from propagating through the system by enforcing strict typing at **core boundaries and data flow layers**.

Shift from:
> fixing errors

To:
> preventing errors from existing

---

## Sprint 3 Focus Areas

### 1. Core Data Normalization

Targets:
- `src/core/**`
- parsing layers
- event/data transformation logic

Actions:
- introduce/standardize normalize functions
- eliminate partial/nullable data before it reaches UI

Pattern:

```ts
function normalizeEvent(raw: RawEvent): Event
```

---

### 2. API & Adapter Boundaries

Targets:
- `src/api/**`
- sync adapters
- external integrations

Actions:
- explicitly type all inputs/outputs
- remove `any` from adapters
- constrain null handling to entry points only

---

### 3. Context & Global State Hardening

Targets:
- `src/core/CalendarContext.ts`
- global config/state providers

Actions:
- eliminate optional context usage
- enforce full context contracts
- remove defensive optional chaining in consumers

---

### 4. Ghost Null Elimination

Patterns to remove:

```ts
value || ''
thing?.value?.data
```

Replace with:
- explicit narrowing
- `??` where appropriate
- early normalization

---

### 5. Strict-Null Ratchet Tightening

Actions:
- reduce baseline again
- fail PRs on regression
- track diagnostic categories

---

## Sprint 3 PR Plan (ordered)

1. PR1 — Core data normalization
2. PR2 — API & adapter boundary typing
3. PR3 — Context hardening
4. PR4 — Ghost null cleanup pass
5. PR5 — Ratchet tightening + baseline reduction

### Sprint 3 Progress Update (2026-04-23)

- ✅ PR4 completed: ghost-null cleanup/narrowing pass landed in strict-null test and adapter seams.
- ✅ PR5 completed: strict-null ratchet tightened by adding PR4 files to migrated-path enforcement.
- ✅ Baseline reduced from **324** to **144** strict-null diagnostics (`npm run -s type-check:strict-null`).
- ⚠️ Remaining strict-null diagnostics are still concentrated in `src/WorksCalendar.tsx` and other non-migrated files.

---

## Exit Criteria

Sprint 3 is successful if:

- core data flows are normalized and non-null by default
- null handling is isolated to boundaries
- context is fully typed without optional chaining
- strict-null baseline is reduced again

---

## Sprint 4 — Root Stabilization & Full `strictNullChecks` Enablement

**Status:** PLANNED

### Goal

Enable `strictNullChecks: true` across the entire repository and stabilize the root composition layer so strict typing holds long-term.

---

## Sprint 4 Focus Areas

### 1. Root Composition Stabilization

Target:
- `src/WorksCalendar.tsx`

Actions:
- break file into logical zones (props, context, render, handlers)
- introduce typed boundaries between zones
- optionally extract small helper builders (NOT full refactor)

---

### 2. Final View Layer Cleanup

Targets:
- `src/views/WeekView.tsx`
- remaining `TimelineView.tsx` work

Actions:
- resolve remaining strict-null issues
- rely on normalized data from Sprint 3

---

### 3. Controlled Strict Mode Enablement

Steps:

**Phase A — CI Dry Run**
- run `strictNullChecks` in CI
- track remaining errors without blocking

**Phase B — Full Enablement**
- enable in `tsconfig.json`
- resolve remaining blockers
- enforce via CI

---

### 4. Remove Escape Hatches

Eliminate:
- non-null assertions (`!`)
- `as any`
- unsafe fallbacks (`||`)

Replace with:
- proper typing
- narrowing
- normalization

---

### 5. CI Enforcement

Actions:
- fail builds on strict-null errors
- prevent regression of baseline
- enforce no new `any`

---

## Sprint 4 PR Plan (ordered)

1. PR1 — Root typing (phase 1: props + state)
2. PR2 — Root typing (phase 2: handlers + context)
3. PR3 — View finalization
4. PR4 — Strict mode dry run (CI only)
5. PR5 — Full strictNullChecks enablement
6. PR6 — Enforcement + cleanup

---

## Exit Criteria

Sprint 4 is successful if:

- `strictNullChecks: true` is enabled repo-wide
- `tsc --noEmit` passes clean
- minimal or no reliance on `!` or `any`
- CI enforces strict-null compliance

---

## What we are NOT doing yet

Still out of scope:

- large-scale architectural rewrites
- full component refactors unrelated to strict-null

---

## Key Insight

Sprint 2 reduced noise.
Sprint 3 controlled data flow.
Sprint 4 locks correctness into the system.

> Once strict-null is enforced at the root, the entire codebase becomes safer by default.

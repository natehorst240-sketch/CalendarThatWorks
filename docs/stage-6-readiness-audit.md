# Stage 6 Readiness Audit — Root `noImplicitAny` Flip

## Purpose
This document defines the readiness audit that must be completed before attempting Stage 6 of the TypeScript migration.

Stage 6 is **not** a cleanup step. It is a root-configuration change that removes the staged ratchet model and makes repo-wide `noImplicitAny` debt blocking.

A prior attempt to flip root `noImplicitAny` early caused CI failures because non-migrated paths still contained implicit-any debt. This audit exists to prevent repeating that regression.

---

## Current Repo State

The repository is currently operating in the **staged migration model**:

- Root `tsconfig.json` remains advisory for `noImplicitAny`
- `tsconfig.strict.json` enables `noImplicitAny: true`
- `scripts/typecheck-strict.mjs` blocks only on implicit-any diagnostics inside `MIGRATED_PATHS`
- CI enforces the ratchet, not a full root flip

This state is intentional and stable.

---

## Goal of the Audit

Determine whether the repository is genuinely ready to:

1. enable `noImplicitAny: true` in root `tsconfig.json`
2. delete `tsconfig.strict.json`
3. delete `scripts/typecheck-strict.mjs`
4. remove `npm run type-check:strict`
5. collapse CI back to a single TypeScript gate

If the audit fails, Stage 6 must be deferred and the repo should remain on the ratchet model.

---

## Hard Rule

**Do not attempt Stage 6 until this audit is completed and documented in a dedicated PR.**

---

## Audit Outputs

A Stage 6 readiness PR or audit issue must answer all of the following:

- How many repo-wide implicit-any diagnostics remain with root `noImplicitAny: true`?
- Which directories still contain them?
- Are the remaining errors narrow enough to fix in one isolated PR?
- Would fixing them require expanding scope into tests, stories, demos, or unrelated runtime modules?
- Can root `tsc --noEmit` pass with `noImplicitAny: true` **without** relying on `MIGRATED_PATHS` filtering?

If any of those answers is unknown, Stage 6 is not ready.

---

## Required Audit Steps

### 1. Capture the current root baseline
Run:

```bash
npx tsc --noEmit -p tsconfig.json
```

Record:
- pass/fail
- total diagnostics
- whether diagnostics are advisory-only or real blockers under current config

### 2. Measure repo-wide `noImplicitAny` debt
Temporarily run the root compiler with `noImplicitAny: true` across the full repo.

Use one of these approaches:

```bash
npx tsc --noEmit -p tsconfig.strict.json
```

or a temporary root-config variant if needed.

Record:
- total implicit-any diagnostics
- unique files affected
- top offending directories
- top offending files

### 3. Separate migrated vs non-migrated debt
Compare the diagnostics to `MIGRATED_PATHS`.

Record:
- diagnostics already covered by the ratchet
- diagnostics outside the ratchet
- whether the remaining debt is concentrated or scattered

### 4. Group remaining debt by directory
Create a small summary table like:

| Directory | Error Count | Notes |
|---|---:|---|
| `src/...` | N | brief note |
| `demo/...` | N | brief note |
| `src/**/__tests__/**` | N | brief note |

This is required. Stage 6 should never proceed on a vague “it looks close” basis.

### 5. Classify the remaining work
For each remaining hotspot, label it as one of:

- **Mechanical** — parameter annotations, easy callbacks, local helper types
- **Boundary** — public interfaces or shared types that affect callers
- **Cascade risk** — likely to spread into hooks, views, tests, or runtime behavior

### 6. Decide whether the remaining work fits in one PR
Stage 6 is only ready if the remaining non-ratcheted debt is:

- small enough to fix in one reviewable PR
- low enough risk to keep scope contained
- unlikely to require large cross-module rewrites

If not, create an intermediate cleanup stage instead of attempting Stage 6.

---

## Pass / Fail Criteria

### Stage 6 is READY only if ALL are true

- Repo-wide `noImplicitAny` diagnostics have been measured explicitly
- Remaining non-ratcheted debt is documented by directory/file
- Remaining work fits in one isolated PR
- Root `tsc --noEmit` can plausibly pass with `noImplicitAny: true`
- Removing the ratchet will not surface unknown debt outside the documented set

### Stage 6 is NOT READY if ANY are true

- repo-wide implicit-any debt has not been measured
- remaining errors are scattered across many unrelated directories
- fixes would force cross-module typing cascades
- tests or non-migrated files would need broad cleanup
- the change would blur config recovery with new migration work

---

## Decision Tree

### Outcome A — Ready
If the audit shows low, concentrated, reviewable remaining debt:

Proceed with a dedicated Stage 6 PR:
1. fix remaining repo-wide implicit-any sites
2. flip root `noImplicitAny: true`
3. remove `tsconfig.strict.json`
4. remove `scripts/typecheck-strict.mjs`
5. remove `npm run type-check:strict`
6. simplify CI
7. update docs to mark Stage 6 complete

### Outcome B — Not Ready
If the audit shows broad or scattered remaining debt:

Do **not** attempt Stage 6.
Instead:
1. keep the ratchet model in place
2. create an intermediate cleanup stage
3. migrate the remaining debt in narrow PRs
4. rerun this audit later

---

## Stage 6 PR Definition of Done

A true Stage 6 PR is not done unless all are true:

- root `tsconfig.json` has `noImplicitAny: true`
- `tsconfig.strict.json` is removed
- `scripts/typecheck-strict.mjs` is removed
- `npm run type-check:strict` is removed
- CI uses a single TypeScript gate
- root `tsc --noEmit -p tsconfig.json` passes
- docs explicitly mark the ratchet retired

---

## Recommended Audit Deliverable

Before any Stage 6 PR, create either:

- a short audit issue, or
- a docs update in this file

with:
- commands run
- counts collected
- remaining directories/files
- ready / not-ready decision
- rationale

---

## Audit Run — 2026-04-22

This section captures a full Stage 6 readiness run executed on **April 22, 2026**.

### Commands Run

```bash
npx tsc --noEmit -p tsconfig.json --pretty false
npx tsc --noEmit -p tsconfig.strict.json --pretty false
```

### 1) Current Root Baseline (`tsconfig.json`)

- **Result:** Pass
- **TypeScript diagnostics:** 0
- **Notes:** Root config remains advisory for `noImplicitAny` (`noImplicitAny: false`), so implicit-any debt is not blocking at root.

### 2) Repo-wide Implicit-any Debt (`tsconfig.strict.json`)

- **Result:** Fail (`exit 2`)
- **Total diagnostics:** 417
- **Implicit-any diagnostics (TS7005/7006/7011/7018/7023/7031/7034/7053):** 413
- **Unique files with implicit-any diagnostics:** 67

Top implicit-any diagnostic codes:

- `TS7006`: 291
- `TS7018`: 57
- `TS7053`: 27
- `TS7005`: 15
- `TS7034`: 13
- `TS7031`: 10

### 3) Migrated vs Non-migrated (`MIGRATED_PATHS`) Debt Split

- **Implicit-any diagnostics in migrated paths:** 0
- **Implicit-any diagnostics outside migrated paths:** 413
- **Conclusion:** Current ratchet is working as intended, but Stage 6 would expose substantial non-ratcheted debt immediately.

### 4) Remaining Debt by Directory

| Directory | Error Count | Notes |
|---|---:|---|
| `src/ui` | 260 | Largest concentration; mostly form/dialog/component callback and indexing annotations. |
| `src/hooks` | 70 | Heavy concentration in hook tests plus some hook implementation callback typing. |
| `src/views` | 60 | Mixed view-level rendering logic and view tests. |
| `src/__tests__` | 23 | Integration test helpers and callback params are still untyped. |

### Top Offending Files

| File | Error Count |
|---|---:|
| `src/hooks/__tests__/useSavedViews.test.ts` | 31 |
| `src/ui/FilterBar.tsx` | 31 |
| `src/ui/CSVImportDialog.tsx` | 26 |
| `src/ui/AdvancedFilterBuilder.tsx` | 20 |
| `src/ui/RequestForm.tsx` | 17 |
| `src/ui/ThemeCustomizer.tsx` | 14 |

---

## Audit Rerun — Post Stage 5b PR5 (2026-04-22)

This section captures the required full rerun after Stage 5b PRs 4–5.

### Commands Run

```bash
npx tsc --noEmit -p tsconfig.json --pretty false
npx tsc --noEmit -p tsconfig.strict.json --pretty false
```

### 1) Current Root Baseline (`tsconfig.json`)

- **Result:** Pass
- **TypeScript diagnostics:** 0
- **Notes:** Root config still uses advisory `noImplicitAny: false`.

### 2) Repo-wide Implicit-any Debt (`tsconfig.strict.json`)

- **Result:** Fail (`exit 2`)
- **Total diagnostics:** 213
- **Implicit-any diagnostics (TS7005/7006/7011/7018/7023/7031/7034/7053):** 212
- **Unique files with implicit-any diagnostics:** 52

Top implicit-any diagnostic codes:

- `TS7006`: 156
- `TS7018`: 21
- `TS7005`: 9
- `TS7031`: 9
- `TS7053`: 9
- `TS7034`: 8

### 3) Migrated vs Non-migrated (`MIGRATED_PATHS`) Debt Split

- **Implicit-any diagnostics in migrated paths:** 0
- **Implicit-any diagnostics outside migrated paths:** 212
- **Conclusion:** Ratchet remains green for migrated files; Stage 6 root flip would still surface non-ratcheted debt.

### 4) Remaining Debt by Directory

| Directory | Error Count | Notes |
|---|---:|---|
| `src/ui` | 126 | Still largest hotspot; mostly callback parameter and local state/indexing annotations. |
| `src/views` | 60 | View logic and view test helpers remain a concentrated block. |
| `src/hooks` | 26 | Mostly hook test/helper typing cleanup. |

### Top Offending Files

| File | Error Count |
|---|---:|
| `src/ui/ScheduleTemplateDialog.tsx` | 12 |
| `src/ui/SetupWizardModal.tsx` | 12 |
| `src/hooks/__tests__/useRealtimeEvents.test.ts` | 11 |
| `src/ui/SourcePanel.tsx` | 11 |
| `src/ui/ImportPreview.tsx` | 10 |
| `src/hooks/__tests__/useTouchDnd.test.tsx` | 9 |
| `src/ui/__tests__/ProfileBar.redesign.test.tsx` | 9 |
| `src/views/AuditDrawer.tsx` | 9 |

### 5) Non-implicit-any diagnostics

- `TS2345` remains in `src/WorksCalendar.tsx` (legacy-event assignment mismatch), outside the implicit-any metric.

### 6) Stage 6 readiness decision

- **Decision:** **NOT READY**.
- **Rationale:** Implicit-any debt is down substantially from the earlier 413/67 baseline, but **212 diagnostics across 52 files** remains too broad for a single isolated Stage 6 root-flip PR.

---

## Final Reminder

Stage 5 being complete does **not** mean Stage 6 is automatically safe.

Stage 6 should only happen when the repository is ready for repo-wide enforcement without the protection of `MIGRATED_PATHS`.

---

## Audit Rerun — Post PR3 (2026-04-22)

This section captures the requested post-PR3 full rerun.

### Commands Run

```bash
npx tsc --noEmit -p tsconfig.json --pretty false
npx tsc --noEmit -p tsconfig.strict.json --pretty false
```

### 1) Current Root Baseline (`tsconfig.json`)

- **Result:** Pass
- **TypeScript diagnostics:** 0
- **Notes:** Root config is still advisory for `noImplicitAny` (`noImplicitAny: false`).

### 2) Repo-wide Implicit-any Debt (`tsconfig.strict.json`)

- **Result:** Fail (`exit 2`)
- **Total diagnostics:** 84
- **Implicit-any diagnostics (TS7005/7006/7011/7018/7023/7031/7034/7053):** 82
- **Unique files with implicit-any diagnostics:** 25

Top implicit-any diagnostic codes:

- `TS7006`: 58
- `TS7005`: 7
- `TS7034`: 6
- `TS7018`: 5
- `TS7053`: 5
- `TS7031`: 1

### 3) Migrated vs Non-migrated (`MIGRATED_PATHS`) Debt Split

- **Implicit-any diagnostics in migrated paths:** 0
- **Implicit-any diagnostics outside migrated paths:** 82
- **Conclusion:** Ratchet remains green in migrated paths; remaining strict debt is entirely outside the current allowlist.

### 4) Remaining Debt by Directory

| Directory | Error Count | Notes |
|---|---:|---|
| `src/views` | 60 | Dominant remaining hotspot, mostly view tests plus `AuditDrawer.tsx` and `ScheduleView.tsx`. |
| `src/ui` | 17 | Mostly `src/ui/__tests__` callback and helper typing. |
| `src/hooks` | 5 | Isolated hook test helper typing. |

### Top Offending Files

| File | Error Count |
|---|---:|
| `src/views/AuditDrawer.tsx` | 9 |
| `src/views/__tests__/WeekDayView.offHoursClipping.test.tsx` | 8 |
| `src/views/__tests__/AgendaView.grouping.test.tsx` | 7 |
| `src/views/__tests__/AgendaView.touchDnd.test.tsx` | 7 |
| `src/views/__tests__/TimelineView.grouping.test.tsx` | 7 |
| `src/views/__tests__/TimelineView.touchDnd.test.tsx` | 7 |
| `src/ui/__tests__/a11y.test.tsx` | 6 |
| `src/hooks/__tests__/useTouchDnd.test.tsx` | 4 |
| `src/views/ScheduleView.tsx` | 4 |

### 5) Non-implicit-any diagnostics

- `TS2345` and `TS2322` remain in `src/WorksCalendar.tsx`; these are outside the implicit-any metric.

### 6) Stage 6 readiness decision

- **Decision:** **NOT READY**.
- **Rationale:** This rerun is a major improvement versus the earlier 212/52 checkpoint, but **82 diagnostics across 25 files** is still too broad for a safe one-PR Stage 6 root flip. Remaining debt is now heavily concentrated in `src/views`, so another focused cleanup sprint is recommended before attempting Stage 6.

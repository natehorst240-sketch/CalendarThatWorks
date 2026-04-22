# Stage 5b — Root-Flip Readiness Cleanup Plan

## Purpose
This document defines the intermediate cleanup stage required after the Stage 6 readiness audit showed that the repository is **not** ready for a root `noImplicitAny` flip.

Stage 5 is complete under the ratchet model, but the Stage 6 audit found substantial non-ratcheted implicit-any debt outside `MIGRATED_PATHS`. This cleanup stage exists to reduce that debt in narrow, reviewable slices before attempting Stage 6 again.

---

## Why Stage 5b Exists

The Stage 6 audit run on 2026-04-22 found:

- **413 implicit-any diagnostics** outside migrated paths
- **67 unique files** affected
- Largest hotspot in **`src/ui` (260)**
- Additional concentrations in **`src/hooks` (70)**, **`src/views` (60)**, and **`src/__tests__` (23)**
- The remaining work does **not** fit safely in one isolated Stage 6 PR

Because of that, Stage 6 remains deferred and this Stage 5b cleanup plan becomes the next required step.

---

## Goals

1. Reduce the remaining non-ratcheted implicit-any debt in narrow PRs
2. Add cleaned files to `MIGRATED_PATHS` as they land
3. Keep `type-check:strict` green throughout
4. Keep root advisory `tsc --noEmit -p tsconfig.json` green throughout
5. Re-run the Stage 6 readiness audit after the highest-risk hotspots are reduced

---

## Hard Rules

- Do **not** flip root `noImplicitAny` during Stage 5b
- Do **not** delete `tsconfig.strict.json`
- Do **not** delete `scripts/typecheck-strict.mjs`
- Each PR must remain narrow and reviewable
- Each PR must add its cleaned files to `MIGRATED_PATHS`
- Boundary looseness is still allowed when required to prevent typing cascades

---

## Definition of Done for Every Stage 5b PR

A PR is not done unless all are true:

1. Touched files are added to `MIGRATED_PATHS`
2. `npm run type-check:strict` passes
3. `npx tsc --noEmit -p tsconfig.json` passes
4. Tests for touched scope pass at minimum
5. No uncontrolled spread of `any`
6. PR remains within the intended cleanup slice

---

## Cleanup Order

The cleanup order is based on the 2026-04-22 audit:
- easiest / most mechanical slices first
- higher-risk shared UI/view files later
- rerun audit after major reduction

---

## PR 1 — Hook Test Helpers Cleanup

**Target files (starting list):**
- `src/hooks/__tests__/useSavedViews.test.ts`
- `src/hooks/__tests__/useSourceStore.test.ts`
- other hook test files with local helper/callback implicit-any debt

**Why first:**
- high diagnostic density
- low runtime risk
- mostly mechanical test helper typing

**Expected work type:**
- annotate callback parameters
- annotate local helper return types
- type mock/store/test harness shapes narrowly

**Completion action:**
- add cleaned hook test files to `MIGRATED_PATHS`

---

## PR 2 — Root Integration / Test Harness Cleanup

**Target files (starting list):**
- `src/__tests__/WorksCalendar.scheduleModel.integration.test.tsx`
- remaining `src/__tests__/**` files surfaced by the audit

**Why second:**
- still mostly mechanical
- reduces root-flip noise early
- contains non-runtime debt before UI work expands

**Expected work type:**
- annotate integration helper params
- type event fixtures and callback payloads
- avoid tightening production runtime shapes unless necessary

**Completion action:**
- add cleaned root test files to `MIGRATED_PATHS`

---

## PR 3 — Small UI Form / Dialog Slice

**Target files (starting list):**
- `src/ui/ScheduleEditorForm.tsx`
- `src/ui/CalendarExternalForm.tsx`
- `src/ui/RequestForm.tsx`

**Why third:**
- contained UI seams
- lower risk than shared filtering/theme infrastructure
- likely meaningful error reduction with limited cascade risk

**Expected work type:**
- annotate handler parameters
- type local form draft state
- add named prop interfaces / patch types

**Completion action:**
- add these files to `MIGRATED_PATHS`

---

## PR 4 — Medium UI Utility Slice

**Target files (starting list):**
- `src/ui/ThemeCustomizer.tsx`
- `src/ui/CSVImportDialog.tsx`

**Why fourth:**
- moderate UI surface
- less shared than filter-builder infrastructure
- should shrink the remaining `src/ui` hotspot before tackling the hardest files

**Expected work type:**
- annotate file input / import handlers
- type theme/config maps and local draft state
- keep dynamic payload boundaries intentionally loose if needed

**Completion action:**
- add these files to `MIGRATED_PATHS`

---

## PR 5 — Shared UI Filtering Slice

**Target files (starting list):**
- `src/ui/FilterBar.tsx`
- `src/ui/AdvancedFilterBuilder.tsx`

**Why fifth:**
- top offenders in the audit
- shared UI surface with higher boundary/cascade risk
- should be isolated after easier wins are already merged

**Expected work type:**
- annotate filter callback params
- type builder rows / condition shapes / indexed config access
- preserve consumer compatibility with named loose boundary types where needed

**Completion action:**
- add these files to `MIGRATED_PATHS`

---

## PR 6 — Remaining Non-ratcheted Views Slice

**Target scope:**
- remaining `src/views/**` files and view tests surfaced by the audit that are not yet in the Stage 5 allowlist

**Why last:**
- view logic carries more cascade risk
- should be attacked only after hook/test/UI mechanical reductions are complete

**Expected work type:**
- annotate render helpers and callback params
- type view test fixtures narrowly
- avoid widening shared event/domain shapes without need

**Completion action:**
- add cleaned files to `MIGRATED_PATHS`

---

## Audit Rerun Checkpoints

### Required checkpoint after PR 3
After PRs 1–3 land, rerun:

```bash
npx tsc --noEmit -p tsconfig.strict.json --pretty false
```

Record:
- updated total implicit-any diagnostics
- updated unique files count
- whether remaining debt is still dominated by `src/ui`

#### Checkpoint run recorded — 2026-04-22

Command run:

```bash
npx tsc --noEmit -p tsconfig.strict.json --pretty false
```

Results:
- **253** implicit-any diagnostics (down from 413)
- **55** unique files with implicit-any diagnostics (down from 67)
- Remaining debt is **still dominated by `src/ui`** (167 / 253 diagnostics, ~66%)

Notes:
- The run also reports a non-implicit-any type mismatch in `src/WorksCalendar.tsx` (`TS2345`), which is outside this implicit-any checkpoint metric.

### Required checkpoint after PR 5
After PRs 4–5 land, rerun the full Stage 6 readiness audit in:
- `docs/stage-6-readiness-audit.md`

This is the decision point for whether a dedicated Stage 6 PR is now realistic.

---

## Stage 6 Re-entry Criteria

Do not retry Stage 6 until the rerun audit shows the remaining non-ratcheted debt is:

- concentrated in a small number of files/directories
- small enough to fit in one isolated PR
- unlikely to trigger broad cross-module rewrites

Practical target:
- remaining implicit-any debt should be reduced from the current **413 / 67 files** to a small, reviewable remainder

---

## Suggested Tracking Table

Status reconciled against merged PRs and current `MIGRATED_PATHS` on `main` as of **2026-04-22**.

| PR | Slice | Status | Files added to `MIGRATED_PATHS` | Audit rerun needed? |
|---|---|---|---|---|
| 1 | Hook test helpers | **Complete** (PR #295 merged) | **Yes** | No |
| 2 | Root/integration tests | **Complete** (PR #296 merged) | **Yes** | No |
| 3 | Small UI forms/dialogs | **Complete** (PR #297 merged) | **Yes** | **Checkpoint still needed** |
| 4 | Medium UI utilities | Planned | No | No |
| 5 | Shared UI filtering | **Complete** (PR #299 merged) | **Yes** | **Full audit rerun still needed** |
| 6 | Remaining non-ratcheted views | Planned | No | Maybe |

### Current status notes

- PRs **1, 2, 3, and 5** have landed on `main`.
- The corresponding files are present in `scripts/typecheck-strict.mjs` under `MIGRATED_PATHS`.
- No merged Stage 5b PR was found yet for the planned **PR 4** (`ThemeCustomizer` / `CSVImportDialog`) slice.
- No merged Stage 5b PR was found yet for the planned **PR 6** remaining-views slice.
- The required post-PR3 checkpoint audit has not yet been recorded in this file.
- The required post-PR5 full Stage 6 readiness rerun has not yet been recorded in `docs/stage-6-readiness-audit.md` from this plan's perspective.

---

## Final Reminder

Stage 5b is a cleanup stage, not a configuration stage.

The goal is to make Stage 6 possible later — not to force it early.

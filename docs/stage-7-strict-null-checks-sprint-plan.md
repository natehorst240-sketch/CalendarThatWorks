# Stage 7 — `strictNullChecks` Epic Sprint Plan

## Purpose

This document starts the Stage 7 planning effort for enabling `strictNullChecks` repo-wide.

Stage 7 is **not** part of the Stage 0–6 `noImplicitAny` roadmap. That roadmap explicitly deferred nullability work until after Stage 6 was complete. Stage 6 is now complete, so Stage 7 can begin as its own staged epic.

This plan is intentionally measurement-first. `strictNullChecks` work is expected to be **2–4× the effort of Stages 1–6 combined**, so this epic must be sized from real diagnostics and executed in narrow, reviewable slices.

---

## Why Stage 7 is Separate

The `noImplicitAny` migration was dominated by mechanical parameter and callback typing. `strictNullChecks` is different:

- it changes control-flow requirements, not just annotations
- it often forces runtime-safe handling for missing values
- it frequently surfaces real product assumptions, not just loose typing
- it can cascade across component boundaries, hooks, views, tests, and config models

Because of that, Stage 7 needs its **own roadmap, own ratchet, and own audit checkpoints** rather than being appended to the old plan.

---

## Starting Assumptions

Locked assumptions entering Stage 7:

- Stage 6 is complete
- root `noImplicitAny` is already enabled
- the prior ratchet model for `noImplicitAny` has been retired
- this epic should be sized against real `strictNullChecks` measurements, not guesses
- likely effort is **2–4× Stages 1–6 combined**

---

## Guiding Rules

1. **Measure before slicing.** No sprint estimate is valid until repo-wide `strictNullChecks` diagnostics are collected.
2. **Separate nullability bugs from typing cleanup.** If a fix changes runtime behavior, document it explicitly.
3. **One seam per PR.** Nullability cascades faster than `noImplicitAny`; keep slices smaller.
4. **Prefer normalization and guards at boundaries.** Avoid scattering `!` or `as` assertions through callsites.
5. **Non-null assertions are exceptions, not strategy.** Every new `!` must be justified locally.
6. **Keep root builds green.** Use staged enforcement until the repo is truly ready for the root flip.

---

## Proposed Epic Structure

Stage 7 should run as a staged epic with six planned steps.

### Sprint 0 — Baseline audit and enforcement mechanism

**Goal:** establish the measurement and ratchet model for `strictNullChecks`.

Tasks:
- create a dedicated strict-null audit doc
- run repo-wide measurement with `strictNullChecks: true`
- group diagnostics by directory and file
- classify findings into:
  - mechanical narrowing
  - boundary normalization
  - runtime-risk null handling
- decide whether a side config / filter script ratchet is needed again
- record top 20 offending files and top directories

Deliverables:
- `docs/stage-7-strict-null-checks-audit.md`
- a directory/file count table
- staged enforcement mechanism proposal
- first realistic size estimate for the epic

**Exit criteria:**
- repo-wide strict-null diagnostics measured explicitly
- highest-risk hotspots identified
- enforcement plan chosen before code migration begins

---

### Sprint 1 — Leaf types, utilities, and pure data helpers

**Goal:** prove the Stage 7 mechanism on the lowest-risk code.

Likely target areas:
- pure helper modules
- utility functions
- type adapters / normalizers
- parser and formatter helpers with obvious nullable seams

Rules:
- add null guards and normalization helpers at entry seams
- avoid pushing `undefined` unions outward unless required
- prefer explicit return types where nullability matters

**Exit criteria:**
- first migrated paths are strict-null clean
- enforcement mechanism is proven in CI
- no broad UI/view churn required

---

### Sprint 2 — Data boundaries and configuration seams

**Goal:** clean the places where optional external data enters the app.

Likely target areas:
- config loading and parsing
- API response normalization
- persisted owner/workflow/view settings
- imported or external record shapes

Focus:
- normalize once at boundaries
- create named nullable input types vs normalized runtime-safe output types
- avoid duplicated fallback logic across consumers

**Exit criteria:**
- core data-entry seams are normalized
- downstream callers consume safer shapes
- nullability handling is documented for each boundary

---

### Sprint 3 — Hooks and state flows

**Goal:** migrate hooks after the app's data seams are safer.

Likely target areas:
- hooks returning optional state
- refs, event drafts, selection models, and derived state
- async/loading hooks where nullable values are expected transiently

Focus:
- explicit hook return contracts
- loading/empty/error state modeling
- minimize consumer churn by returning stable named result shapes

**Exit criteria:**
- migrated hooks are strict-null clean
- nullability in hook returns is explicit and documented
- view consumers are prepared for later UI migration

---

### Sprint 4 — UI/forms/dialogs

**Goal:** tackle owner-facing UI after boundaries and hooks are stabilized.

Likely target areas:
- forms and dialogs
- config/setup surfaces
- import/export preview flows
- shared UI controls with optional props/data

Focus:
- controlled input safety
- optional callback handling
- conditional rendering around nullable values
- local draft-state narrowing

**Exit criteria:**
- selected UI slices are strict-null clean
- no uncontrolled spread of `value!` or callback assertions

---

### Sprint 5 — Views and root integration

**Goal:** clean the highest-cascade parts of the product.

Likely target areas:
- `src/views/**`
- root calendar composition
- render pipelines depending on optional metadata or partial event shapes

Focus:
- render-time guards
- row/group/event model normalization
- root integration boundaries
- targeted runtime validation for behavior-sensitive paths

**Exit criteria:**
- remaining debt is reduced to a small, reviewable remainder
- a final readiness audit can determine if root `strictNullChecks` flip is realistic

---

### Sprint 6 — Root flip and ratchet retirement

**Goal:** enable `strictNullChecks` in root config and remove Stage 7 migration scaffolding.

Tasks:
- fix final strict-null blockers
- move `strictNullChecks: true` into root config
- remove side-config / temporary ratchet tooling if used
- simplify CI back to one TS gate
- document Stage 7 completion

**Exit criteria:**
- root TypeScript build passes with `strictNullChecks: true`
- temporary migration infrastructure is retired
- docs explicitly mark Stage 7 complete

---

## PR Sizing Rules

Because this epic is expected to be much larger than `noImplicitAny`, use tighter review limits:

- target **1–4 files per PR** for risky areas
- target **1 seam or concept per PR**, not whole directories, once React-heavy work begins
- split immediately if a PR introduces runtime behavior changes in addition to type cleanup

Examples of good Stage 7 slices:
- one parser/normalizer pair
- one hook plus its local tests
- one dialog plus its local helpers
- one view helper cluster, not an entire view family

---

## Early Risk Categories

Every Stage 7 issue or PR should be tagged as one of:

- **Mechanical** — obvious guards, narrowing, or defaulting
- **Boundary** — external/public seam needs normalization
- **Runtime-risk** — null handling may change behavior
- **Cascade-risk** — likely to spread across modules

This label should appear in every PR description.

---

## Required Metrics to Collect in Sprint 0

Before estimating the rest of the epic, capture:

- total repo-wide `strictNullChecks` diagnostics
- unique files affected
- top directories by count
- top offending files by count
- percentage of diagnostics in:
  - pure modules
  - hooks
  - UI
  - views
  - tests
- count of likely runtime-risk sites vs mechanical sites

Without this table, Stage 7 sizing is not considered valid.

---

## Suggested Deliverables

At minimum, Stage 7 should produce these docs/files:

- `docs/stage-7-strict-null-checks-audit.md`
- `docs/stage-7-strict-null-checks-sprint-plan.md` *(this file)*
- optional: Stage 7 ratchet script/config if staged enforcement is reused

---

## Immediate Next Step

Open the Stage 7 baseline audit before committing to any implementation PRs.

The first implementation sprint does **not** start until Sprint 0 produces real repo-wide nullability measurements.

---

## Final Reminder

Stage 7 is expected to be the largest TypeScript migration epic in this repository.

Treat it as a new program of work, not as a follow-up checkbox to Stage 6.

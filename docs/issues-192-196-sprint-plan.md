# Sprint Plan — Issues #192 and #196

**Created:** 2026-04-20
**Branch:** `claude/sprint-plan-192-196-rSLrR`
**Sprint length:** 5 working days
**Scope:** Two focused UX/data-quality issues that are small, independent, and ship-ready as a pair.

> A broader six-issue plan exists in `docs/issues-192-198-one-sprint-plan.md`. This document narrows the scope to just #192 and #196 for a smaller, lower-risk delivery.

---

## Issues

1. **#196 — Asset creation form fields**
   "When assets are created there needs to be a Registration Number, Type, Make, Model, and optional Limitations categories to fill."
2. **#192 — Location filter trap in Schedules tab**
   "When a location in the Schedules tab doesn't have anything assigned to it, the base/location filter button disappears, leaving you trapped in that view."

---

## Sprint Goal

Ship a "Data Quality + Schedule UX Stability" pair: unblock asset data entry with structured required fields, and guarantee users can always recover from an empty filtered state in the Schedules tab.

---

## Issue #196 — Asset Form Enhancement

### Current state

- Asset creation/edit UI lives in `src/ui/ConfigPanel.tsx` (`AssetsTab` around lines 1062–1182).
- Current asset shape: `{ _key, id, label, group, meta: {} }`.
- Assets render in `src/views/AssetsView.tsx` using `asset.id`, `asset.label`, and `meta.sublabel` (lines 39, 425–448).
- "Request asset" flow (`AssetRequestForm.tsx`) is a separate concern — not in scope.

### Target state

Asset records gain the following fields (kept on `asset.meta` to preserve backward compatibility):

| Field                | Required | Notes                                                        |
| -------------------- | -------- | ------------------------------------------------------------ |
| `registrationNumber` | Yes      | Free text, unique is **not** enforced in this sprint.        |
| `type`               | Yes      | Free text or select (reuse existing `group` taxonomy if fit).|
| `make`               | Yes      | Free text.                                                   |
| `model`              | Yes      | Free text.                                                   |
| `limitations`        | No       | Multi-line text, optional.                                   |

### Implementation notes

- Extend the asset form in `ConfigPanel.tsx` with five new inputs (four required, one optional).
- Validate required fields client-side before calling `updateAsset()`; show per-field inline errors.
- Persist via existing config write path — no storage-layer migration needed if fields live on `meta`.
- Update `AssetsView.tsx` to surface the new fields in the detail area (low priority for this sprint; title/sublabel remain primary).
- Existing assets without these fields must still render — treat missing values as empty strings in the form and as blank rows in the view.

### Acceptance criteria

- [ ] New asset cannot be saved without Registration Number, Type, Make, and Model.
- [ ] Limitations is optional and persists when entered.
- [ ] Missing-field validation errors are field-specific and keyboard/screen-reader accessible.
- [ ] Existing assets load without runtime errors when opened in the edit form.
- [ ] Unit tests cover: valid save, missing-field rejection (each required field), legacy asset load.

### Estimate

~2 days including tests.

---

## Issue #192 — Schedules Tab Filter Recovery

### Current state

- Relevant file: `src/views/TimelineView.tsx`.
  - `baseFilter` state at line 164.
  - Filter applied to `displayEmployees` at lines 265–269.
  - Base filter bar rendered at lines 638–653 under `{bases.length > 0 && ...}`.
- Repro: pick a location that has no assignments in the current window → filtered result is empty → filter controls still meant to render, but layout/no-results handling can hide them and strand the user.

### Target state

- The location/base filter bar is **always** visible when `bases.length > 0`, regardless of whether the current filter yields zero rows.
- An empty result must render a clear "no assignments for this location" state with a visible "Clear filter" or "All" button.
- Users can freely switch locations or clear the filter from the empty state without reloading or changing tabs.

### Implementation notes

- Audit the render condition at lines 638–653 — confirm it does not depend on `displayEmployees.length`.
- Add an explicit empty-state view inside the filtered region so the filter bar stays in the DOM and focusable.
- Ensure the "All" / clear-filter button is always enabled when a non-default filter is active.
- Add a Playwright (or existing e2e equivalent) test: apply a location filter that yields zero employees, assert filter controls are still visible and clickable.

### Acceptance criteria

- [ ] Filter bar remains mounted and visible when the filtered result set is empty.
- [ ] "All" / clear-filter control is reachable via keyboard and mouse in the empty state.
- [ ] Empty state renders an informative message identifying the active filter.
- [ ] Switching to another location or clearing the filter restores the full schedule without requiring navigation away from the tab.
- [ ] Regression test guards the empty-state behavior.

### Estimate

~2 days including regression test.

---

## Proposed Timeline

| Day | Work                                                                        |
| --- | --------------------------------------------------------------------------- |
| 1   | #196: form UI + required-field validation + unit tests.                     |
| 2   | #196: backward-compat load path + polish + review-ready PR.                 |
| 3   | #192: render-guard fix + empty-state component + manual repro validation.   |
| 4   | #192: e2e/Playwright regression test + review-ready PR.                     |
| 5   | Cross-issue QA pass, docs/changelog update, demo capture, release notes.    |

Issues are independent and can be parallelized if two developers are available.

---

## QA Checklist

- [ ] Save blocked without each required asset field (4 cases).
- [ ] Save succeeds with required fields, with and without Limitations.
- [ ] Editing a legacy asset (missing new fields) loads without errors.
- [ ] Required-field errors announce via ARIA live region / field-level aria-describedby.
- [ ] Schedules tab with a zero-assignment location: filter bar visible.
- [ ] Schedules tab with a zero-assignment location: "All"/clear control works.
- [ ] Schedules tab with a zero-assignment location: switching location restores data.
- [ ] Keyboard-only navigation reaches filter controls from the empty state.
- [ ] No console errors in either flow.
- [ ] `npm test` passes.
- [ ] Playwright suite passes including new empty-state test.

---

## Risks and Mitigations

- **Legacy asset records missing new fields.** Treat missing values as empty strings in the edit form; do not write migrations in this sprint.
- **Type field overlap with existing `group` taxonomy.** If `group` already conveys type, prefer extending `group` semantics and document the decision in the PR rather than introducing a parallel field.
- **Hidden coupling in TimelineView empty-state.** Keep the fix minimal — do not refactor filter state; only ensure the filter bar is not conditionally unmounted.
- **Regression risk in Schedules tab layout.** Verify at common viewport widths before merge.

---

## Out of Scope

- Asset registration-number uniqueness enforcement.
- Asset type as a managed enum / dropdown (tracked separately if desired).
- Other open issues (#193, #195, #197, #198) — covered in `docs/issues-192-198-one-sprint-plan.md`.
- Storage-layer migrations.

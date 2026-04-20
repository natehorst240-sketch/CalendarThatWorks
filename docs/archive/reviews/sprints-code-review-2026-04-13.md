# Sprint Plan — Code Review 2026-04-13

Derived from the findings in **Code Review — Processes and UX/UI (2026-04-13)**.  
Three already-fixed items (#1 Vitest/Playwright coupling, #3 QA script endpoints, #4 unused import) are excluded — only open items are planned here.

---

## Sprint 1 — Unblock the test suite (High priority)

**Goal:** Get `npm test` to a fully green state and split CI so unit and E2E feedback are independent.

**Estimated size:** 1–2 days

### Tasks

| # | Task | Source finding | Notes |
|---|------|---------------|-------|
| 1.1 | Add `@testing-library/dom` as a dev dependency and refresh the lockfile | Finding #2 | Was blocked in review by a 403 from the registry; retry with normal access |
| 1.2 | Run `npm test` end-to-end and confirm zero import-stage failures | Finding #2 | Acceptance: all RTL suites reach assertion phase |
| 1.3 | Add a CI workflow split — separate job for unit/component (`npm test`) and browser E2E (`npm run test:browser`) | Prioritized next steps #2 | Prevents a Playwright failure from blocking unit feedback |
| 1.4 | Add `.env.example` documenting `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `LM_STUDIO_BASE_URL`, `LM_STUDIO_API_KEY` for the QA reviewer script | Finding #3 process note | `docs/Contributing.md` already mentions env vars; `.env.example` makes it discoverable |

### Acceptance criteria

- `npm test` exits 0 with all RTL suites running (no import-stage crashes).
- CI has two independent gates that can fail separately.
- `.env.example` committed at repo root.

---

## Sprint 2 — Accessibility hardening (Medium priority)

**Goal:** Fix the two modal/form a11y issues that affect screen reader and keyboard users in every embedded deployment.

**Estimated size:** 2–3 days

### Tasks

| # | Task | Source finding | File(s) |
|---|------|---------------|---------|
| 2.1 | Audit `EventForm.jsx` labels — replace all wrapper-text labels with explicit `<label htmlFor="…">` + matching `id` on the input | Finding D | `src/ui/EventForm.jsx` |
| 2.2 | Apply the same label audit to any other modal forms that share the pattern (`HoverCard`, `SetupWizardModal`, `AdvancedFilterBuilder`) | Finding D (extended) | `src/ui/*.jsx` |
| 2.3 | Update `FOCUSABLE_SELECTORS` in `useFocusTrap.js` to filter out elements that are visually/interactively hidden before cycling focus | Finding C | `src/hooks/useFocusTrap.js` |
| 2.4 | Replace the native `confirm()` delete call in `EventForm` with an in-app `<ConfirmDialog>` component that uses the existing focus trap and design system tokens | Finding B | `src/ui/EventForm.jsx` + new `src/ui/ConfirmDialog.jsx` |
| 2.5 | Add unit tests for `useFocusTrap` edge cases: container with hidden inputs, `aria-hidden` subtrees, `inert` attribute, all-disabled form | Finding C next steps | new test file under `src/hooks/__tests__/` |
| 2.6 | Add a smoke test that opens EventForm, tabs through all fields, and confirms no focus escape | Finding C/D combined | new Playwright spec or RTL test |

### Acceptance criteria

- Every interactive control in EventForm has a programmatically associated label (verified with axe or similar).
- Tab order in EventForm and all other modals never reaches elements outside the dialog.
- Delete action shows an in-app confirmation dialog styled with design system tokens.
- `useFocusTrap` test suite covers hidden/disabled/inert cases.

---

## Sprint 3 — EventForm refactor (Medium priority)

**Goal:** Break the monolithic EventForm into focused, independently-testable pieces to reduce regression risk for future UX changes.

**Estimated size:** 3–5 days

> **Prerequisite:** Sprint 1 must be complete (test suite green) so regressions are caught during refactor.

### Tasks

| # | Task | Source finding | Output |
|---|------|---------------|--------|
| 3.1 | Extract `useEventDraftState` hook — owns all draft field state, validation logic, and template-application side-effects | Finding A | `src/hooks/useEventDraftState.js` |
| 3.2 | Extract `<RecurrenceSection>` — recurrence preset selector + custom RRULE builder + weekday picker | Finding A | `src/ui/EventFormSections/RecurrenceSection.jsx` |
| 3.3 | Extract `<CategorySection>` — category dropdown + "add category" inline flow | Finding A | `src/ui/EventFormSections/CategorySection.jsx` |
| 3.4 | Extract `<CustomFieldsSection>` — dynamic schema-driven custom field rendering | Finding A | `src/ui/EventFormSections/CustomFieldsSection.jsx` |
| 3.5 | Slim `EventForm.jsx` down to layout/orchestration only — wire the extracted sections and hook | Finding A | `src/ui/EventForm.jsx` |
| 3.6 | Add focused unit tests for each extracted section and hook: recurrence RRULE generation, category add flow, custom field validation | Finding A next steps | `src/ui/__tests__/`, `src/hooks/__tests__/` |
| 3.7 | Add regression tests for the recurrence × custom-field interaction (ensure custom fields survive preset changes and vice versa) | Prioritized next steps #3 | RTL integration test |

### Acceptance criteria

- `EventForm.jsx` is ≤ 150 lines (layout + wiring only).
- Each extracted section renders and passes its own unit tests in isolation.
- All existing EventForm behavior (create, edit, recurrence, custom fields, template apply) passes the regression suite.
- No behavior changes visible to users.

---

## Dependency map

```
Sprint 1  ──►  Sprint 2  ──►  Sprint 3
(green tests)  (a11y fixes)   (EventForm refactor)
```

Sprint 2 can start in parallel with Sprint 1 for the label/focus-trap work (2.1–2.3); the `ConfirmDialog` task (2.4) only needs Sprint 1 complete if it requires RTL tests to verify.

Sprint 3 requires Sprint 1 to be complete before beginning.

---

## Open questions / risks

| Risk | Mitigation |
|------|-----------|
| Registry access may still block `@testing-library/dom` install (Task 1.1) | If 403 persists, vendor the package or pin a local path until network policy is updated |
| `inert` attribute browser support in `useFocusTrap` filter | Use `el.inert` with a feature-detect fallback to `aria-hidden` |
| EventForm refactor may expose hidden state-sharing between sections | Write the regression tests (3.6–3.7) before extracting sections, not after |
| `ConfirmDialog` (2.4) needs design token decisions (button colors, wording) | Align with existing `ValidationAlert` component as the visual reference |

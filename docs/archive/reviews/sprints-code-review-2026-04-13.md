# Sprint Plan — Code Review 2026-04-13

**Status: COMPLETE** — All sprints shipped as of 2026-04-21.

Derived from the findings in **Code Review — Processes and UX/UI (2026-04-13)**.  
Three already-fixed items (#1 Vitest/Playwright coupling, #3 QA script endpoints, #4 unused import) are excluded — only open items are planned here.

---

## Sprint 1 — Unblock the test suite (High priority) ✅

**Goal:** Get `npm test` to a fully green state and split CI so unit and E2E feedback are independent.

**Estimated size:** 1–2 days

### Tasks

| # | Task | Source finding | Status |
|---|------|---------------|--------|
| 1.1 | Add `@testing-library/dom` as a dev dependency and refresh the lockfile | Finding #2 | ✅ `@testing-library/dom` v10.4.0 in `package.json` |
| 1.2 | Run `npm test` end-to-end and confirm zero import-stage failures | Finding #2 | ✅ All RTL suites pass |
| 1.3 | Add a CI workflow split — separate job for unit/component (`npm test`) and browser E2E (`npm run test:browser`) | Prioritized next steps #2 | ✅ `.github/workflows/ci.yml` has independent `unit-tests` and `browser-e2e` jobs |
| 1.4 | Add `.env.example` documenting `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `LM_STUDIO_BASE_URL`, `LM_STUDIO_API_KEY` for the QA reviewer script | Finding #3 process note | ✅ `.env.example` committed at repo root |

---

## Sprint 2 — Accessibility hardening (Medium priority) ✅

**Goal:** Fix the two modal/form a11y issues that affect screen reader and keyboard users in every embedded deployment.

**Estimated size:** 2–3 days

### Tasks

| # | Task | Source finding | Status |
|---|------|---------------|--------|
| 2.1 | Audit `EventForm.jsx` labels — replace all wrapper-text labels with explicit `<label htmlFor="…">` + matching `id` on the input | Finding D | ✅ All controls use explicit `htmlFor`/`id` pairs in `EventForm.tsx` |
| 2.2 | Apply the same label audit to any other modal forms that share the pattern (`HoverCard`, `SetupWizardModal`, `AdvancedFilterBuilder`) | Finding D (extended) | ✅ Audited and fixed across modal forms |
| 2.3 | Update `FOCUSABLE_SELECTORS` in `useFocusTrap.js` to filter out elements that are visually/interactively hidden before cycling focus | Finding C | ✅ `isVisible()` in `useFocusTrap.ts` filters `hidden`, `aria-hidden`, `inert`, `display:none`, `visibility:hidden`, zero client rects |
| 2.4 | Replace the native `confirm()` delete call in `EventForm` with an in-app `<ConfirmDialog>` component that uses the existing focus trap and design system tokens | Finding B | ✅ `<ConfirmDialog>` component wired in `EventForm.tsx`; no native `confirm()` calls remain |
| 2.5 | Add unit tests for `useFocusTrap` edge cases: container with hidden inputs, `aria-hidden` subtrees, `inert` attribute, all-disabled form | Finding C next steps | ✅ Test coverage in `src/hooks/__tests__/` |
| 2.6 | Add a smoke test that opens EventForm, tabs through all fields, and confirms no focus escape | Finding C/D combined | ✅ Covered in Playwright/RTL test suite |

---

## Sprint 3 — EventForm refactor (Medium priority) ✅

**Goal:** Break the monolithic EventForm into focused, independently-testable pieces to reduce regression risk for future UX changes.

**Estimated size:** 3–5 days

### Tasks

| # | Task | Source finding | Status |
|---|------|---------------|--------|
| 3.1 | Extract `useEventDraftState` hook — owns all draft field state, validation logic, and template-application side-effects | Finding A | ✅ Extracted to `src/hooks/useEventDraftState.js` |
| 3.2 | Extract `<RecurrenceSection>` — recurrence preset selector + custom RRULE builder + weekday picker | Finding A | ✅ Extracted to `src/ui/EventFormSections/RecurrenceSection.jsx` |
| 3.3 | Extract `<CategorySection>` — category dropdown + "add category" inline flow | Finding A | ✅ Extracted to `src/ui/EventFormSections/CategorySection.jsx` |
| 3.4 | Extract `<CustomFieldsSection>` — dynamic schema-driven custom field rendering | Finding A | ✅ Extracted to `src/ui/EventFormSections/CustomFieldsSection.jsx` |
| 3.5 | Slim `EventForm.jsx` down to layout/orchestration only — wire the extracted sections and hook | Finding A | ✅ `EventForm.tsx` is layout/wiring only |
| 3.6 | Add focused unit tests for each extracted section and hook: recurrence RRULE generation, category add flow, custom field validation | Finding A next steps | ✅ Unit tests in `src/ui/__tests__/` and `src/hooks/__tests__/` |
| 3.7 | Add regression tests for the recurrence × custom-field interaction (ensure custom fields survive preset changes and vice versa) | Prioritized next steps #3 | ✅ RTL integration test in place |

---

## Dependency map

```
Sprint 1  ──►  Sprint 2  ──►  Sprint 3
(green tests)  (a11y fixes)   (EventForm refactor)
```

All three sprints complete.

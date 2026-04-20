# Code Review — Processes and UX/UI (2026-04-13)

This review covered repository-level delivery processes (test setup, QA automation flow, dependency hygiene) and core UX/UI surface areas (modals/forms/accessibility patterns).

## Scope reviewed

- Test and automation configs (`vitest.config.js`, `playwright.config.ts`, `package.json`, `scripts/ai-qa-review.mjs`).
- Representative UX components and supporting hooks (`src/ui/EventForm.jsx`, `src/hooks/useFocusTrap.js`, `src/hooks/useFetchEvents.js`).
- QA standards docs (`qa/qa-rubric.md`).

## Findings

### 1) Unit and E2E suites were coupled in `npm test` (High) ✅ Fixed

- **What was weak:** `vitest` was discovering `tests-e2e/*.spec.ts`, causing Playwright files to execute in Vitest context.
- **Impact:** noisy failures, slower CI feedback, and unclear developer workflow.
- **Fix implemented:** added explicit Vitest `include` and `exclude` patterns so `npm test` runs only unit/component tests under `src/`.
- **Process improvement:** keep `npm test` for fast local feedback; reserve `npm run test:browser` for Playwright.

### 2) Missing explicit dependency for Testing Library DOM (High) ⚠️ Not fixed in this branch

- **What was weak:** test runs fail with `Cannot find module '@testing-library/dom'` from `@testing-library/react`.
- **Impact:** all React Testing Library suites fail at import stage.
- **Recommended fix:** add `@testing-library/dom` as a dev dependency and refresh lockfile.
- **Why not fixed here:** registry access policy in this environment returned `403 Forbidden` during install.

### 3) QA reviewer script had environment-specific endpoint and key defaults (Medium) ✅ Fixed

- **What was weak:** `scripts/ai-qa-review.mjs` contained a hardcoded LAN IP and static API key fallback values.
- **Impact:** brittle portability, accidental leakage of environment assumptions, friction for onboarding.
- **Fix implemented:** switched to env-var-first configuration (`OPENAI_*` / `LM_STUDIO_*`) with localhost fallback.
- **Process improvement:** document expected env vars in `docs/Contributing.md` or `.env.example`.

### 4) Unused import in event fetching hook (Low) ✅ Fixed

- **What was weak:** `addMonths` was imported but unused in `useFetchEvents`.
- **Impact:** minor dead code / signal-to-noise issue.
- **Fix implemented:** removed unused import.

## UX/UI weak points and recommendations

### A) Event form complexity concentration (Medium)

- `EventForm` currently mixes recurrence rule building, template application, category management, validation, and dynamic schema rendering in one component.
- **Risk:** increased cognitive load and regression risk for future UX changes.
- **Recommendation:** split into focused hooks/components:
  - `useEventDraftState`
  - `RecurrenceSection`
  - `CategorySection`
  - `CustomFieldsSection`

### B) Native `confirm(...)` for destructive action (Medium)

- Delete flow in `EventForm` uses browser `confirm()`.
- **Risk:** inconsistent styling/accessibility behavior across embedded environments.
- **Recommendation:** replace with an in-app confirm dialog component tied to the existing focus trap and design system.

### C) Focus trap edge cases (Low/Medium)

- `useFocusTrap` is generally solid, but selector list does not explicitly exclude hidden/inert elements.
- **Recommendation:** filter candidates by visibility/interactivity (`offsetParent`, `aria-hidden`, `inert`) before cycling focus.

### D) Form labels and control associations (Medium)

- Several labels in `EventForm` are wrapper text without explicit `htmlFor` + input `id` pairs.
- **Recommendation:** standardize explicit associations for stronger a11y tooling support and clearer SR behavior.

## Prioritized next steps

1. Add `@testing-library/dom` and verify `npm test` passes fully.
2. Add CI split gates:
   - unit/component (`npm test`)
   - browser E2E (`npm run test:browser`)
3. Refactor `EventForm` into smaller sections + add regression tests around recurrence/custom-field interactions.
4. Replace delete `confirm()` with themed modal.
5. Expand focus trap tests for hidden/disabled/inert focusable descendants.


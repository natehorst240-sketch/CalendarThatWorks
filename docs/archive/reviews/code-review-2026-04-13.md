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

### 2) Missing explicit dependency for Testing Library DOM (High) ✅ Fixed

- **What was weak:** test runs fail with `Cannot find module '@testing-library/dom'` from `@testing-library/react`.
- **Impact:** all React Testing Library suites fail at import stage.
- **Fix implemented:** `@testing-library/dom` v10.4.0 added as a dev dependency; all RTL suites pass.

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

### A) Event form complexity concentration (Medium) ✅ Fixed

- `EventForm` was split into `useEventDraftState`, `<RecurrenceSection>`, `<CategorySection>`, and `<CustomFieldsSection>`. `EventForm.tsx` is now layout/wiring only. Unit + regression tests added for each section.

### B) Native `confirm(...)` for destructive action (Medium) ✅ Fixed

- Replaced with `<ConfirmDialog>` component using the existing focus trap and design system tokens. No native `confirm()` calls remain in `EventForm.tsx`.

### C) Focus trap edge cases (Low/Medium) ✅ Fixed

- `useFocusTrap.ts` now filters candidates via `isVisible()`, which excludes `hidden`, `[hidden]`, `aria-hidden="true"` subtrees, `inert`, `display:none`, `visibility:hidden`, and zero-client-rect elements. Feature-detect for `inert` with `aria-hidden` fallback included.

### D) Form labels and control associations (Medium) ✅ Fixed

- All interactive controls in `EventForm.tsx` and other modal forms use explicit `htmlFor`/`id` pairs.

## All next steps resolved ✅

All five prioritized next steps from this review are complete as of 2026-04-21.


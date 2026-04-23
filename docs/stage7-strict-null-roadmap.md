# Stage 7 — Strict Null Migration Roadmap

## Objective
Eliminate strict-null TypeScript errors across the repo without changing runtime behavior.

---

## Current Status
- Baseline strict-null errors: ~386
- Current: ~351
- Strategy: Reduce in small, safe PR batches (2–3 files per PR)

---

## Global Rules (ALL PRs)
- ❌ No behavior changes
- ❌ No refactors outside scope
- ❌ Avoid `as` unless unavoidable
- ✅ Prefer narrowing (`if`, `in`, `typeof`)
- ✅ Use `??` instead of `||` for nullable defaults
- ✅ Delete keys instead of assigning `undefined`
- ✅ Catch `unknown` and narrow

---

## Sprint Overview

### Sprint 1 — Foundation Stabilization
- Fix shared types (FeedValidationState, etc.)
- Remove unsafe unions
- Normalize core helpers

### Sprint 2 — UI Surface Hardening
- Forms
- Panels
- Import flows

### Sprint 3 — Deep UI + Hooks
- Hooks
- Complex builders
- Cross-component contracts

### Sprint 4 — Final Sweep
- Edge cases
- Leftover any
- Tighten types

---

## Sprint 2 — Detailed Breakdown

### PR Batch 2.1
Files:
- src/ui/ImportZone.tsx
- src/ui/CalendarExternalForm.tsx
- src/ui/AssetRequestForm.tsx

Goals:
- Remove `any` props
- Properly type event handlers
- Narrow FileReader results

### PR Batch 2.2
Files:
- src/ui/ICSFeedPanel.tsx
- src/ui/ImportPreview.tsx
- src/ui/CSVImportDialog.tsx

Goals:
- Fix discriminated unions
- Add proper state typing
- Remove optional chaining misuse

### PR Batch 2.3
Files:
- src/ui/EventForm.tsx
- src/ui/AssetsView.tsx

Goals:
- Normalize form state
- Remove nullable leakage

---

## Sprint 3 — Detailed Breakdown

### PR Batch 3.1
Files:
- src/hooks/useFocusTrap.ts
- src/hooks/useEventDraftState.ts

Goals:
- Fix generic refs
- Remove HTMLElement mismatches
- Narrow nullable template defaults in draft state logic

Start checklist (2026-04-23):
- `src/hooks/useFocusTrap.ts`: 0 strict-null diagnostics
- `src/hooks/useEventDraftState.ts`: 12 strict-null diagnostics (`TS18047`, `template.defaults` possibly null at lines 201–207)

Validation commands for this batch:
- `npm run -s type-check:strict-null`
- `node_modules/.bin/tsc --noEmit --pretty false --strictNullChecks true 2>&1 | rg "^src/hooks/(useFocusTrap|useEventDraftState)\\.ts"`

### PR Batch 3.2
Files:
- src/ui/AdvancedFilterBuilder.tsx
- src/filters/conditionEngine.ts

Goals:
- Tighten condition types
- Remove implicit undefined

### PR Batch 3.3
Files:
- Remaining UI edge components

Goals:
- Final cleanup of UI null paths

---

## PR Template

```
# Objective
Reduce strict-null errors without behavior changes.

# Scope
Only edit listed files.

# Constraints
- no behavior changes
- no unrelated refactors
- prefer narrowing
- avoid `as`

# Validation
Run:
- npm run type-check
- npm run type-check:strict-null
Report error delta.
```

---

## How to Use With Codex

Prompt:

```
Read docs/stage7-strict-null-roadmap.md
Implement the next PR batch only
Do not touch other files
Run type-check:strict-null and report delta
```

---

## Definition of Done
- No new errors introduced
- Strict-null count decreases
- No runtime changes
- CI passes

---

## Notes
Work in small batches only. Large PRs will regress stability.

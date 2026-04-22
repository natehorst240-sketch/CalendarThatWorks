# Stage 7 — strictNullChecks Audit (Sprint 0 Baseline)

_Date:_ 2026-04-22  
_Status:_ Sprint 0 baseline completed; Sprint 1 ratchet pilot landed on `src/grouping/groupRows.ts`

## Scope and Method

This audit measures repo-wide TypeScript diagnostics with `strictNullChecks` forced on, without changing root compiler settings yet.

Command used:

```bash
npx tsc --noEmit --pretty false --strictNullChecks true
```

Raw output was captured to `/tmp/strict-null-tsc.log` and then summarized for directory, file, and category-level planning.

---

## Baseline Metrics

- **Total strict-null diagnostics:** 440
- **Unique files affected:** 56
- **Top-level concentration:** `src/views`, `src/ui`, and `src/WorksCalendar.tsx`

### Diagnostics by area

| Area | Diagnostics | Share |
|---|---:|---:|
| views (`src/views/**`) | 146 | 33.2% |
| tests (`**/__tests__/**` + `src/__tests__/**`) | 143 | 32.5% |
| pure modules (everything else) | 80 | 18.2% |
| ui (`src/ui/**`, excluding tests) | 46 | 10.5% |
| hooks (`src/hooks/**`, excluding tests) | 25 | 5.7% |

### Top directories by diagnostic count

| Directory | Diagnostics |
|---|---:|
| `src/views` | 161 |
| `src/ui` | 112 |
| `src/WorksCalendar.tsx` | 77 |
| `src/hooks` | 42 |
| `src/__tests__` | 18 |
| `src/api` | 13 |
| `src/filters` | 7 |
| `src/grouping` | 7 |
| `src/core` | 3 |

### Top 20 files by diagnostic count

| File | Diagnostics |
|---|---:|
| `src/WorksCalendar.tsx` | 77 |
| `src/views/TimelineView.tsx` | 58 |
| `src/ui/__tests__/a11y.test.tsx` | 42 |
| `src/views/WeekView.tsx` | 25 |
| `src/views/DayView.tsx` | 22 |
| `src/views/AssetsView.tsx` | 21 |
| `src/hooks/useEventDraftState.ts` | 14 |
| `src/__tests__/groupingFilteringSorting.integration.test.ts` | 13 |
| `src/api/v1/__tests__/sync.test.ts` | 12 |
| `src/ui/ICSFeedPanel.tsx` | 12 |
| `src/ui/SourcePanel.tsx` | 12 |
| `src/views/MonthView.tsx` | 10 |
| `src/ui/__tests__/ThemeCustomizer.test.tsx` | 9 |
| `src/hooks/__tests__/useSourceStore.test.ts` | 8 |
| `src/ui/__tests__/EventForm.focusTrap.test.tsx` | 8 |
| `src/filters/__tests__/filterEngine.test.ts` | 6 |
| `src/views/__tests__/AgendaView.grouping.test.tsx` | 6 |
| `src/grouping/__tests__/groupRows.test.ts` | 5 |
| `src/ui/ScheduleEditorForm.tsx` | 5 |
| `src/views/AgendaView.tsx` | 5 |

### Top error codes

| Code | Count |
|---|---:|
| TS2339 | 154 |
| TS2345 | 83 |
| TS18047 | 60 |
| TS18048 | 55 |
| TS2532 | 31 |
| TS2322 | 27 |
| TS2353 | 13 |
| TS2769 | 9 |

---

## Required Sprint-0 Classification

Using a first-pass triage heuristic against diagnostics and hotspot files:

| Classification | Count | Share | Notes |
|---|---:|---:|---|
| Mechanical narrowing | 246 | 55.9% | Guarding locals, optional chaining, narrowing arrays/find/lookups |
| Boundary normalization | 13 | 3.0% | Primarily API/adapter seams (`src/api/**`) |
| Runtime-risk null handling | 181 | 41.1% | Render paths, refs, state shape assumptions in `WorksCalendar`/views/UI |

> Note: this is an initial planning classification for Sprint 0 sizing. Final per-PR labels still need human review because some diagnostics that look mechanical can alter behavior.

---

## Hotspot Summary and Risks

1. **Root composition hotspot** (`src/WorksCalendar.tsx`, 77 diagnostics)  
   - Mixed state initialization and nullable refs are causing wide `never`/`null` cascades.
   - High chance of runtime-sensitive behavior changes if fixed in large batches.

2. **View pipeline hotspot** (`src/views/**`, 161 diagnostics total)  
   - `TimelineView`, `WeekView`, `DayView`, and `AssetsView` dominate remaining risk.
   - Many diagnostics come from nullable DOM refs and optional render callbacks.

3. **Test nullability debt** (143 diagnostics)  
   - Tests rely on assumptions like `.at(0)`/query returns always present.
   - Should be cleaned in tandem with production seam fixes to avoid churn.

4. **Boundary seams are smaller but high leverage** (`src/api/**`, adapters)  
   - Fewer diagnostics, but fixing these can prevent null unions from spreading into hooks/views.

---

## Enforcement Mechanism Decision (Sprint 0)

**Decision:** use a **side strict-null ratchet** before root flip.

### Proposed ratchet model

1. Keep root `tsconfig.json` unchanged for now (`strictNullChecks: false`).
2. Add a dedicated Stage 7 check path:
   - either `tsconfig.stage7-strictnull.json` (extends root, sets `strictNullChecks: true`), or
   - direct CLI command wrapper using current include set.
3. Persist baseline diagnostics snapshot (`440`) and fail CI only when count increases.
4. Allow count reductions in any PR; require no regressions.
5. Once diagnostics are low enough, switch from count-ratchet to path-based strict slices.

This mirrors the successful staged enforcement pattern used in prior TypeScript migrations while acknowledging Stage 7’s higher cascade risk.

---

## First Size Estimate (Post-Measurement)

Given:
- 440 diagnostics across 56 files,
- 41.1% runtime-risk classification,
- heavy concentration in React composition/views,

**Initial estimate:** Stage 7 likely requires **12–18 focused engineering weeks** (or equivalent parallelized capacity), with the expected long tail in views + test stabilization.

This is consistent with the sprint-plan assumption that Stage 7 effort may be **2–4× Stages 1–6 combined**.

---

## Suggested Sprint-1 Candidate Slice

To de-risk quickly while proving the ratchet:

- target one low-cascade boundary seam in `src/api/v1/**` plus its tests,
- avoid `src/views/**` and `src/WorksCalendar.tsx` in first implementation PR,
- keep PR size to 1–4 files and single-concept changes.

---

## Sprint 0 Exit Check

- [x] repo-wide strict-null diagnostics measured explicitly
- [x] diagnostics grouped by directory and file
- [x] findings classified (mechanical / boundary / runtime-risk)
- [x] top offenders identified
- [x] staged enforcement mechanism proposed
- [x] first realistic epic size estimate recorded

---

## Sprint 1 Pilot (Leaf utility seam)

Date: 2026-04-22

- Added a strict-null ratchet script (`scripts/typecheck-strict-null.mjs`) that runs full-repo strict-null diagnostics and fails only for migrated paths.
- Wired CI to run `npm run type-check:strict-null` as a blocking TypeScript check.
- Migrated first low-risk leaf path:
  - `src/grouping/groupRows.ts`
  - `src/grouping/__tests__/groupRows.test.ts`

Pilot result:
- Migrated paths are strict-null clean under the ratchet.
- Mechanism is active in CI without requiring root `strictNullChecks` flip.

## Root strictNullChecks Flip Trial

Date: 2026-04-22

### Change applied

- Updated `tsconfig.json` to set `compilerOptions.strictNullChecks` to `true`.

### Validation command

```bash
npm run -s type-check -- --pretty false
```

### Result summary

- Exit code: `2` (type-check failed under strict nullability)
- Total diagnostics: **386**
- Unique files affected: **53**

Top offending files:

1. `src/WorksCalendar.tsx` — 77 diagnostics
2. `src/views/TimelineView.tsx` — 58 diagnostics
3. `src/views/WeekView.tsx` — 25 diagnostics
4. `src/views/DayView.tsx` — 22 diagnostics
5. `src/views/AssetsView.tsx` — 21 diagnostics

Top error codes:

- `TS2339` — 154
- `TS2345` — 67
- `TS18047` — 52
- `TS2532` — 31
- `TS18048` — 29

### Findings

- The strict-null failures remain heavily concentrated in `src/WorksCalendar.tsx` and view-layer components, matching prior Stage 7 hotspot analysis.
- A recurring failure pattern is state initialized as `null` (or inferred as `never`) and later consumed as non-null objects, causing large `TS2339`/`TS2345` cascades.
- Ref-centric code paths (`engineRef.current`, `undoManagerRef.current`) contribute many `possibly 'null'` diagnostics and should be handled with explicit guards or narrowed helper APIs.
- Tests continue to fail on nullable query/indexing assumptions (`Object is possibly 'undefined'`), indicating production + test migration must proceed together.

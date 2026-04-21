# TypeScript Strict Migration — Staged Roadmap

Plan for migrating the codebase to `strict: true` without the failure mode from the prior attempt (see [typescript-migration-lessons-2026-04-21](./archive/reviews/typescript-migration-lessons-2026-04-21.md)). The plan is staged, each stage has explicit exit criteria, and every stage is independently shippable.

## Baseline (as of 2026-04-21)

`tsconfig.json` currently sets:

```json
"strict": true,
"noImplicitAny": false,
"strictNullChecks": false
```

Measured in Stage 0 (2026-04-21) against `tsconfig.json` + `noImplicitAny: true` with dependencies installed:

- **1,466 real implicit-any diagnostics** (TS7005, TS7006, TS7011, TS7018, TS7023, TS7031, TS7034, TS7053). The prior session's ~1,973 figure was measured before intermediate TS migration PRs landed.
- `strictNullChecks` has **not** been measured. Typical ratio in codebases that ignored nulls is 2–4× the implicit-any count, so a working estimate is 3,000–6,000 sites.

This roadmap covers `noImplicitAny` in stages 0–6 and parks `strictNullChecks` as a separate epic that does **not** start until stage 6 is done.

## Guiding principles

1. **Slice by directory, leaves first.** Migrate pure modules before React; pure React before JSX-heavy views.
2. **Real types over `any`.** `any` is allowed only with an adjacent comment stating the reason. Track the count; treat growth as a red flag.
3. **CI ratchet, not a cliff.** Migrated directories are locked in via a side `tsconfig.strict.json` + CI job. New code in migrated directories must typecheck strict. Stops regression without requiring the whole repo to be done.
4. **No repo-wide text transforms.** `ts-morph` / TS compiler API or hand edits only. No arrow-parameter regexes.
5. **One slice per PR.** Commit per stable batch. A stage may span multiple PRs.
6. **Measure before estimating.** Each stage's sizing is updated with real numbers from the stage before it.

## Mechanism

**Side config + filter script, not root flip.** Root `tsconfig.json` stays as-is until stage 6. Migration is tracked in two files:

1. `tsconfig.strict.json` — extends the root, sets `noImplicitAny: true`, and includes the **whole** `src` + `demo` tree. This is deliberate: `tsc` typechecks transitively (any file imported by an included file is also typechecked), so a narrow `include` does *not* isolate strictness. Running strict over the whole repo is the only way to get accurate diagnostics.
2. `scripts/typecheck-strict.mjs` — runs `tsc -p tsconfig.strict.json`, parses diagnostics, and **fails only on implicit-any codes (TS7005/7006/7011/7018/7023/7031/7034/7053) in a `MIGRATED_PATHS` allowlist**. Everything outside the allowlist is reported by the existing advisory `type-check` job but does not block the strict job.

`MIGRATED_PATHS` in the script grows one slice at a time. `npm run type-check:strict` invokes the script. CI runs it as a blocking job alongside the advisory `type-check` job, so migrated directories cannot regress.

**Why this mechanism instead of narrow `include`:** the original plan assumed `include: ["src/types/**"]` in `tsconfig.strict.json` would enforce strictness on that directory only. In practice, once you import *any* other file from the included set, tsc typechecks the transitive closure under strict, flooding with errors from unmigrated code. Path-level ratchet via a filter script is the practical way to get per-directory enforcement out of a program-level typechecker.

## Stages

### Stage 0 — Baseline & mechanism — ✅ Completed 2026-04-21

**Goal:** land the migration infrastructure with zero code changes.

Tasks:
- Add `tsconfig.strict.json` with empty `include`.
- Add `npm run typecheck:strict`.
- Wire `typecheck:strict` into CI as a blocking job.
- Run per-directory error counts under `noImplicitAny: true` and publish them in this doc's "Measured per-directory counts" section.

**What shipped:**
- `tsconfig.strict.json` extends root with `noImplicitAny: true` and includes the whole `src` + `demo` tree.
- `scripts/typecheck-strict.mjs` runs `tsc` under the strict config, filters diagnostics to implicit-any codes in a `MIGRATED_PATHS` allowlist, and fails only on those.
- `npm run type-check:strict` invokes the filter script.
- `type-check-strict` job in `.github/workflows/ci.yml` as a blocking check.
- Baseline per-directory measurements in the table below.

**Mechanism pivot during Stage 1:** the Stage 0 commit (`2082cf9`) used a narrow `include` on `src/types/globals.d.ts`. That approach is fragile — once `src/index.ts` or any non-leaf file enters the include, `tsc` pulls in the transitive closure under strict. Stage 1 replaced the narrow-include approach with the filter-script ratchet described in the Mechanism section above. Previous mechanism is preserved in git history.

**Sizing:** ~1 day. Actual: ~1 day.

---

### Stage 1 — Types slice: `src/types/**` + `src/index.ts` — ✅ Completed 2026-04-21

**Goal:** prove the pattern on the smallest possible slice.

**What shipped:**
- `src/types/` and `src/index.ts` added to `MIGRATED_PATHS` in `scripts/typecheck-strict.mjs`.
- Zero `any` added (both paths were already strict-clean in the Stage 0 baseline).
- `npm run type-check:strict` green.
- Also surfaced and fixed the mechanism flaw (see Stage 0 "Mechanism pivot" note). This is the actual value Stage 1 delivered — the migration bit was free; the architecture correction was not.

**Sizing:** 2–3 days estimated. Actual: same day as Stage 0, because Stage 0 measurement showed both paths were already clean.

---

### Stage 2 — Core & pure engine-adjacent — ✅ Completed 2026-04-21

**Scope:** `src/core/**`, `src/filters/**`, `src/grouping/**`, `src/export/**`, `src/external/**`.

**Rules:**
- Real types preferred. Explicit `any` requires an adjacent `// any: <reason>` comment.
- Sub-split by directory if any directory exceeds ~150 diagnostics.
- Track the running count of explicit `any` sites in this doc.

**What shipped:**
- Three commits landing the five directories in logical batches:
  - `6222f2e` — `src/external/**` + `src/export/**` (2 + 10 sites; boundary slices, 0 `any` added).
  - `0525f6d` — `src/core/**` (183 sites; largest batch — `icalParser.ts`, `csvParser.ts`, `validator.ts`, `scheduleMutations.ts`, `layout.ts`, `scheduleOverlap.ts`, `scheduleModel.ts`, `configSchema.ts`, `supabase.ts`).
  - `15857b8` — `src/grouping/**` + `src/filters/**` (46 + 54 sites).
- Structural "-like" types for dynamic event shapes (`ScheduleEventLike`, `OverlapEventLike`, `LayoutEvent`, `ValidatorEvent`, `ShiftEventLike`, `FilterItem`) rather than importing the canonical `NormalizedEvent` — this prevents typing from cascading into unmigrated test callsites that construct partial stub events.
- Boundary types at consumer-facing edges use `Record<string, any>` (e.g. `loadConfig()` return, `FilterItem`) to avoid forcing narrowing on unmigrated callers. Internal-only helpers use `Record<string, unknown>`.
- `npm run type-check:strict` green across all 7 migrated paths; full 1,911-test suite passes.

**Lessons learned:**
- **Tightening public signatures cascades.** The first pass on `layout.ts` imported `NormalizedEvent`, which broke `layout.test.ts` where tests construct partial `{ start, end, allDay }` stubs. Loosening the public parameter to a local `LayoutEvent = { start: Date; end: Date; allDay?: boolean; [k: string]: any }` kept the ratchet green without requiring test rewrites. **Rule for future stages:** when a public function is consumed by unmigrated code, prefer a loose structural parameter type over importing the canonical domain type. Tighten later, as part of the relevant stage's own migration.
- **`Record<string, any>` vs `Record<string, unknown>` is a real choice, not a default.** Using `unknown` on `loadConfig()` return surfaced TS2339 in `configSchema.test.ts` where the test does dotted access like `config.approvals.enabled`. Widened to `any` at that specific seam. The general rule: `unknown` is correct, but until the call-site is migrated, `any` at the boundary prevents downstream breakage.
- **Transitive typechecking pulls in more than expected.** Once `src/core/` was in the allowlist, several tests in `src/core/__tests__/` failed under strict even though tests are not in the allowlist — because `tsc` typechecks the whole graph, and implicit-any in a test file blocks the production module under its own strict check. Resolved by annotating a small number of test-file helpers (`const d = (iso: string) => ...`, `function makeEvent(...)`) — not by adding test paths to the allowlist.
- **The strict ratchet is blind to advisory-tsc regressions.** The strict job only checks migrated paths; the advisory `type-check` job runs plain `tsc` on the root config. Stage 2's initial landing went 0 → 102 errors on the advisory job because tightening `Record<string, unknown>` / `[k: string]: unknown` return types and index signatures in migrated core modules cascaded into unmigrated React/JSX callers that relied on implicit-any flow-through (ThemeCustomizer, CSVImportDialog, FilterBar, Month/WeekView, WorksCalendar.tsx, plus a handful of tests). Fixed in commit `cd18a03` by swapping `unknown` → `any` at public boundaries and adding generics on `applyFilters<T>` / `layoutOverlaps<T>` / `layoutSpans<T>` to preserve caller-supplied event types through to the output. **Rules for future stages:**
  1. Before commit, run *both* `npm run type-check:strict` *and* `npx tsc --noEmit -p tsconfig.json`. The strict ratchet alone is insufficient signal.
  2. Public functions consumed by unmigrated code: return types should use `Record<string, any>` (not `unknown`) and generic `<T>` parameters when they pass the input type through — e.g. `applyFilters<T>(items: T[]): T[]` instead of `applyFilters(items: FilterItem[]): FilterItem[]`.
  3. Index signatures on "-like" structural types: use `[k: string]: any` (not `unknown`) so the type satisfies structural compatibility with callers' canonical types.
  4. Sets holding string-literal values (`new Set([SCHEDULE_KINDS.SHIFT, ...])`) must be explicitly typed `new Set<string>([...])` — otherwise TS narrows to the literal union and `.has(someString)` fails TS2345.

**Stage 2 sizing outcome:** estimated 2–3 weeks. Actual: **same day as Stage 1** (one focused session), because the per-directory measurements from Stage 0 surfaced that most of the ~295 diagnostics were concentrated in ~10 files and most were mechanical (function parameter annotations). The estimate was calibrated against a world where strict-null-checks were also in scope; for `noImplicitAny` alone against measured counts, the effort was ~10× lower.

**Decision point outcome:** actual velocity ≫ estimate (well under 2× over — more like 10× under). Stages 3–6 continue as planned; no re-scoping required.

**Stage 3 confirms Stage 2's velocity pattern.** Stage 3 landed in ~2 days against a 2–3 week estimate, same 10× under-estimate ratio. Pattern suggests original sizing treated `noImplicitAny` and `strictNullChecks` as a bundle; for `noImplicitAny` alone, cost per diagnostic is ~0.5 minute when the diagnostics are mechanical parameter annotations.

---

### Stage 3 — Boundaries: `src/api/**`, `src/providers/**`, `src/hooks/**` — ✅ Completed 2026-04-21

**Why grouped:** these are the external-data seams. Real types here pay off the most for refactor safety.

**Rules:**
- Third-party untyped responses may use `any` or `unknown` at the boundary, with a wrapper function that types the rest of the flow.
- React hook return types must be explicit.

**What shipped:**
- Five commits landing the three directories across four sprints plus a follow-up:
  - `7c9622a` — sprint 2: simple hooks (`useGroupingRows`, `useEventOptions`, `useFeedEvents`, `useFetchEvents`, `useKeyboardShortcuts`, `useOwnerConfig`, `useSourceAggregator`, `useTouchSwipe`) + `src/api/**`.
  - `9e9fd04` / `799045a` — sprint 3: heavy hooks (`useDrag`, `useSavedViews`, `useSourceStore`) + review-comment follow-ups on source and saved-view shapes.
  - `c498f2a` — sprint 4: undo-test hardening + `useDrag` typing.
  - `9d5d918` — Stage 3b: remaining hooks (`useCalendar`, `useEventDraftState`, `useFeedStore`, `useFocusTrap`, `useOccurrences`, `usePermissions`, `useRealtimeEvents`, `useSyncedCalendar`, `useTouchDnd`) + `src/providers/**` + 7 free strict-clean hooks added to the allowlist.
  - Follow-up on `claude/typescript-migration-lessons-zSxnq` — explicit return types on the 14 hooks that had shipped with inferred returns.
- `MIGRATED_PATHS` now at 38 entries covering `src/api/`, `src/providers/`, and every non-test file under `src/hooks/`. Zero unmigrated hooks remain.
- Advisory `tsc -p tsconfig.json` green throughout — the Stage 2 "run both" rule held; no regressions to unmigrated UI/view callers.

**Exit criteria — met:**
- All listed directories in `MIGRATED_PATHS`. ✅
- `typecheck:strict` green across 38 paths. ✅
- `any` delta **+17** across `src/hooks/**` (+28 added, −11 removed in `useSavedViews`); `src/api/` +0; `src/providers/` +0. Total = 17, under 20-site budget. ✅

**Lessons learned:**
- **Inferred hook returns are a readable trap.** The initial 11-hook sprint (PR #266/#267) shipped without explicit return types; inference produced correct types in practice but obscured the public contract from readers and hid the rule violation until review. `React hook return types must be explicit` is now a pre-commit check item, not a style preference.
- **`Set<T>` setter types from `useState` need care.** `setConfigOpen` is a `Dispatch<SetStateAction<boolean>>`, not `(b: boolean) => void` — the latter would reject the functional-update form in consumer code. Typing useState setters in return-type manifests uses the React types directly.
- **Boundary-structural types compose.** `useSourceAggregator` passes its filtered feeds through `useFeedEvents` — declaring its own `feedErrors` type inline (rather than importing `FeedError` from `useFeedEvents`) kept the two hooks decoupled while still strict-clean.

**Sizing outcome:** estimated 2–3 weeks. Actual: ~2 days across Codex sprints + follow-up (including the extra cleanup pass). Ratio matches Stage 2's ~10× under-estimate for `noImplicitAny`-alone work.

---

### Stage 4 — DECISION POINT: continue into UI?

Before touching `src/ui/**` or `src/views/**`, evaluate:

- Actual cost per diagnostic in stages 2–3 (hours per 100 sites).
- Bug density correlation with typed vs. untyped code (did any stage 2/3 migration catch a real bug?).
- Team appetite for the JSX-heavy slice.

Two legitimate paths:

**Path A — continue.** Proceed to stage 5.

**Path B — stop here.** Declare "`noImplicitAny` on non-UI code" as the shipped state. Add a per-directory override in `tsconfig.json` so `src/ui/**` and `src/views/**` remain lax, and document the decision. This captures ~80% of the refactor-safety value.

This decision is explicitly on the plan to prevent the failure mode where scope expansion is assumed rather than chosen.

#### Stage 4 decision record (locked 2026-04-21)

- **Selected path: Path A (continue into Stage 5 UI migration).**
- Stage 5 execution order is locked to the sprint plan sequence:
  1. PR 4 — ConfigPanel (Simple Tabs)
  2. PR 5 — ConfigPanel (Data Tabs)
  3. PR 6 — ConfigPanel (Workflow Tabs)
  4. PR 7 — Small Views
  5. PR 8 — Medium Views
  6. PR 9 — TimelineView (isolated)
  7. PR 10 — WorksCalendar (Phase 1)
  8. PR 11 — WorksCalendar (Phase 2)
  9. PR 12 — Final Ratchet
- **Per-PR `any` budget (Stage 5):**
  - PR 4–8, PR 10: max **+4** each
  - PR 9: max **+6** (explicit complexity exception)
  - PR 11: max **+3**
  - PR 12: **0 net new `any`** (cleanup/ratchet only)
- Stage 5 cumulative cap is unchanged: **≤ 40 additional `any`**.

---

### Stage 5 — UI slice (conditional on Stage 4 → Path A)

**Scope:** `src/ui/**`, `src/views/**`, `WorksCalendar.tsx`, `demo/**`.

**Rules:**
- Typed event-handler helpers added to `src/types/**` first, if not already present.
- Component `props` interfaces must be exhaustive — no `[k: string]: any` fallbacks.
- Sub-split aggressively: expect one PR per ~3–5 view files.

**Exit criteria:**
- All listed paths added to `MIGRATED_PATHS` in `scripts/typecheck-strict.mjs`.
- `typecheck:strict` green.
- Running `any` count within budget (target: ≤ 40 additional in stage 5).

**Sizing:** 4–6 weeks.

**Status note (2026-04-21):**
- Stage 5 code-typing work has started, but Stage 5 is not complete under this
  roadmap until Stage 5 UI/view paths are added to `MIGRATED_PATHS` and pass
  the strict ratchet.

### Stage 5 PR checklist template (required in every PR description)

- **What was typed**
  - Files/components touched
  - New named types/interfaces introduced
- **What was intentionally left loose**
  - Exact location(s)
  - Why tightening is deferred
- **New `any` introduced**
  - Count delta (`+N / -N / net`)
  - Justification per site (or “none”)
  - Confirm within per-PR budget
- **Risk level**
  - Low / Medium / High with one-sentence rationale
- **Validation**
  - `npm run type-check:strict` result
  - Root advisory `tsc --noEmit` result
  - Tests run for touched scope

---

### Stage 6 — Flip the root config

**Goal:** collapse the migration infrastructure.

Tasks:
- Move `"noImplicitAny": true` into `tsconfig.json`.
- Delete `tsconfig.strict.json`, `scripts/typecheck-strict.mjs`, and `npm run type-check:strict`.
- Collapse the CI jobs back to one.

**Exit criteria:**
- Root `tsc` green with `noImplicitAny: true`.
- PR merged.

**Sizing:** half a day.

---

### Stage 7 — `strictNullChecks` epic (not in this roadmap)

Does not start until stage 6 is complete. Will get its own staged roadmap, sized against real measurements from the `noImplicitAny` work. Expected 2–4× the effort of stages 1–6 combined.

## Drift control

Once a path is in `MIGRATED_PATHS` (in `scripts/typecheck-strict.mjs`):

- CI blocks any PR that introduces `noImplicitAny` violations in that path.
- New files under that path must typecheck strict from day one.
- Reviewers should reject unexplained `any` additions.

This ratchet is what makes the staged approach safe: we don't have to finish to keep the gains.

## Sprint 3 definition

Minimum viable Sprint 3 = **stages 0, 1, 2.** Delivers:

- Working migration infrastructure.
- Strict `src/core/**` + pure engine-adjacent modules.
- Drift control in place for everything migrated.

**Size:** 3–4 weeks for one engineer focused.

Stages 3–6 are explicitly out of scope for Sprint 3. If stage 2 finishes faster than estimated, stage 3 is optional carry-over. Stages 5–6 are separate sprints.

## Measured per-directory counts

Counts are `tsc --noEmit` diagnostics under `noImplicitAny: true`, filtered to real implicit-any codes (TS7005/7006/7011/7018/7023/7031/7034/7053). Measured 2026-04-21.

| Directory | Stage | Implicit-any count | Notes |
|---|---|---|---|
| `src/types/**` | 1 | **0** | Already strict-clean. |
| `src/index.ts` | 1 | **0** | Already strict-clean. |
| `src/core/**` | 2 | 183 | Concentrated in legacy top-level files (`icalParser.ts`, `csvParser.ts`, `validator.ts`, `scheduleMutations.ts`, `layout.ts`). `src/core/{engine,approvals,availability,holds,pools,tenancy,workflow}/**` are **already strict-clean** — do not need migration. |
| `src/filters/**` | 2 | 54 | |
| `src/grouping/**` | 2 | 46 | |
| `src/export/**` | 2 | 10 | |
| `src/external/**` | 2 | 2 | |
| `src/api/**` | 3 | 4 | Almost free. |
| `src/providers/**` | 3 | **0** | Already strict-clean. |
| `src/hooks/**` | 3 | 295 | Top offender: `useDrag.ts` (34), `useSavedViews.ts` (29), `useSourceStore.ts` (24). |
| `src/ui/**` | 5 | 414 | Top offender: `ConfigPanel.tsx` (151). |
| `src/views/**` | 5 | 322 | Top offenders: `TimelineView.tsx` (73), `AssetsView.tsx` (58), `WeekView.tsx` (47), `MonthView.tsx` (38), `AgendaView.tsx` (33). |
| `WorksCalendar.tsx` | 5 | 113 | Single 2000+-line root component. |
| `demo/**` | 5 | **0** | Already strict-clean. |
| `src/**/__tests__/**` | — | 23 | Scattered; migrate alongside their subject module. |
| **Total** | — | **1,466** | |

### Notable findings

- **Stage 1 is free.** `src/types` and `src/index.ts` already pass `noImplicitAny`. Stage 1 is a pure ratchet flip — add them to `MIGRATED_PATHS` in `scripts/typecheck-strict.mjs`.
- **The newer engine code is already typed.** Everything in `src/core/` subdirectories (`engine`, `approvals`, `availability`, `holds`, `pools`, `tenancy`, `workflow`) — most of the work from the past ~6 months of PRs — is already strict-clean. Stage 2's 295 total sites are concentrated in the older top-level `src/core/*.ts` files.
- **Stage 3 total (299) is essentially `src/hooks/**`.** `src/api` and `src/providers` together contribute 4 sites.
- **`src/ui/ConfigPanel.tsx` (151) and `src/WorksCalendar.tsx` (113) together are ~18% of the whole repo's implicit-any surface.** Worth considering whether those two files get their own sub-stage inside stage 5.
- **Rough stage totals:** Stage 1 = 0, Stage 2 = 295, Stage 3 = 299, Stage 5 = 849. Sprint 3 target (stages 0–2) = **295 total sites** — well within the 3–4 week envelope, probably closer to 1.5–2 weeks.

## Running `any`-budget ledger

_Populated as stages complete._

| Stage | Added `any` count | Running total | Budget |
|---|---|---|---|
| 1 | 0 | 0 | 0 |
| 2 | +11 (production) | 11 | 20 |
| 3 | +17 (production) | 28 | 40 |
| 5 | _tbd_ | _tbd_ | 80 |

### Stage 2 `any` accounting (2026-04-21)

Measurement: count of `any` tokens matching `/:\s*any\b|:\s*any\[\]|<any>|\bas any\b|Record<string,\s*any>/` in each migrated directory, before Stage 2 (`2082cf9`) vs after (`HEAD` including fix commit `cd18a03`), restricted to non-test files.

| Directory | Before | After | Delta |
|---|---|---|---|
| `src/core/**` | 9 | 15 | **+6** |
| `src/external/**` | 0 | 0 | 0 |
| `src/export/**` | 0 | 0 | 0 |
| `src/grouping/**` | 1 | 2 | **+1** |
| `src/filters/**` | 31 | 35 | **+4** |
| **Total** | 41 | 52 | **+11** |

Most of the Stage 2 `any` additions — +6 in `core`, +1 in `grouping`, +4 in `filters` — are at the public-API seam with unmigrated UI/test callers: `Record<string, any>` return types (`parseICS`, `buildOpenShiftEvent`, `buildOpenShiftPatch`, `loadConfig`), `[k: string]: any` index signatures (`LayoutEvent`, `ThemeObject`, `Preset`), and `Record<string, any>` on `Accessor` / `FilterItem`. These are deliberate boundary-protection as described in the third "Lesson learned" above; they will be tightened back to `unknown` when the relevant UI slice migrates in Stage 5. The initial landing introduced +1; the fix commit `cd18a03` added +10 more after the advisory `tsc` regression surfaced which seams needed loosening.

Test files (`__tests__/**`) added `any` annotations on stub/helper callbacks (e.g. `(r: any) => r.emp?.role`) — not counted against the production budget, but worth tracking: ~10 added. These will be revisited when individual test modules are tightened in later stages (or never, if we accept stub events as an explicit escape-hatch pattern in tests).

### Stage 3 `any` accounting (2026-04-21)

Measurement: same regex as Stage 2, applied to `src/api/**`, `src/providers/**`, `src/hooks/*.ts` (non-test), before Stage 3 open (`88822d6`) vs after the follow-up return-type pass.

| Directory | Before | After | Delta |
|---|---|---|---|
| `src/api/**` | n/a | 0 | 0 |
| `src/providers/**` | 0 | 0 | 0 |
| `src/hooks/**` (migrated files) | 35 | 52 | **+17** |
| **Total** | 35 | 52 | **+17** |

Hook-side additions are concentrated where boundaries meet unmigrated callers:
- `useCalendar` (+5), `useEventDraftState` (+6), `useOccurrences` (+3), `useTouchDnd` (+5), `useFocusTrap` (+2), `useSourceAggregator` (+2), `useGroupingRows` (+3) — explicit boundary `any` on event/config/payload shapes that flow into unmigrated `src/views/**` or `WorksCalendar.tsx`, plus `Record<string, any>` fragments inside explicit hook return types.
- `useFeedEvents` (+1), `useFetchEvents` (+1) — `Record<string, any>` on feed/fetched events so downstream renderers can keep their ad-hoc fields without forcing narrowing.
- `useSavedViews` (−11) — net removal: old code had 18 `any` sites; the migration tightened most of them to `unknown` or concrete shapes while leaving `Record<string, any>` at the serialise/deserialise seam only.

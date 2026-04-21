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

**Side config, not root flip.** Root `tsconfig.json` stays as-is until stage 6. Migration is tracked in `tsconfig.strict.json`:

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noImplicitAny": true
  },
  "include": []
}
```

`include` grows one slice at a time. A new `npm run typecheck:strict` script runs `tsc -p tsconfig.strict.json`. CI runs the strict typecheck as a blocking job alongside the existing typecheck, so migrated directories cannot regress.

## Stages

### Stage 0 — Baseline & mechanism — ✅ Completed 2026-04-21

**Goal:** land the migration infrastructure with zero code changes.

Tasks:
- Add `tsconfig.strict.json` with empty `include`.
- Add `npm run typecheck:strict`.
- Wire `typecheck:strict` into CI as a blocking job.
- Run per-directory error counts under `noImplicitAny: true` and publish them in this doc's "Measured per-directory counts" section.

**What shipped:**
- `tsconfig.strict.json` extends root with `noImplicitAny: true`, anchored on `src/types/globals.d.ts` (TS requires at least one input; `.d.ts` anchor means Stage 0 enforces strict on a trivially-typed file only).
- `npm run type-check:strict` script.
- `type-check-strict` job in `.github/workflows/ci.yml` as a blocking check.
- Baseline per-directory measurements in the table below.

**Sizing:** ~1 day. Actual: ~1 day.

---

### Stage 1 — Types slice: `src/types/**` + `src/index.ts`

**Goal:** prove the pattern on the smallest possible slice.

**Exit criteria:**
- `src/types/**` and `src/index.ts` in `tsconfig.strict.json` include.
- Zero explicit `any` added.
- `typecheck:strict` green.
- Merged to `main`.

**Sizing:** 2–3 days. If this slice takes more than a week, the whole plan needs re-scoping.

---

### Stage 2 — Core & pure engine-adjacent

**Scope:** `src/core/**`, `src/filters/**`, `src/grouping/**`, `src/export/**`, `src/external/**`.

**Rules:**
- Real types preferred. Explicit `any` requires an adjacent `// any: <reason>` comment.
- Sub-split by directory if any directory exceeds ~150 diagnostics.
- Track the running count of explicit `any` sites in this doc.

**Exit criteria:**
- All listed directories in `tsconfig.strict.json` include.
- `typecheck:strict` green.
- Running `any` count within budget (target: ≤ 20 across stage 2 total).

**Sizing:** 2–3 weeks.

**Decision point at end of stage:** compare actual velocity to estimate. If ≥ 2× over, re-scope stages 3–6 before continuing.

---

### Stage 3 — Boundaries: `src/api/**`, `src/providers/**`, `src/hooks/**`

**Why grouped:** these are the external-data seams. Real types here pay off the most for refactor safety.

**Rules:**
- Third-party untyped responses may use `any` or `unknown` at the boundary, with a wrapper function that types the rest of the flow.
- React hook return types must be explicit.

**Exit criteria:**
- All listed directories in `tsconfig.strict.json` include.
- `typecheck:strict` green.
- Running `any` count within budget (target: ≤ 20 additional in stage 3).

**Sizing:** 2–3 weeks.

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

---

### Stage 5 — UI slice (conditional on Stage 4 → Path A)

**Scope:** `src/ui/**`, `src/views/**`, `WorksCalendar.tsx`, `demo/**`.

**Rules:**
- Typed event-handler helpers added to `src/types/**` first, if not already present.
- Component `props` interfaces must be exhaustive — no `[k: string]: any` fallbacks.
- Sub-split aggressively: expect one PR per ~3–5 view files.

**Exit criteria:**
- All listed paths in `tsconfig.strict.json` include.
- `typecheck:strict` green.
- Running `any` count within budget (target: ≤ 40 additional in stage 5).

**Sizing:** 4–6 weeks.

---

### Stage 6 — Flip the root config

**Goal:** collapse the migration infrastructure.

Tasks:
- Move `"noImplicitAny": true` into `tsconfig.json`.
- Delete `tsconfig.strict.json` and `npm run typecheck:strict`.
- Collapse the CI jobs back to one.

**Exit criteria:**
- Root `tsc` green with `noImplicitAny: true`.
- PR merged.

**Sizing:** half a day.

---

### Stage 7 — `strictNullChecks` epic (not in this roadmap)

Does not start until stage 6 is complete. Will get its own staged roadmap, sized against real measurements from the `noImplicitAny` work. Expected 2–4× the effort of stages 1–6 combined.

## Drift control

Once a directory is in `tsconfig.strict.json`:

- CI blocks any PR that introduces `noImplicitAny` violations in that directory.
- New files in that directory must typecheck strict from day one.
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

- **Stage 1 is free.** `src/types` and `src/index.ts` already pass `noImplicitAny`. Stage 1 is a pure infrastructure flip — add them to `tsconfig.strict.json`'s `files`/`include`.
- **The newer engine code is already typed.** Everything in `src/core/` subdirectories (`engine`, `approvals`, `availability`, `holds`, `pools`, `tenancy`, `workflow`) — most of the work from the past ~6 months of PRs — is already strict-clean. Stage 2's 295 total sites are concentrated in the older top-level `src/core/*.ts` files.
- **Stage 3 total (299) is essentially `src/hooks/**`.** `src/api` and `src/providers` together contribute 4 sites.
- **`src/ui/ConfigPanel.tsx` (151) and `src/WorksCalendar.tsx` (113) together are ~18% of the whole repo's implicit-any surface.** Worth considering whether those two files get their own sub-stage inside stage 5.
- **Rough stage totals:** Stage 1 = 0, Stage 2 = 295, Stage 3 = 299, Stage 5 = 849. Sprint 3 target (stages 0–2) = **295 total sites** — well within the 3–4 week envelope, probably closer to 1.5–2 weeks.

## Running `any`-budget ledger

_Populated as stages complete._

| Stage | Added `any` count | Running total | Budget |
|---|---|---|---|
| 1 | 0 | 0 | 0 |
| 2 | _tbd_ | _tbd_ | 20 |
| 3 | _tbd_ | _tbd_ | 40 |
| 5 | _tbd_ | _tbd_ | 80 |

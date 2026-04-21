# TypeScript Migration — Session Lessons (2026-04-21)

Retrospective on a Claude Code session that cleanly shipped PR #261 (test fixes) and then attempted a repo-wide `noImplicitAny` migration in the same session. The migration attempt was abandoned before landing. This doc captures what the session did well, where it went off the rails, and the playbook to use next time Sprint 3 is picked up.

## Phases of the session

### Phase A — PR/test cleanup (rating: 8/10)

- Landed a targeted test fix, with a correct explanation of why a `useMemo` placement affected `toThrow()` in the React component under test.
- Verified CI status after the push.
- Correctly identified stale review threads and resolved them.
- Moved through the PR flow in a reasonable order.

This phase reads like solid senior-engineer cleanup work.

### Phase B — `noImplicitAny` migration attempt (rating: 4/10)

- Measured the problem up front: ~6,639 TypeScript errors under `noImplicitAny`, narrowed to ~1,973 real implicit-any diagnostics after filtering out local module-resolution errors.
- Clustered the errors by area (core/engine vs UI) — correct instinct.
- Then chose a **repo-wide mechanical strategy**: annotate implicit anys with `: any` via bulk text transforms across the whole codebase.
- Once that produced syntax errors, the session shifted into repair-on-top-of-repair rather than resetting to a known-good checkpoint.
- The attempt never produced a green `tsc` pass and was not committed to this branch.

## What went well

- Measured before acting (error counts, by-file clustering).
- Separated local module errors from real implicit-any errors instead of treating the raw count as truth.
- Kept probing reality (running `tsc`) rather than declaring success.
- Caught that a subagent had likely reverted `tsconfig` mid-run.

## What went poorly

- **Scope was too wide for a single step.** A ~2k-diagnostic migration across mixed core + UI code is not a one-session task.
- **Bulk text transforms on TypeScript syntax are brittle.** Arrow-parameter regexes in particular do not survive contact with real code (destructuring, generics, default params, JSX in `.tsx`, etc.).
- **"Make implicit any explicit any everywhere" was treated as mechanically safe.** It is not: each edit is a syntactic change on typed code, and the aggregate blast radius is hundreds of files.
- **No small success boundary was locked down before mass editing.** There was no narrow `tsconfig` include, no per-directory slice, no per-batch commit cadence — so when things broke there was no green checkpoint to return to.

## Signal to watch for

The moment a session shifts from _reasoned software change_ to _bulk mutation plus damage control_ is the moment to stop, reset, and re-scope. In this session that transition happened immediately after the scope measurement — right when the scope measurement should have caused a re-plan.

## Playbook for the next attempt

1. **Dedicated branch.** Start Sprint 3 on its own branch off current `main`.
2. **Narrow the `tsconfig` surface, don't flip the whole repo.** Enable `noImplicitAny` against a narrow `include` set, or use a secondary `tsconfig.strict.json` that only covers the slice being migrated. Expand the include set slice by slice.
3. **Slice by directory, core-out.** Suggested order:
   1. `src/engine/**`, `src/core/**`, adapters, pure helpers.
   2. Hooks and filters.
   3. Then selected UI folders (`src/views/**`, `src/ui/**`) one at a time.
4. **Prefer real types over `: any`.** Reserve explicit `any` for a small, tracked list of edge cases (e.g. third-party untyped boundaries). Every `any` left behind should be recorded with a reason.
5. **No regex-based global rewrites for arrow params or destructured signatures.** Use `ts-morph` / the TypeScript compiler API, or hand-edit per file. If a transform can't be justified per-file, don't run it repo-wide.
6. **Run `tsc` after every small batch**, not at the end.
7. **Commit every stable green chunk.** The next attempt's recovery story is "reset to the last green commit," not "repair the repair."
8. **Only expand scope after one clean green slice has landed on `main`.**

## Recommended next step for this repo

This branch (`claude/typescript-migration-lessons-zSxnq`) captures the lessons and nothing else — the working tree matches `main`. When Sprint 3 is picked up, start fresh from `main` on a new branch, and apply the playbook above. Do not resume from the abandoned mass-annotation attempt.

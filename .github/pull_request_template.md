## Summary
Describe exactly what this PR changes.

## Scope
- Stage: 
- Planned PR number in sprint: 
- Target files/directories: 
- Why this slice is isolated: 

## Lessons Learned Check (REQUIRED)
Confirm these were actively used while building this PR:

- [ ] PR is intentionally small and isolated
- [ ] Boundary typing was prioritized over internal perfection
- [ ] No silent spread of `any`
- [ ] Advisory root `tsc` was used to catch integration issues
- [ ] I did not assume “looks typed” means “safe”
- [ ] I stopped and isolated typing cascades instead of expanding scope

## Definition of Done (ALL REQUIRED)
This PR is not done unless every box is checked.

- [ ] `npm run type-check:strict` passes
- [ ] Root advisory `tsc --noEmit` passes
- [ ] Tests pass for touched scope at minimum
- [ ] No uncontrolled increase in `any`
- [ ] All new types are intentional and named
- [ ] Public interfaces and exported functions are explicitly typed
- [ ] PR scope matches the sprint plan with no scope creep
- [ ] Any new `any` has an adjacent justification comment
- [ ] No file-wide `: any`
- [ ] No implicit `any` in exported functions

## What Was Typed
List exactly what was typed in this PR.

- 
- 
- 

## What Was Intentionally Left Loose
List anything intentionally not tightened yet.

- 
- 
- 

## `any` Ledger (REQUIRED)
- New `any` added: 
- Existing `any` removed: 
- Net change: 

For every new `any`, explain why it is required and why a safer type was not used yet.

1. 
2. 
3. 

## Boundary Notes
Document any public seams, caller-protection choices, or compatibility decisions.

- 
- 
- 

## Risk Level
- [ ] Low
- [ ] Medium
- [ ] High

Why:

## Validation Evidence
Paste the exact commands run and a short result summary.

```bash
npm run type-check:strict
npx tsc --noEmit -p tsconfig.json
```

Test commands run:

```bash
# paste commands here
```

## Stop Conditions Check
If any item below happened, explain how scope was reduced before merge.

- [ ] `any` started spreading across files
- [ ] Root `tsc` broke repeatedly
- [ ] Types required cross-module rewrites
- [ ] Scope was reduced to keep the PR reviewable

Notes:

## Reviewer Focus
What should reviewers look at first?

- 
- 
- 

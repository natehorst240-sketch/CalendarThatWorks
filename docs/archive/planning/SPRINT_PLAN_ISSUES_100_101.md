# Sprint Plan — Issues #100 & #101

**Sprint window:** 5 working days (1 week)
**Branch:** `claude/sprint-plan-issues-100-101-K250J`
**Scope:** Re-fix two reopened bugs whose first attempts (PR #108, PR #106) closed the surface symptom but missed the root cause.

---

## Goals

| # | Issue | Outcome |
|---|-------|---------|
| 1 | #100 — Saved view pencil/manage | Pencil reliably opens the editor for any saved view; user always sees the editor populate. |
| 2 | #101 — Employees not in live schedule | TeamTab edits flow into every calendar view that consumes employees; timeline add/remove writes back to config. |

Both issues must satisfy their stated acceptance criteria and ship with regression tests.

---

## Day 1 — Root-cause confirmation

**Owner:** 1 dev. **Output:** a one-page diagnosis pinned to each issue.

### Issue #100
- Reproduce in dev with 3+ saved views; confirm whether the editor mounts but is scrolled off-screen vs. silently no-ops.
- Inspect `SmartViewsTab` in `src/ui/ConfigPanel.jsx:165-254`. The `key={editingId ?? '__new__'}` remount path on `src/ui/ConfigPanel.jsx:242` is correct — so the prior PR fixed the *data* path. The remaining failure modes are UX:
  - Pencil click is a toggle (`src/ui/ConfigPanel.jsx:193`) — a stray double-click closes the editor with no feedback.
  - Editor renders below a long view list with no scroll-into-view or focus transfer; users believe nothing happened.
  - No active-row indicator beyond a CSS class.
- Verify `AdvancedFilterBuilder` reset effect at `src/ui/AdvancedFilterBuilder.jsx:121-130` actually re-hydrates when switching between two views (the eslint-disable comment is suspicious — re-test switching A → B → A).

### Issue #101
- Confirm `configuredEmployees` (`src/WorksCalendar.tsx:283-286`) is only consumed by `TimelineView` (`src/WorksCalendar.tsx:1499`). It is **not** spread into `sharedViewProps` (`src/WorksCalendar.tsx:1291`), so MonthView/WeekView/DayView/AgendaView never see TeamTab edits.
- Confirm `onEmployeeAdd` / `onEmployeeDelete` (props at `src/WorksCalendar.tsx:125-126`, threaded at `src/WorksCalendar.tsx:1500-1501`) are wired to the *parent* prop only — they do not call `ownerCfg.updateConfig`, so timeline → config is broken (no bidirectional sync).
- Check `useOwnerConfig.updateConfig` (`src/hooks/useOwnerConfig.js:47-54`) — it persists and notifies via `onConfigSave`, so config → state is fine. The gap is the bridge layer in WorksCalendar.

**Exit criteria for Day 1:** root causes posted to each issue with file/line citations.

---

## Day 2 — Issue #100 implementation

**Files:** `src/ui/ConfigPanel.jsx`, `src/ui/AdvancedFilterBuilder.jsx`, `src/ui/styles/configPanel.module.css` (or equivalent).

1. Replace toggle-on-pencil with explicit open semantics (`src/ui/ConfigPanel.jsx:193`):
   - Click pencil → always set `editingId = view.id`. Cancel/X in the builder closes it.
   - Add an "Editing: <name>" header inside the builder card with a Cancel button (already present at `src/ui/ConfigPanel.jsx:250`, just elevate it visually).
2. After `setEditingId`, scroll the builder into view and move focus to the view-name input (use a `ref` exposed from `AdvancedFilterBuilder`).
3. Highlight the active row distinctly (border + chevron); already CSS-classed at `src/ui/ConfigPanel.jsx:185` — extend visuals.
4. In `AdvancedFilterBuilder`, audit the `useEffect` on line 121: switch the dep array to `[editingId, initialName, initialConditions]` and remove the eslint-disable. Ensures A→B→A re-hydration cannot stale.

**Tests:**
- New unit test in `src/ui/__tests__/ConfigPanel.smartViews.test.jsx`:
  - Renders 3 saved views, clicks pencil on view #2, asserts builder shows view #2's name and conditions.
  - Switches to view #3, asserts builder re-hydrates.
  - Cancel returns to "create new" mode.
- E2E (Playwright if present, otherwise add to existing harness): open ConfigPanel → SmartViews → click pencil on the second-from-bottom view → assert builder is in viewport.

---

## Day 3 — Issue #101 implementation

**Files:** `src/WorksCalendar.tsx`, possibly `src/ui/ConfigPanel.jsx` (TeamTab).

1. **Fan out `configuredEmployees` to all views.** Add `employees: configuredEmployees` to `sharedViewProps` (`src/WorksCalendar.tsx:1291`). Verify each view component already accepts the prop; if not, thread it through as a no-op default.
2. **Wire timeline → config (bidirectional sync).** Wrap the parent `onEmployeeAdd` / `onEmployeeDelete` so they also patch `ownerCfg.config.team.members`:
   ```ts
   const handleEmployeeAddInternal = useCallback((member) => {
     ownerCfg.updateConfig(c => ({
       ...c,
       team: { ...(c.team ?? {}), members: [...(c.team?.members ?? []), member] },
     }));
     onEmployeeAdd?.(member);
   }, [ownerCfg.updateConfig, onEmployeeAdd]);
   ```
   Same shape for delete. Pass these to TimelineView instead of the raw props.
3. Replace the `configuredEmployees` fallback semantics: if the parent passes a non-empty `employees` prop, treat it as authoritative *and read-only* (skip the writeback path) to avoid clobbering parent-controlled state.
4. Confirm `members` array reference changes flow through — `updateConfig` already returns a new object, so the `useMemo` dep on `src/WorksCalendar.tsx:286` invalidates correctly.

**Tests:**
- Extend `src/__tests__/WorksCalendar.scheduleModel.integration.test.jsx`:
  - Mount WorksCalendar, open ConfigPanel, add a TeamTab member, assert it appears in TimelineView and MonthView (whichever views render people).
  - Trigger TimelineView's onEmployeeAdd, assert `ownerCfg.config.team.members` contains the new member after re-render.
  - Remove via TeamTab, assert it disappears from TimelineView.

---

## Day 4 — Cross-cutting validation

- Run full unit + integration suites; fix regressions.
- Manual QA matrix:

| Scenario | Expected |
|---|---|
| 0 saved views, click "+" pencil from new builder | Creates view |
| 5 saved views, pencil on each in turn | Editor re-hydrates each time, scrolls into view |
| Add employee in TeamTab, switch to schedule | Employee row visible in timeline |
| Remove employee in TeamTab while on schedule | Row disappears live |
| Add employee from TimelineView UI | TeamTab shows new member after reopen |
| Reload page | Both lists persist (config saved) |

- Bundle-size check (per `docs/bundle-size-audit.md` conventions) — both fixes should be net-zero.
- Update `docs/pr-106-followup-checklist.md` to mark items closed.

---

## Day 5 — Ship

- Open one PR per issue (clearer review than a combo PR):
  - PR A: "Fix #100: reliable Smart View edit UX"
  - PR B: "Fix #101: bidirectional TeamTab ↔ calendar employees sync"
- Each PR includes: root-cause writeup, before/after screenshots or short clip, test list.
- Request review; address comments; merge.
- Verify both issues auto-close on merge; re-open only if QA in main fails.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Spreading `employees` into `sharedViewProps` collides with existing per-view defaults | Search each view for `employees` usage first; default to existing prop if already wired. |
| `updateConfig` writeback from timeline causes infinite render loop | `updateConfig` is stable via `useCallback`; wrap timeline handler in `useCallback` and dep on `updateConfig` only. |
| `AdvancedFilterBuilder` dep-array change causes unwanted resets while typing | Use the `editingId`-only effect for hydration and a separate save handler — do not couple typing state to props. |
| Parent apps already pass `employees`; behavior change surprises them | Preserve existing semantics: parent prop wins; only TeamTab path is additive. Document in `docs/Roadmap.md`. |

---

## Done = all of:
1. Issue #100 acceptance criteria met, regression tests added, PR merged.
2. Issue #101 acceptance criteria met (bidirectional sync verified), regression tests added, PR merged.
3. Both issues closed and not reopened within 48h.

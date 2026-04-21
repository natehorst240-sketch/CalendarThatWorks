> **Status: COMPLETE** — Issue #98 closed 2026-04-16. All wiring shipped.

# PR 106 follow-up checklist for issue #98

This branch exists to track the remaining wiring work after PR #106.

## Still required

### 1. `src/ui/ConfigPanel.jsx`
- Change `SetupTab` to read/write live config keys:
  - `config.title`
  - `config.setup.preferredTheme`
- Stop writing setup-only `wizardData`.
- Change `TeamTab` to read/write:
  - `config.team.members`
  - `config.setup.completed = true`

### 2. `src/ui/SetupWizardModal.jsx`
- Change `handleFinish()` to save:
  - `title`
  - `setup: { preferredTheme, completed: true }`
  - `team: { members }`
- Stop saving `wizardData` and `setupCompleted`.

### 3. `src/WorksCalendar.tsx`
- Add `effectiveTheme = ownerCfg.config?.setup?.preferredTheme || theme || 'light'`
- Use `data-wc-theme={effectiveTheme}`
- Add `calendarTitle = ownerCfg.config?.title || 'My WorksCalendar'`
- Render the calendar title in the toolbar
- Add `configuredEmployees` fallback from `ownerCfg.config?.team?.members`
- Use `configuredEmployees` in timeline/schedule
- Update employee lookup callbacks to use `configuredEmployees`

### 4. `src/WorksCalendar.module.css`
- Wire live calendar CSS to theme token vars:
  - `font-size: var(--wc-base-font-size, 14px)`
  - `border: var(--wc-border-width, 1px) solid var(--wc-border)`
  - density-aware padding via `var(--wc-density, 1)`
  - `.calendarTitle` style
  - border width vars on grouped controls/buttons

## Why this PR exists
PR #106 merged the schema + migration layer only. The actual live wiring is still incomplete.

## Success criteria
- Setup tab updates the real live calendar
- Calendar title updates visibly
- Theme selection updates the live UI
- Team members added in settings populate schedule/timeline
- Theme controls affect the full calendar, not just preview
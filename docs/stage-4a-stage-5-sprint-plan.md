# Stage 4a + Stage 5 TypeScript Strict Migration Plan

## Purpose
This document defines the PR-by-PR execution plan to complete Stage 4a (decision + prep) and Stage 5 (UI strict migration).

This plan MUST be followed strictly. The goal is controlled, measurable progress — not speed.

---

## 🔁 Lessons Learned (DO NOT SKIP)
From the earlier TypeScript migration work:

- Small PRs win. Large PRs hide problems.
- Boundary typing matters more than internal perfection.
- `any` spreads silently — every PR must reduce or isolate it.
- Advisory root `tsc` catches integration issues early.
- “Looks typed” is not the same as “is safe.”

### Hard Rules
- No file-wide `: any`
- No implicit `any` in exported functions
- No new `any` without justification comment
- Do NOT “fix everything” in one PR
- If typing cascades → STOP and isolate

---

## ✅ Definition of Done (STRICT)
A PR is NOT done unless ALL are true:

1. `npm run type-check:strict` passes
2. Root advisory `tsc --noEmit` passes
3. Tests pass (touched scope minimum)
4. No increase in uncontrolled `any`
5. All new types are intentional and named
6. Public interfaces are explicitly typed
7. PR scope matches plan (no scope creep)

If ANY of these fail → PR is NOT DONE.

---

## 🧱 Stage 4a — Decision + Prep

### PR 1 — Stage 4 Decision
- Lock Path A
- Document Stage 5 order
- Define per-PR `any` budget
- Add checklist to migration doc

**Status:** ✅ Completed (2026-04-21)

**Decision recorded in `docs/TypeScriptStrictMigration.md`:**
- **Path A is locked** for this roadmap (continue into Stage 5).
- Stage 5 PR order is fixed as PRs 4 → 12 below.
- Stage 5 per-PR `any` budget is fixed to keep ratchet pressure:
  - PR 4–8, 10: max **+4** each
  - PR 9 (TimelineView isolated): max **+6**
  - PR 11 (WorksCalendar phase 2): max **+3**
  - PR 12 (final ratchet): **0 net new `any`** (cleanup only)
- Stage-level cap remains ≤ 40 additional `any` sites.

### PR 2 — Shared UI Types
- Event handler types
- Shared props
- UI data shapes
- Loose but intentional boundary types

### PR 3 — ConfigPanel Seam
- Create `ConfigPanelProps`
- Type top-level state
- Extract sub-component prop types
- REMOVE file-level `any`

---

## 🚀 Stage 5 — UI Migration

### PR 4 — ConfigPanel (Simple Tabs)
- SetupTab
- HoverCardTab
- DisplayTab
- AccessTab

Goal: Easy wins, stabilize patterns

---

### PR 5 — ConfigPanel (Data Tabs)
- EventFieldsTab
- CategoriesTab
- AssetsTab
- TemplateTab

Goal: Structured data typing

---

### PR 6 — ConfigPanel (Workflow Tabs)
- TeamTab
- ApprovalsTab
- RequestFormTab
- ConflictsTab
- SmartViewsTab

Goal: Handle complex state + flows

---

### PR 7 — Small Views
- DayView
- AgendaView
- MonthView

Goal: Low-risk view typing

---

### PR 8 — Medium Views
- WeekView
- AssetsView
- BaseGanttView

Goal: Layout + shared logic typing

---

### PR 9 — TimelineView (ISOLATED)
- TimelineView.tsx ONLY

Goal: Contain complexity

---

### PR 10 — WorksCalendar (Phase 1)
- Top-level state
- Core callbacks
- Shared props

Goal: Stabilize root without over-tightening

---

### PR 11 — WorksCalendar (Phase 2)
- Tighten handlers
- Remove temp `any`
- Finalize public interfaces

---

### PR 12 — Final Ratchet
- Add all Stage 5 paths to MIGRATED_PATHS
- Clean demo/**
- Update migration doc
- Confirm full strict pass

---

## 🔍 Per-PR Checklist
Every PR must include:

- What was typed
- What was intentionally left loose
- Any new `any` + reason
- Risk level (Low / Medium / High)

---

## ⚠️ Stop Conditions
STOP and regroup if:

- `any` starts spreading across files
- Root `tsc` breaks repeatedly
- Types require cross-module rewrites

---

## 🎯 End State
- All Stage 5 UI paths strictly typed
- No implicit `any`
- Controlled boundary looseness only
- Stable root build

---

This is a discipline exercise, not just a migration.

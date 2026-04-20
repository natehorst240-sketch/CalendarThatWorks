# Issues #192-#198 One-Sprint Delivery Plan

**Created:** 2026-04-20  
**Sprint Length:** 1 week (5 working days)  
**Decision:** Yes — these are small enough to batch into one focused quality/UX sprint.

## Scope from Open Issues

1. **#198** Assets tab status buckets should show `Assigned`, `Available`, or `Requested` based on assignment state.
2. **#197** Base view should include a configurable `Needs` column showing what asset is needed and when/where.
3. **#196** Asset creation form should require Registration Number, Type, Make, Model, with optional limitations.
4. **#195** Employee creation form should include name, phone number, assigned role, and location.
5. **#193** Week view event titles of 1 hour or shorter are cut off.
6. **#192** In schedules tab, locations with no assignments can make location filter controls disappear (user gets trapped in filtered view).

> Note: #194 does not appear in the visible list from the screenshot; this plan intentionally covers the visible high-priority UX bugs and data-entry gaps.

---

## Sprint Goal

Ship a **"Data Quality + Scheduling UX Stability"** sprint that removes user-blocking form gaps and high-friction schedule-view bugs while keeping risk low via tightly scoped UI/state changes.

---

## Delivery Strategy

### Track A — Data Model and Form Completeness (Issues #195, #196, #197)

These should be implemented first because they define/validate required fields that downstream views depend on.

#### A1. Employee required fields (#195)
- Add/verify required schema for:
  - `name`
  - `phoneNumber`
  - `role` (assigned role)
  - `location`
- Update employee create/edit form validation and inline error messaging.
- Ensure existing records missing these fields degrade gracefully (migration-safe fallback in UI).

**Acceptance criteria**
- Cannot save a new employee without required fields.
- Validation errors are field-specific and accessible.
- Existing datasets still render with no runtime errors.

#### A2. Asset required fields + optional limitations (#196)
- Add required schema/validation for:
  - `registrationNumber`
  - `type`
  - `make`
  - `model`
- Add optional `limitations` field (text or tag-list depending on current form architecture).

**Acceptance criteria**
- Cannot save a new asset without required fields.
- `limitations` is optional and persisted when entered.
- Existing assets continue to render unchanged.

#### A3. Configurable `Needs` column in base view (#197)
- Add a togglable/configurable column in base view for asset demand context:
  - what asset is needed
  - when needed
  - where needed
- Keep this column opt-in (or controlled by existing column config) to avoid layout regressions.

**Acceptance criteria**
- Column can be enabled/disabled through existing config pattern.
- Displays meaningful fallback when need details are missing.
- No horizontal overflow regressions at common breakpoints.

---

### Track B — Scheduling and View UX Fixes (Issues #192, #193, #198)

#### B1. Asset status segmentation in Assets tab (#198)
- Derive status from assignment/request state with deterministic precedence:
  1. `Assigned` if actively assigned in current schedule window.
  2. `Requested` if requested/pending and not assigned.
  3. `Available` otherwise.
- Ensure tabs/filters reflect derived status consistently.

**Acceptance criteria**
- No asset appears in multiple conflicting buckets.
- Status updates immediately after assignment/request changes.
- Empty-state messaging is clear for each status bucket.

#### B2. Week view title cutoff for short events (#193)
- Improve rendering for 1-hour (and shorter) event cards in week view:
  - text truncation handling (`line-clamp`/ellipsis)
  - min height/inner padding adjustments
  - tooltip/title fallback if full text cannot fit

**Acceptance criteria**
- 60-minute events show readable titles.
- Sub-hour events preserve legibility and do not overlap adjacent UI.
- No regressions for multi-hour event card layout.

#### B3. Location filter trap fix in schedules tab (#192)
- Prevent location filter control disappearance when selected location has zero assigned items.
- Keep filter controls visible and allow user recovery actions:
  - clear filter
  - select a different location
- Add guard for no-results state that never hides primary filter UI.

**Acceptance criteria**
- User can always clear or change filters even in empty states.
- Filter controls remain mounted/visible when result set is empty.
- Repro steps from issue no longer trap navigation.

---

## Proposed Sprint Timeline (5 Days)

### Day 1
- Implement #195 and #196 form/schema requirements.
- Add focused unit tests for validation logic.

### Day 2
- Implement #197 configurable `Needs` column.
- Add base view rendering tests.

### Day 3
- Implement #198 status derivation + assets tab mapping.
- Add tests for precedence and bucket consistency.

### Day 4
- Implement #193 week view short-event title fix.
- Implement #192 filter trap fix and empty-state safeguards.

### Day 5
- Regression pass across schedule, week, assets, and forms.
- QA checklist + release notes + issue-by-issue demo capture.

---

## QA Checklist (Definition of Done)

- [ ] All six issues have reproducible before/after verification notes.
- [ ] Form-required field tests pass (#195, #196).
- [ ] Status derivation tests pass (#198).
- [ ] Week-view visual behavior validated for 30/60/90-minute events (#193).
- [ ] Filter controls remain visible in zero-result location scenarios (#192).
- [ ] Base view `Needs` column can be toggled and displays correctly (#197).
- [ ] Full test suite passes.
- [ ] Docs/release notes updated.

---

## Risk and Mitigation

- **Risk:** Hidden coupling between data-entry schemas and existing sample/demo data.  
  **Mitigation:** Add migration-safe defaults and avoid hard crashes for partial legacy objects.

- **Risk:** Week view CSS fixes may affect dense layouts.  
  **Mitigation:** Add narrow-width and high-density visual checks before merge.

- **Risk:** Status derivation ambiguity in overlapping request/assignment states.  
  **Mitigation:** Enforce and test explicit precedence (`Assigned > Requested > Available`).

---

## Recommendation

Proceed as a **single sprint** with a strict order: **forms first, then derived-status/view fixes, then UX bug polish**. This keeps dependency flow clean and should comfortably fit a 1-week sprint if each issue is kept to scoped acceptance criteria above.

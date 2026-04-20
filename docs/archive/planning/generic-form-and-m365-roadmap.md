# Generic External Form + Microsoft 365 Example Roadmap (PR #2 Follow-up)

This roadmap has clear product value and improves adoption:

## Why this has value

- A generic `CalendarExternalForm` decouples submission UX from storage/backend choices.
- Keeping Microsoft 365 in `examples/microsoft-365/` preserves core-library neutrality.
- The adapter example demonstrates enterprise interoperability without forcing an opinionated auth stack into the library.
- The same generic form pattern makes future integrations (Google, custom APIs, Airtable, etc.) low-friction.

## Recommended execution order

1. Land the generic `CalendarExternalForm` API first (reusable props + validation contracts).
2. Add Microsoft 365 as an example adapter (MSAL + Graph) that consumes the same form contract.
3. Expand docs/examples to frame Microsoft 365 as one integration among many.
4. Harden with form-focused Playwright tests and explicit failure isolation paths.

## Phase 1 (started): Generic `CalendarExternalForm` contract hardening

### Completed in this kickoff

- Adapter runtime contract now fails fast when `submitEvent(payload, context)` is missing.
- Field-schema normalization now guarantees:
  - unique field names,
  - supported field types,
  - default labels/required/options for consistent rendering.
- Added tests for contract failures (missing adapter method + duplicate field names).
- Exported supported field-type constant so host apps can validate/compose schemas before render.

### Remaining in Phase 1

- Add a Playwright external-form smoke suite in demo/examples.
- Add one more non-Microsoft adapter example beyond localStorage (Supabase stub).

## Acceptance criteria for PR #2

- Generic form can submit through a backend-agnostic adapter interface.
- At least one non-Microsoft example (`localStorage` or Supabase stub) validates the generic shape.
- Microsoft 365 example is self-contained under `examples/microsoft-365/` and does not leak dependencies into the core package.
- README has dedicated sections for:
  - DataAdapter / backend-agnostic usage
  - External form workflows
  - Microsoft 365 example linkage
- Playwright coverage includes successful submit, validation errors, and adapter/network failures.


## Phase 4 (started): Form-focused E2E hardening + failure isolation

### Kickoff completed (April 13, 2026)

- Added Playwright E2E coverage for `CalendarExternalForm` fixture flows:
  - successful submit through adapter,
  - required-field validation blocking submission,
  - adapter/network failure surfacing with recovery path verification.
- Added a dedicated demo fixture (`demo/external-form-fixture.html`) to isolate external-form behavior from the full calendar UI.
- Confirmed failure isolation path: adapter errors stay local to form submission UX and do not crash subsequent submissions.

### Remaining in Phase 4

- Add one CI-targeted Playwright shard that always includes the external-form suite.
- Expand the fixture to include one Microsoft 365-adapter mock path for auth-token failure messaging.

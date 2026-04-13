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

## Acceptance criteria for PR #2

- Generic form can submit through a backend-agnostic adapter interface.
- At least one non-Microsoft example (`localStorage` or Supabase stub) validates the generic shape.
- Microsoft 365 example is self-contained under `examples/microsoft-365/` and does not leak dependencies into the core package.
- README has dedicated sections for:
  - DataAdapter / backend-agnostic usage
  - External form workflows
  - Microsoft 365 example linkage
- Playwright coverage includes successful submit, validation errors, and adapter/network failures.

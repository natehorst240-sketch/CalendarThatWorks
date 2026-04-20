# WorksCalendar Roadmap

_Last updated: 2026-04-20_

## Next release targets

1. **Workflow DSL — Phase 2 (#219)**
   - Visual `WorkflowBuilder` editor in ConfigPanel.
   - Drag-drop canvas, node inspector, JSON import/export.
   - Stacks on Phase 1 without breaking persisted instances.
2. **Adapter expansion**
   - Harden local adapter examples into package-ready presets.
   - Add first-party integration path for Microsoft 365 data sync.
3. **Scheduling depth**
   - Expand schedule templates and shift rule ergonomics.
   - Improve manager workflows for handoff/coverage edits.
4. **Developer experience**
   - Provide copy-paste starter snippets per major use case.
   - Add stricter package-level publish checks.
5. **Quality and trust**
   - Keep release notes current per tag.
   - Continue visual QA and example parity checks.

## Future / exploratory

_Items parked until the core engine API stabilizes. Not scheduled._

### Multi-framework support (Vue + Angular)

Goal: make WorksCalendar usable outside React without forking the codebase.
Deferred because the engine and public API are still evolving; locking down a
framework-agnostic contract now would slow iteration.

Prerequisites before this work can start:

- Core engine (`src/core/engine/`) API considered stable enough to version.
- Public `src/api/v1/` surface reviewed for leaks from the React layer.
- Visual regression baseline (Playwright screenshots) in place for the React
  views so adapter work can be validated against known-good output.

High-level approach when picked up:

1. Extract `@workscalendar/core` as a standalone published package containing
   the engine, sync managers, and adapters. React package consumes it.
2. Build `@workscalendar/vue` adapter first (cheapest port, composables map
   cleanly to the subscribe/dispatch pattern).
3. Build `@workscalendar/angular` adapter second (unlocks enterprise; adds
   DI and RxJS wrapping overhead).
4. Svelte deferred further — revisit if community demand or a paying
   customer surfaces.

Rough effort estimate (for planning only): ~3 weeks Vue, ~4–5 weeks Angular,
single engineer. Biggest risk is React feature velocity dropping during the
core extraction phase.

## Triaging and issue labels

Recommended issue labels:

- `type:bug`
- `type:feature`
- `type:docs`
- `area:filters`
- `area:scheduling`
- `area:data-adapters`
- `good-first-issue`
- `needs-repro`
- `blocked`

## Definition of ready for release

- Package metadata matches npm best practices.
- README, docs index, and runnable examples stay aligned.
- Known roadmap priorities are publicly visible and date-stamped.

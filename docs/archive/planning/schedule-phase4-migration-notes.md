> **Status: HISTORICAL** — Phase 4 shipped. Retained for reference only.

# Schedule Templates Phase 4 — Migration Notes

Phase 4 introduces optional operational hardening APIs for Add Schedule flows.

## New props

### `scheduleInstantiationLimits`
Optional guardrails for large generated sets:

- `previewMax` (default `200`): blocks preview expansion beyond this count.
- `createMax` (default `200`): blocks instantiate requests beyond this count.

```jsx
<WorksCalendar
  scheduleTemplates={templates}
  scheduleInstantiationLimits={{ previewMax: 100, createMax: 100 }}
/>
```

### `onScheduleTemplateAnalytics`
Optional callback to observe Add Schedule usage and failure reasons.

Emitted events:

- `schedule_dialog_opened`
- `schedule_preview_built`
- `schedule_preview_failed`
- `schedule_instantiate_succeeded`
- `schedule_instantiate_failed`

```jsx
<WorksCalendar
  onScheduleTemplateAnalytics={(evt) => {
    analytics.track('calendar.schedule', evt);
  }}
/>
```

## Backward compatibility

- Existing Add Schedule integrations continue to work without changes.
- If new props are omitted, defaults are applied and no analytics are emitted.

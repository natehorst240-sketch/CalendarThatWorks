# Setup Wizard

The Setup Wizard is a first-time onboarding modal for calendar owners.

## Behavior

- Opens automatically once for owners when `setupCompleted` is missing/false.
- Can be reopened manually from the toolbar (magic-wand button).
- Persists setup state through owner config.

## What it configures

1. **Theme selection**
2. **Team setup** (members/profile metadata)
3. **Categories** for event taxonomy
4. **Starter smart views** using advanced filter logic

## Typical flow

1. Render `WorksCalendar` with a stable `calendarId`.
2. Give the owner the `role="admin"` prop (default) so config + the wizard are
   editable. The host app decides who is an admin — `WorksCalendar` is a
   presentation layer and trusts whatever auth (OAuth, SAML, session cookies,
   etc.) the host already uses.
3. Complete wizard once; config persists under that `calendarId`.

```jsx
<WorksCalendar
  calendarId="team-alpha"
  role={currentUser.isAdmin ? 'admin' : 'user'}
  events={events}
  onEventSave={saveEvent}
/>
```

## Tips

- Seed a few categories/resources before onboarding demos.
- Pair wizard onboarding with saved-view defaults for new teams.
- Track setup completion in your own backend if you don't want to rely on
  `localStorage` — toggle `showSetupLanding` based on that state.

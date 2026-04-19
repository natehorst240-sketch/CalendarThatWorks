# Microsoft 365 setup

How to wire a `tokenProvider` that works with Microsoft Graph so `CalendarExternalForm` (paired with the `createMicrosoft365Adapter` in `examples/microsoft-365/`) can create events on the signed-in user's Outlook calendar.

WorksCalendar stays auth-provider neutral: you own the Azure AD app registration and the token. This guide covers the minimum viable setup for a hobbyist, small-business app, or internal tool.

## What you'll end up with

- An Azure AD (Entra ID) app registration with an SPA redirect URI
- A browser-side `tokenProvider()` backed by MSAL
- The existing `createMicrosoft365Adapter` writing events via Graph

Estimated time: **15–25 minutes** the first time.

## 1. Register the application

1. Go to https://entra.microsoft.com → **Applications → App registrations → New registration**.
2. Name: anything (e.g. `WorksCalendar Dev`).
3. Supported account types:
   - **Single tenant** if only users in your Microsoft 365 tenant will sign in.
   - **Multitenant** for any work/school account.
   - **Multitenant + personal Microsoft accounts** if you also want outlook.com / hotmail.com users.
4. **Redirect URI**: platform **Single-page application (SPA)**. Add:
   - `http://localhost:5173` (Vite dev)
   - your production origin, e.g. `https://app.example.com`
5. Register. Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.

Do **not** create a client secret for a browser-only SPA — MSAL uses PKCE and no secret is required.

## 2. Add Graph API permissions

1. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
2. Add the minimum you need:
   - Create events on the signed-in user's calendar: `Calendars.ReadWrite`
   - Read-only: `Calendars.Read`
   - Always included automatically: `User.Read`, `openid`, `profile`, `offline_access`
3. Click **Grant admin consent** for your tenant (single-tenant apps in a tenant you administer). Multitenant apps rely on each user or admin consenting at sign-in.

## 3. Environment variables

```bash
# .env
VITE_MSAL_CLIENT_ID=00000000-0000-0000-0000-000000000000
VITE_MSAL_TENANT_ID=common   # or your tenant GUID, or "organizations", or "consumers"
```

`authority` values:

| Audience | Authority |
| --- | --- |
| Single tenant | `https://login.microsoftonline.com/<tenant-id>` |
| Any work or school account | `https://login.microsoftonline.com/organizations` |
| Personal Microsoft accounts | `https://login.microsoftonline.com/consumers` |
| Both | `https://login.microsoftonline.com/common` |

## 4. Install MSAL

Optional peer deps — WorksCalendar does not bundle them.

```bash
npm install @azure/msal-browser @azure/msal-react
```

## 5. Minimum token provider (React + MSAL)

```jsx
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';
import { MsalProvider, useMsal } from '@azure/msal-react';

const SCOPES = ['Calendars.ReadWrite'];

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
});

export function MicrosoftTokenProvider({ children }) {
  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}

export function useMicrosoftTokenProvider() {
  const { instance, accounts } = useMsal();

  return async function tokenProvider() {
    const account = accounts[0] ?? (await instance.loginPopup({ scopes: SCOPES })).account;
    try {
      const result = await instance.acquireTokenSilent({ account, scopes: SCOPES });
      return result.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const result = await instance.acquireTokenPopup({ scopes: SCOPES });
        return result.accessToken;
      }
      throw err;
    }
  };
}
```

## 6. Wire it to the existing adapter

```jsx
import { CalendarExternalForm } from 'works-calendar';
import { createMicrosoft365Adapter } from '../../examples/microsoft-365/microsoft365Adapter';
import {
  MicrosoftTokenProvider,
  useMicrosoftTokenProvider,
} from './MicrosoftTokenProvider';

function BookingForm() {
  const tokenProvider = useMicrosoftTokenProvider();
  const adapter = createMicrosoft365Adapter({ tokenProvider });
  return <CalendarExternalForm adapter={adapter} />;
}

export default function App() {
  return (
    <MicrosoftTokenProvider>
      <BookingForm />
    </MicrosoftTokenProvider>
  );
}
```

## 7. Going to production

- Multitenant apps: publish your app, set a privacy statement and terms of use URL, and expect admin consent prompts for tenants that restrict user consent.
- Add your production origin to **Authentication → Single-page application** redirect URIs before deploying.
- Narrow the scopes to exactly what the feature needs — `Calendars.ReadWrite` is enough for the external form.
- For background sync, delta queries, or service-to-service access, move the token exchange to a backend using the confidential client flow. The browser cannot safely hold a client secret.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `AADSTS50011: redirect URI mismatch` | Origin not added as SPA redirect URI |
| `AADSTS65001: consent required` | Admin consent not granted; call `loginPopup` or have an admin consent |
| `AADSTS700016: application not found` | Wrong client ID, or single-tenant app signed into a different tenant |
| `InteractionRequiredAuthError` on refresh | Expected — fall back to `acquireTokenPopup` |
| `403 ErrorAccessDenied` from Graph | Missing `Calendars.ReadWrite` scope or not consented |
| Works locally, fails in prod | Production origin missing from SPA redirect URIs |

## See also

- [DataAdapter pattern](./DataAdapter.md)
- [Google Calendar setup](./GoogleCalendarSetup.md)
- [Microsoft 365 example adapter](../examples/microsoft-365/README.md)

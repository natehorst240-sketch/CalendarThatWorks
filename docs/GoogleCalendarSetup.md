# Google Calendar setup

How to wire a `tokenProvider` that works with Google Calendar so `CalendarExternalForm` (or a custom Google adapter) can read/write events on the signed-in user's calendar.

WorksCalendar stays auth-provider neutral: you own the OAuth client, you own the token. This guide walks through the minimum viable setup for a hobbyist or small-business app.

## What you'll end up with

- A Google Cloud OAuth 2.0 Web client ID
- A browser-side `tokenProvider()` that returns a valid access token
- An adapter that posts events to `https://www.googleapis.com/calendar/v3`

Estimated time: **15–25 minutes** the first time.

## 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/ and create (or pick) a project.
2. In **APIs & Services → Library**, enable **Google Calendar API**.

## 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (unless you're on Google Workspace and only need internal users).
3. Fill in app name, support email, and developer contact. App logo and homepage are optional for testing.
4. **Scopes**: add the minimum you need.
   - Read + write events: `https://www.googleapis.com/auth/calendar.events`
   - Read-only: `https://www.googleapis.com/auth/calendar.readonly`
5. **Test users**: add your own Google account while the app is in `Testing` mode. You do not need to submit for verification unless you request sensitive scopes or go to production with external users.

## 3. Create the OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins**:
   - `http://localhost:5173` (Vite dev)
   - your production origin, e.g. `https://app.example.com`
4. **Authorized redirect URIs**: only required if you use a redirect-based flow. For the recommended implicit/PKCE flow via Google Identity Services, origins are enough.
5. Copy the **Client ID**. You will not need the client secret for a browser-only flow — leave it unused.

Store the client ID in an env var:

```bash
# .env
VITE_GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

## 4. Install the peer dependency

Pick one. Both are optional — WorksCalendar does not bundle either.

```bash
# Option A: Google Identity Services via @react-oauth/google (simplest)
npm install @react-oauth/google

# Option B: raw gapi / GIS scripts if you need full control
```

## 5. Minimum token provider (React + @react-oauth/google)

```jsx
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { useRef } from 'react';

const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

export function GoogleTokenProvider({ children }) {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  );
}

export function useGoogleTokenProvider() {
  const tokenRef = useRef(null);

  const login = useGoogleLogin({
    scope: SCOPES,
    onSuccess: (res) => {
      tokenRef.current = {
        accessToken: res.access_token,
        expiresAt: Date.now() + res.expires_in * 1000,
      };
    },
  });

  return async function tokenProvider() {
    const cached = tokenRef.current;
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      return cached.accessToken;
    }
    await new Promise((resolve, reject) => {
      login({ onSuccess: resolve, onError: reject });
    });
    return tokenRef.current.accessToken;
  };
}
```

Browser access tokens from GIS are short-lived (~1 hour) and there is no refresh token in the implicit flow. That is fine for interactive apps — re-prompt or silent-refresh on demand. If you need long-lived offline access, run the OAuth code flow on a backend.

## 6. Minimal Google Calendar adapter

Mirror the pattern from `examples/microsoft-365/microsoft365Adapter.js`:

```js
export function createGoogleCalendarAdapter({ tokenProvider, calendarId = 'primary' }) {
  if (typeof tokenProvider !== 'function') {
    throw new Error('tokenProvider is required for Google Calendar adapter.');
  }

  return {
    async submitEvent(payload) {
      const token = await tokenProvider();
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(toGoogleEvent(payload)),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Google Calendar submit failed (${response.status}): ${text || 'unknown error'}`);
      }

      return response.json();
    },
  };
}

function toGoogleEvent(payload) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    summary: payload.title,
    description: payload.description,
    location: payload.location,
    start: { dateTime: new Date(payload.start).toISOString(), timeZone },
    end: { dateTime: new Date(payload.end).toISOString(), timeZone },
  };
}
```

Wire it into the form:

```jsx
import { CalendarExternalForm } from 'works-calendar';
import { createGoogleCalendarAdapter } from './googleCalendarAdapter';
import { GoogleTokenProvider, useGoogleTokenProvider } from './GoogleTokenProvider';

function BookingForm() {
  const tokenProvider = useGoogleTokenProvider();
  const adapter = createGoogleCalendarAdapter({ tokenProvider });
  return <CalendarExternalForm adapter={adapter} />;
}

export default function App() {
  return (
    <GoogleTokenProvider>
      <BookingForm />
    </GoogleTokenProvider>
  );
}
```

## 7. Going to production

- Submit the OAuth consent screen for verification if you use sensitive or restricted scopes, or you want the app out of `Testing` mode.
- Publishing to production removes the 100 test-user cap.
- Sensitive/restricted scope verification can take weeks and may require a security assessment. Prefer the narrowest scope you can.
- Consider a backend-mediated flow if you need refresh tokens, service accounts, or domain-wide delegation.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `redirect_uri_mismatch` | Origin or redirect URI not listed on the OAuth client |
| `idpiframe_initialization_failed` | Third-party cookies blocked — switch to GIS token client |
| `401 invalid_credentials` on submit | Token expired; re-run `tokenProvider` |
| `403 insufficient_permissions` | Requested scope does not include write — add `calendar.events` |
| Consent screen shows "unverified app" warning | Expected in `Testing` mode; safe for you and listed test users |

## See also

- [DataAdapter pattern](./DataAdapter.md)
- [Microsoft 365 setup](./Microsoft365Setup.md)

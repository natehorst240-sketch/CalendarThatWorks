/**
 * Example Microsoft Graph adapter for CalendarExternalForm.
 * Keep this in examples/ so the core package stays auth-provider neutral.
 */

export function createMicrosoft365Adapter({ tokenProvider, calendarId = 'primary' }) {
  if (typeof tokenProvider !== 'function') {
    throw new Error('tokenProvider is required for Microsoft 365 adapter.');
  }

  return {
    async submitEvent(payload) {
      const token = await tokenProvider();
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toGraphEvent(payload)),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Graph submit failed (${response.status}): ${text || 'unknown error'}`);
      }

      return response.json();
    },
  };
}

function toGraphEvent(payload) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    subject: payload.title,
    body: payload.description
      ? { contentType: 'text', content: payload.description }
      : undefined,
    start: {
      dateTime: new Date(payload.start).toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: new Date(payload.end).toISOString(),
      timeZone: timezone,
    },
    location: payload.location ? { displayName: payload.location } : undefined,
  };
}

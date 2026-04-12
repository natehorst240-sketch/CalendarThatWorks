/**
 * Legacy profile store — seeds the `wc-profiles-{calendarId}` localStorage key
 * that `useSavedViews` migrates from on first load.
 */

export function saveProfiles(calendarId, profiles) {
  try {
    localStorage.setItem(`wc-profiles-${calendarId}`, JSON.stringify(profiles));
  } catch {}
}

export function loadProfiles(calendarId) {
  try {
    const raw = localStorage.getItem(`wc-profiles-${calendarId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/**
 * localStorage adapter used by CalendarExternalForm examples and smoke tests.
 */
export function createLocalStorageDataAdapter({ key = 'works-calendar:external-events' } = {}) {
  return {
    async submitEvent(payload) {
      const events = readEvents(key);
      const record = {
        id: `ext-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        ...payload,
      };
      const next = [...events, record];
      localStorage.setItem(key, JSON.stringify(next));
      return record;
    },
  };
}

function readEvents(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * useOwnerConfig — owner config state + role-derived edit access.
 *
 * The calendar is a presentation layer; authentication is the host app's job.
 * `isOwner` is derived from the `role` prop (and `devMode`) — there is no
 * client-side password check, which on a browser-only library would be
 * obfuscation, not security.
 *
 * NOTE on `devMode`: it forces `isOwner` to `true` regardless of `role`. It is
 * a local-development convenience only — host apps must never pass it `true` in
 * production, where access has to be gated by `role`.
 */
import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { loadConfig, saveConfig } from '../core/configSchema';
import type { CalendarRole, OwnerConfig } from '../WorksCalendar.types';

export type OwnerCfgHandle = {
  config: OwnerConfig;
  isOwner: boolean;
  configOpen: boolean;
  setConfigOpen: Dispatch<SetStateAction<boolean>>;
  configInitialTab: string | null;
  smartViewEditId: string | null;
  updateConfig: (updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => void;
  closeConfig: () => void;
  openGear: () => void;
  openConfigToTab: (tabId: string | null, opts?: { smartViewEditId?: string | null | undefined }) => void;
};

export function useOwnerConfig({ calendarId, role = 'admin', onConfigSave, devMode = false }: {
  calendarId: string;
  role?: CalendarRole | undefined;
  onConfigSave?: ((config: OwnerConfig) => void) | undefined;
  devMode?: boolean | undefined;
}): OwnerCfgHandle {
  const [config,        setConfig]        = useState<OwnerConfig>(() => loadConfig(calendarId));
  const [configOpen,    setConfigOpen]    = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<string | null>(null);
  const [smartViewEditId, setSmartViewEditId] = useState<string | null>(null);
  // When non-null, holds the `calendarId` to persist + notify for once the
  // pending config change commits — captured at `updateConfig` time so a
  // `calendarId` switch racing the edit can't redirect the save to the wrong
  // namespace (or drop it).
  const pendingSaveRef = useRef<string | null>(null);

  // Reload from storage when the host points us at a different `calendarId`
  // (it's the persistence namespace key). The ref skips the redundant reload
  // on mount, since `useState` already seeded from `calendarId`. A pending save
  // is deliberately *not* cleared here: it belongs to the previous calendar and
  // the commit effect will still flush it to that calendar's namespace.
  const calendarIdRef = useRef(calendarId);
  useEffect(() => {
    if (calendarIdRef.current === calendarId) return;
    calendarIdRef.current = calendarId;
    setConfig(loadConfig(calendarId));
  }, [calendarId]);

  // Host app decides who can edit config — no client-side password.
  const isOwner = role === 'admin' || devMode;

  const updateConfig = useCallback((updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => {
    // The state updater stays pure (it can be invoked more than once / for a
    // render that is later discarded). Capture the *current* `calendarId` so the
    // persist targets the calendar the edit was made against, even if the host
    // switches calendars before the commit effect runs.
    pendingSaveRef.current = calendarId;
    setConfig(prev => (typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
  }, [calendarId]);

  useEffect(() => {
    const targetId = pendingSaveRef.current;
    if (targetId === null) return;
    pendingSaveRef.current = null;
    saveConfig(targetId, config);
    onConfigSave?.(config);
  }, [config, onConfigSave]);

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
  }, []);

  const openGear = useCallback(() => {
    if (isOwner) {
      setConfigOpen(true);
    }
  }, [isOwner]);

  // Deep-link helper: open ConfigPanel focused on a specific tab id. Used by
  // view toolbars (e.g. AssetsView's "Edit assets") so owners can jump
  // straight to the relevant registry without hunting through tabs.
  const openConfigToTab = useCallback((tabId: string | null, opts: { smartViewEditId?: string | null | undefined } = {}) => {
    setConfigInitialTab(tabId ?? null);
    setSmartViewEditId(opts.smartViewEditId ?? null);
    setConfigOpen(true);
  }, []);

  return {
    config,
    isOwner,
    configOpen, setConfigOpen,
    configInitialTab,
    smartViewEditId,
    updateConfig,
    closeConfig,
    openGear,
    openConfigToTab,
  };
}

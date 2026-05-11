/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: remove as types are tightened */
/**
 * useOwnerConfig — owner config state + role-derived edit access.
 *
 * The calendar is a presentation layer; authentication is the host app's job.
 * `isOwner` is derived from the `role` prop (and `devMode`) — there is no
 * client-side password check, which on a browser-only library would be
 * obfuscation, not security.
 */
import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { loadConfig, saveConfig } from '../core/configSchema';
import type { CalendarRole } from '../WorksCalendar.types';

type OwnerConfig = Record<string, any>;

export function useOwnerConfig({ calendarId, role = 'admin', onConfigSave, devMode = false }: {
  calendarId: string;
  role?: CalendarRole | undefined;
  onConfigSave?: ((config: OwnerConfig) => void) | undefined;
  devMode?: boolean | undefined;
}): {
  config: OwnerConfig;
  isOwner: boolean;
  configOpen: boolean;
  setConfigOpen: Dispatch<SetStateAction<boolean>>;
  configInitialTab: string | null;
  smartViewEditId: string | null;
  updateConfig: (updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => void;
  closeConfig: () => void;
  openGear: () => void;
  openConfigToTab: (tabId: string | null, opts?: { smartViewEditId?: string | null }) => void;
} {
  const [config,        setConfig]        = useState<OwnerConfig>(() => loadConfig(calendarId));
  const [configOpen,    setConfigOpen]    = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<string | null>(null);
  const [smartViewEditId, setSmartViewEditId] = useState<string | null>(null);
  const pendingNotifyRef = useRef(false);

  // Host app decides who can edit config — no client-side password.
  const isOwner = role === 'admin' || devMode;

  const updateConfig = useCallback((updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => {
    setConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      saveConfig(calendarId, next);
      pendingNotifyRef.current = true;
      return next;
    });
  }, [calendarId]);

  useEffect(() => {
    if (!pendingNotifyRef.current) return;
    pendingNotifyRef.current = false;
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
  const openConfigToTab = useCallback((tabId: string | null, opts: { smartViewEditId?: string | null } = {}) => {
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

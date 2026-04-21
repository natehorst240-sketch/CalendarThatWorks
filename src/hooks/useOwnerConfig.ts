/**
 * useOwnerConfig.js — Owner authentication + config state.
 */
import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../core/configSchema';

type OwnerConfig = Record<string, any>;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

export function useOwnerConfig({ calendarId, ownerPassword, onConfigSave, devMode = false }: {
  calendarId: string;
  ownerPassword?: string;
  onConfigSave?: (config: OwnerConfig) => void;
  devMode?: boolean;
}): {
  config: OwnerConfig;
  isOwner: boolean;
  configOpen: boolean;
  setConfigOpen: Dispatch<SetStateAction<boolean>>;
  configInitialTab: string | null;
  smartViewEditId: string | null;
  authError: string;
  isAuthLoading: boolean;
  authenticate: (password: string) => Promise<boolean>;
  updateConfig: (updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => void;
  closeConfig: () => void;
  openGear: () => void;
  openConfigToTab: (tabId: string | null, opts?: { smartViewEditId?: string | null }) => void;
} {
  const [config,        setConfig]        = useState<OwnerConfig>(() => loadConfig(calendarId));
  const [isOwner,       setIsOwner]       = useState(devMode);
  const [configOpen,    setConfigOpen]    = useState(false);
  const [configInitialTab, setConfigInitialTab] = useState<string | null>(null);
  const [smartViewEditId, setSmartViewEditId] = useState<string | null>(null);
  const [authError,     setAuthError]     = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const pendingNotifyRef = useRef(false);

  const authenticate = useCallback(async (password: string) => {
    if (!ownerPassword) {
      setIsOwner(true);
      setConfigOpen(true);
      setAuthError('');
      return true;
    }
    setIsAuthLoading(true);
    try {
      const [inputHash, storedHash] = await Promise.all([
        sha256(password),
        sha256(ownerPassword),
      ]);
      if (inputHash === storedHash) {
        setIsOwner(true);
        setConfigOpen(true);
        setAuthError('');
        return true;
      } else {
        setAuthError('Incorrect password');
        return false;
      }
    } finally {
      setIsAuthLoading(false);
    }
  }, [ownerPassword]);

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
    // else OwnerLock component handles the prompt
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
    authError,
    isAuthLoading,
    authenticate,
    updateConfig,
    closeConfig,
    openGear,
    openConfigToTab,
  };
}

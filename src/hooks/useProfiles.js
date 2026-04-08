/**
 * useProfiles.js — Manage saved filter profiles.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  loadProfiles, saveProfiles, createProfile,
  serializeFilters, deserializeFilters,
} from '../core/profileStore.js';

export function useProfiles({ calendarId, filters, view, setFilters, setView }) {
  const [profiles,       setProfiles]       = useState(() => loadProfiles(calendarId));
  const [activeId,       setActiveId]       = useState(null);
  const [isDirty,        setIsDirty]        = useState(false); // filters changed since last apply

  // When filters change externally, mark the active profile as dirty
  useEffect(() => {
    if (activeId) setIsDirty(true);
  }, [filters, view]); // eslint-disable-line react-hooks/exhaustive-deps

  function persist(updated) {
    setProfiles(updated);
    saveProfiles(calendarId, updated);
  }

  /** Apply a saved profile: restore its filters (and optionally view). */
  const applyProfile = useCallback((profile) => {
    const restoredFilters = deserializeFilters(profile.filters);
    setFilters(restoredFilters);
    if (profile.view) setView(profile.view);
    setActiveId(profile.id);
    setIsDirty(false);
  }, [setFilters, setView]);

  /** Save current filter state as a new named profile. */
  const addProfile = useCallback(({ name, color, pinView }) => {
    const serialized = serializeFilters(filters);
    const profile = createProfile({
      name,
      color,
      filters: serialized,
      view: pinView ? view : null,
    });
    const updated = [...profiles, profile];
    persist(updated);
    setActiveId(profile.id);
    setIsDirty(false);
    return profile;
  }, [profiles, filters, view]);

  /** Overwrite an existing profile with the current filter state. */
  const updateProfile = useCallback((id, patch) => {
    const updated = profiles.map(p =>
      p.id === id ? { ...p, ...patch } : p
    );
    persist(updated);
    if (patch.filters || patch.view) {
      setIsDirty(false);
    }
  }, [profiles]);

  /** Save current filters into an existing profile (update in place). */
  const resaveProfile = useCallback((id) => {
    const serialized = serializeFilters(filters);
    updateProfile(id, { filters: serialized, view });
    setIsDirty(false);
  }, [filters, view, updateProfile]);

  /** Remove a profile. */
  const deleteProfile = useCallback((id) => {
    const updated = profiles.filter(p => p.id !== id);
    persist(updated);
    if (activeId === id) {
      setActiveId(null);
      setIsDirty(false);
    }
  }, [profiles, activeId]);

  /** Clear the active profile selection (without clearing filters). */
  const clearActive = useCallback(() => {
    setActiveId(null);
    setIsDirty(false);
  }, []);

  const activeProfile = profiles.find(p => p.id === activeId) ?? null;

  return {
    profiles,
    activeProfile,
    activeId,
    isDirty,
    applyProfile,
    addProfile,
    updateProfile,
    resaveProfile,
    deleteProfile,
    clearActive,
  };
}

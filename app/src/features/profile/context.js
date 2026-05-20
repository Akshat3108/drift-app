import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { profile as profileRepo } from './repo';
import { pushRecent, removeRecent } from '@features/expenses/search';
import { useRefreshBus, useRegisterRefresh } from '@core/state/RefreshBus';

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [ready, setReady] = useState(false);
  const bus = useRefreshBus();
  // 5.2 — serialise recent-search writes so a fast double-tap doesn't end up
  // with the older list winning. Each call awaits the previous one's commit.
  const writeChainRef = useRef(Promise.resolve());

  const refresh = useCallback(async () => {
    const next = await profileRepo.get();
    setProfile(next);
    setRecentSearches(next?.recent_searches || []);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('profile', refresh);

  // createProfile + updateProfile fan a full refresh through the bus so any
  // seeded data (e.g. starter categories added during onboarding) is picked up.
  const createProfile = useCallback(async ({ name, avatar }) => {
    await profileRepo.create({ name, avatar });
    await bus.refreshAll();
  }, [bus]);

  const updateProfile = useCallback(async (patch) => {
    await profileRepo.update(patch);
    await bus.refreshAll();
  }, [bus]);

  // 5.2 — append a query, persist, refresh state. Idempotent on rapid retries
  // because pushRecent dedupes case-insensitively.
  const pushRecentSearch = useCallback(async (query) => {
    const next = pushRecent(recentSearches, query);
    setRecentSearches(next);
    writeChainRef.current = writeChainRef.current
      .then(() => profileRepo.setRecentSearches(next))
      .catch(() => {});
    return writeChainRef.current;
  }, [recentSearches]);

  const removeRecentSearch = useCallback(async (query) => {
    const next = removeRecent(recentSearches, query);
    setRecentSearches(next);
    writeChainRef.current = writeChainRef.current
      .then(() => profileRepo.setRecentSearches(next))
      .catch(() => {});
    return writeChainRef.current;
  }, [recentSearches]);

  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([]);
    writeChainRef.current = writeChainRef.current
      .then(() => profileRepo.clearRecentSearches())
      .catch(() => {});
    return writeChainRef.current;
  }, []);

  const value = {
    ready, profile, onboarded: !!profile,
    createProfile, updateProfile,
    recentSearches, pushRecentSearch, removeRecentSearch, clearRecentSearches,
  };
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { tagsRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const TagsContext = createContext(null);

export function TagsProvider({ children }) {
  const [tags, setTags] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setTags(await tagsRepo.listLive());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('tags', refresh);

  const getOrCreateTag = useCallback(async (name) => {
    const tag = await tagsRepo.getOrCreate(name);
    // The new tag would have usage_count = 0; refreshing keeps the list
    // sorted correctly and surfaces the row to other consumers.
    await refresh();
    return tag;
  }, [refresh]);

  const renameTag = useCallback(async (id, newName) => {
    const res = await tagsRepo.rename(id, newName);
    await refresh();
    return res;
  }, [refresh]);

  const removeTag = useCallback(async (id) => {
    await tagsRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restoreTag = useCallback(async (id) => {
    await tagsRepo.restore(id);
    await refresh();
  }, [refresh]);

  const value = { ready, tags, refresh, getOrCreateTag, renameTag, removeTag, restoreTag };
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export const useTags = () => useContext(TagsContext);

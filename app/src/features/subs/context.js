import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { subs as subRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const SubsContext = createContext(null);

export function SubsProvider({ children }) {
  const [subs, setSubs] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setSubs(await subRepo.list());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('subs', refresh);

  const addSub       = useCallback(async (data)      => { await subRepo.create(data);    setSubs(await subRepo.list()); }, []);
  const updateSub    = useCallback(async (id, patch) => { await subRepo.update(id, patch); setSubs(await subRepo.list()); }, []);
  const cancelSub    = useCallback(async (id)        => { await subRepo.cancel(id);       setSubs(await subRepo.list()); }, []);
  const reinstateSub = useCallback(async (id)        => { await subRepo.reinstate(id);    setSubs(await subRepo.list()); }, []);
  const removeSub    = useCallback(async (id)        => { await subRepo.remove(id);       setSubs(await subRepo.list()); }, []);
  const restoreSub   = useCallback(async (id)        => { await subRepo.restore(id);      setSubs(await subRepo.list()); }, []);

  const value = { ready, subs, addSub, updateSub, cancelSub, reinstateSub, removeSub, restoreSub };
  return <SubsContext.Provider value={value}>{children}</SubsContext.Provider>;
}

export const useSubs = () => useContext(SubsContext);

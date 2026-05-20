import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { goals as goalRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const GoalsContext = createContext(null);

export function GoalsProvider({ children }) {
  const [goals, setGoals] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setGoals(await goalRepo.list());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('goals', refresh);

  const addGoal        = useCallback(async (data)         => { await goalRepo.create(data);       setGoals(await goalRepo.list()); }, []);
  const updateGoal     = useCallback(async (id, patch)    => { await goalRepo.update(id, patch);  setGoals(await goalRepo.list()); }, []);
  const contributeGoal = useCallback(async (id, amount)   => { await goalRepo.contribute(id, amount); setGoals(await goalRepo.list()); }, []);
  const removeGoal     = useCallback(async (id)           => { await goalRepo.remove(id);         setGoals(await goalRepo.list()); }, []);
  const restoreGoal    = useCallback(async (id)           => { await goalRepo.restore(id);        setGoals(await goalRepo.list()); }, []);

  const value = { ready, goals, addGoal, updateGoal, contributeGoal, removeGoal, restoreGoal };
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export const useGoals = () => useContext(GoalsContext);

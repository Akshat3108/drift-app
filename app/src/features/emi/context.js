import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { emiRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const EmiContext = createContext(null);

export function EmiProvider({ children }) {
  const [loans, setLoans] = useState([]);
  const [linkedCounts, setLinkedCounts] = useState({});
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [ls, counts] = await Promise.all([
      emiRepo.listLive(),
      emiRepo.linkedCountsAll(),
    ]);
    setLoans(ls);
    setLinkedCounts(counts);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('emi', refresh);

  const addLoan = useCallback(async (data) => {
    const row = await emiRepo.create(data);
    await refresh();
    return row;
  }, [refresh]);

  const updateLoan = useCallback(async (id, patch) => {
    const row = await emiRepo.update(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const removeLoan = useCallback(async (id) => {
    await emiRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restoreLoan = useCallback(async (id) => {
    await emiRepo.restore(id);
    await refresh();
  }, [refresh]);

  const value = {
    ready,
    loans,
    linkedCounts,
    addLoan, updateLoan, removeLoan, restoreLoan,
    linkedExpenses: (id) => emiRepo.linkedExpenses(id),
  };
  return <EmiContext.Provider value={value}>{children}</EmiContext.Provider>;
}

export const useEmi = () => useContext(EmiContext);

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { holdingsRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const InvestmentsContext = createContext(null);

export function InvestmentsProvider({ children }) {
  const [holdings, setHoldings] = useState([]);
  const [totals,   setTotals]   = useState({ marketValue: 0, costBasis: 0, gain: 0, count: 0, oldestUpdate: null });
  const [ready,    setReady]    = useState(false);

  const refresh = useCallback(async () => {
    const [list, sums] = await Promise.all([
      holdingsRepo.list(),
      holdingsRepo.totals(),
    ]);
    setHoldings(list);
    setTotals(sums);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('investments', refresh);

  const addHolding    = useCallback(async (data)      => { const row = await holdingsRepo.create(data); await refresh(); return row; }, [refresh]);
  const updateHolding = useCallback(async (id, patch) => { const row = await holdingsRepo.update(id, patch); await refresh(); return row; }, [refresh]);
  const updateNav     = useCallback(async (id, nav)   => { const row = await holdingsRepo.updateNav(id, nav); await refresh(); return row; }, [refresh]);
  const removeHolding = useCallback(async (id)        => { await holdingsRepo.remove(id);  await refresh(); }, [refresh]);
  const restoreHolding= useCallback(async (id)        => { await holdingsRepo.restore(id); await refresh(); }, [refresh]);

  const value = {
    ready, holdings, totals,
    addHolding, updateHolding, updateNav, removeHolding, restoreHolding,
  };
  return <InvestmentsContext.Provider value={value}>{children}</InvestmentsContext.Provider>;
}

export const useInvestments = () => useContext(InvestmentsContext);

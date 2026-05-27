import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { insuranceRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useNotifyBus, NOTIFY_EVENTS } from '@core/state/NotifyBus';

const InsuranceContext = createContext(null);

export function InsuranceProvider({ children }) {
  const [policies,      setPolicies]      = useState([]);
  const [linkedCounts,  setLinkedCounts]  = useState({});
  const [ready,         setReady]         = useState(false);
  const bus = useNotifyBus();

  const refresh = useCallback(async () => {
    const [list, counts] = await Promise.all([
      insuranceRepo.list(),
      insuranceRepo.linkedCountsAll(),
    ]);
    setPolicies(list);
    setLinkedCounts(counts);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('insurance', refresh);

  const addPolicy    = useCallback(async (data)      => {
    const row = await insuranceRepo.create(data);
    await refresh();
    bus?.emit(NOTIFY_EVENTS.INSURANCE_UPSERTED, row);
    return row;
  }, [refresh, bus]);
  const updatePolicy = useCallback(async (id, patch) => {
    const row = await insuranceRepo.update(id, patch);
    await refresh();
    bus?.emit(NOTIFY_EVENTS.INSURANCE_UPSERTED, row);
    return row;
  }, [refresh, bus]);
  const removePolicy = useCallback(async (id)        => {
    await insuranceRepo.remove(id);
    await refresh();
    bus?.emit(NOTIFY_EVENTS.INSURANCE_REMOVED, { id });
  }, [refresh, bus]);
  const restorePolicy= useCallback(async (id)        => {
    await insuranceRepo.restore(id);
    await refresh();
    const row = policies.find(p => p.id === id) || (await insuranceRepo.get(id));
    if (row) bus?.emit(NOTIFY_EVENTS.INSURANCE_UPSERTED, row);
  }, [refresh, bus, policies]);

  const value = {
    ready, policies, linkedCounts,
    addPolicy, updatePolicy, removePolicy, restorePolicy,
    linkedExpenses: (id) => insuranceRepo.linkedExpenses(id),
  };
  return <InsuranceContext.Provider value={value}>{children}</InsuranceContext.Provider>;
}

export const useInsurance = () => useContext(InsuranceContext);

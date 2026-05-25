import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { utilityAccountsRepo, utilityBillsRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useExpenses } from '@features/expenses/context';

// 7.12 — Utilities feature provider.
//
// Holds the accounts list + a Map of per-account aggregates (last_total,
// year_total, bill_count, last_period_end). Bills are not held in memory —
// they're loaded lazily by UtilityDetail because per-account bill counts
// can grow unbounded over years.

const UtilitiesContext = createContext(null);

export function UtilitiesProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [aggregates, setAggregates] = useState(new Map());
  const [ready, setReady] = useState(false);
  const { refreshSummary } = useExpenses();

  const refresh = useCallback(async () => {
    const [acc, agg] = await Promise.all([
      utilityAccountsRepo.listLive(),
      utilityBillsRepo.aggregatesByAccount(),
    ]);
    setAccounts(acc);
    setAggregates(agg);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('utilities', refresh);

  const addAccount = useCallback(async (data) => {
    const row = await utilityAccountsRepo.create(data);
    await refresh();
    return row;
  }, [refresh]);

  const updateAccount = useCallback(async (id, patch) => {
    const row = await utilityAccountsRepo.update(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const removeAccount = useCallback(async (id) => {
    await utilityAccountsRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restoreAccount = useCallback(async (id) => {
    await utilityAccountsRepo.restore(id);
    await refresh();
  }, [refresh]);

  const addBill = useCallback(async ({ expense, bill }) => {
    const result = await utilityBillsRepo.createWithExpense({ expense, bill });
    await refresh();
    await refreshSummary();
    return result;
  }, [refresh, refreshSummary]);

  const updateBill = useCallback(async (billId, patches) => {
    const row = await utilityBillsRepo.updatePair(billId, patches);
    await refresh();
    await refreshSummary();
    return row;
  }, [refresh, refreshSummary]);

  const removeBill = useCallback(async (id) => {
    await utilityBillsRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restoreBill = useCallback(async (id) => {
    await utilityBillsRepo.restore(id);
    await refresh();
  }, [refresh]);

  const value = {
    ready,
    accounts,
    aggregates,
    addAccount, updateAccount, removeAccount, restoreAccount,
    addBill, updateBill, removeBill, restoreBill,
    billsForAccount: (id) => utilityBillsRepo.listByAccount(id),
    consumptionTrend: (id, opts) => utilityBillsRepo.consumptionTrend(id, opts),
    getBill: (id) => utilityBillsRepo.get(id),
  };
  return <UtilitiesContext.Provider value={value}>{children}</UtilitiesContext.Provider>;
}

export const useUtilities = () => useContext(UtilitiesContext);

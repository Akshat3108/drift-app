import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { income as incomeRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const IncomeContext = createContext(null);

const INCOME_LIMIT = 500;

// Mirrors expenses/context.js ordering so optimistic patches drop into the
// right slot when the user back-dates an income event.
function sortIncome(arr) {
  const copy = arr.slice().sort((a, b) => {
    const dateCmp = (b.received_date || '').localeCompare(a.received_date || '');
    if (dateCmp !== 0) return dateCmp;
    const createdCmp = (b.created_at || '').localeCompare(a.created_at || '');
    if (createdCmp !== 0) return createdCmp;
    return (b.id || 0) - (a.id || 0);
  });
  return copy.length > INCOME_LIMIT ? copy.slice(0, INCOME_LIMIT) : copy;
}

export function IncomeProvider({ children }) {
  const [income, setIncome] = useState([]);
  const [totalIncome, setTotalIncome] = useState(0);  // current-month sum
  const [ready, setReady] = useState(false);

  const refreshTotal = useCallback(async () => {
    const v = await incomeRepo.monthlyTotal();
    setTotalIncome(v);
  }, []);

  const refresh = useCallback(async () => {
    const [list, total] = await Promise.all([
      incomeRepo.list({ limit: INCOME_LIMIT }),
      incomeRepo.monthlyTotal(),
    ]);
    setIncome(list);
    setTotalIncome(total);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('income', refresh);

  const addIncome = useCallback(async (data) => {
    const row = await incomeRepo.create(data);
    setIncome(prev => sortIncome([row, ...prev]));
    await refreshTotal();
  }, [refreshTotal]);

  const updateIncome = useCallback(async (id, patch) => {
    const row = await incomeRepo.update(id, patch);
    if (row) setIncome(prev => sortIncome(prev.map(r => r.id === id ? row : r)));
    await refreshTotal();
  }, [refreshTotal]);

  const removeIncome = useCallback(async (id) => {
    await incomeRepo.remove(id);
    setIncome(prev => prev.filter(r => r.id !== id));
    await refreshTotal();
  }, [refreshTotal]);

  const value = {
    ready,
    income,
    totalIncome,
    addIncome, updateIncome, removeIncome,
    monthlyTotal: (...a) => incomeRepo.monthlyTotal(...a),
    monthlyTrend: (...a) => incomeRepo.monthlyTrend(...a),
  };
  return <IncomeContext.Provider value={value}>{children}</IncomeContext.Provider>;
}

export const useIncome = () => useContext(IncomeContext);

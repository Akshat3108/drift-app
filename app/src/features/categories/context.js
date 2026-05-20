import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { categories as catRepo } from './repo';
import { useExpenses } from '@features/expenses/context';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const CategoriesContext = createContext(null);

export function CategoriesProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [ready, setReady] = useState(false);
  const { refreshSummary } = useExpenses();

  const refresh = useCallback(async () => {
    setCategories(await catRepo.list());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('categories', refresh);

  // Pots are derived from `categories ⨝ expenses` via SUM in SQL — so any
  // category mutation has to re-run the summary query.
  const addCategory = useCallback(async (data) => {
    await catRepo.create(data);
    setCategories(await catRepo.list());
    await refreshSummary();
  }, [refreshSummary]);

  const updateCategory = useCallback(async (id, patch) => {
    await catRepo.update(id, patch);
    setCategories(await catRepo.list());
    await refreshSummary();
  }, [refreshSummary]);

  const removeCategory = useCallback(async (id) => {
    await catRepo.remove(id);
    setCategories(await catRepo.list());
    await refreshSummary();
  }, [refreshSummary]);

  const restoreCategory = useCallback(async (id) => {
    await catRepo.restore(id);
    setCategories(await catRepo.list());
    await refreshSummary();
  }, [refreshSummary]);

  const value = { ready, categories, addCategory, updateCategory, removeCategory, restoreCategory };
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export const useCategories = () => useContext(CategoriesContext);

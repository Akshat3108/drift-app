import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { expenses as expRepo } from './repo';
import { items as itemRepo } from '@features/items/repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const ExpensesContext = createContext(null);

// Caps how many expenses sit in memory at once. Visible feed (Home / AllExpenses)
// reads from this; analytics queries hit SQL directly. Cap removed once 8.1 ships
// FlatList virtualisation.
const EXPENSES_LIMIT = 500;

// Mirror of the SQL ORDER BY used by expRepo.list:
//   ORDER BY expense_date DESC, created_at DESC, id DESC
// Applied after every optimistic patch so a back-dated insert lands in its real
// chronological slot, not at the top.
function sortExpenses(arr) {
  const copy = arr.slice().sort((a, b) => {
    const dateCmp = (b.expense_date || '').localeCompare(a.expense_date || '');
    if (dateCmp !== 0) return dateCmp;
    const createdCmp = (b.created_at || '').localeCompare(a.created_at || '');
    if (createdCmp !== 0) return createdCmp;
    return (b.id || 0) - (a.id || 0);
  });
  return copy.length > EXPENSES_LIMIT ? copy.slice(0, EXPENSES_LIMIT) : copy;
}

// Map a summaryByCategory row to the legacy `pot` shape that screens already
// consume (`spend`/`key`/`label` aliases).
function rowToPot(r) {
  return {
    ...r,
    spend: +((r.spent || 0).toFixed(2)),
    key: r.id,
    label: r.name,
  };
}

function summaryFromRows(rows) {
  const pots = rows.map(rowToPot);
  const totalSpend  = pots.reduce((s, p) => s + p.spend, 0);
  const monthBudget = pots.reduce((s, p) => s + p.budget, 0);
  return { pots, totalSpend, monthBudget };
}

export function ExpensesProvider({ children }) {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ pots: [], totalSpend: 0, monthBudget: 0 });
  const [ready, setReady] = useState(false);

  const refreshSummary = useCallback(async () => {
    const rows = await expRepo.summaryByCategory();
    setSummary(summaryFromRows(rows));
  }, []);

  const refresh = useCallback(async () => {
    const [e, sumRows] = await Promise.all([
      expRepo.list({ limit: EXPENSES_LIMIT }),
      expRepo.summaryByCategory(),
    ]);
    setExpenses(e);
    setSummary(summaryFromRows(sumRows));
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('expenses', refresh);

  // Optimistic in-memory patching: repos already return the joined row from
  // their create/update paths, so we just splice it into place. refreshSummary
  // runs after the state update — single indexed GROUP BY query.
  const addExpense = useCallback(async (data) => {
    const row = await expRepo.create(data);
    setExpenses(prev => sortExpenses([row, ...prev]));
    await refreshSummary();
    return row;
  }, [refreshSummary]);

  const updateExpense = useCallback(async (id, patch) => {
    const row = await expRepo.update(id, patch);
    if (row) setExpenses(prev => sortExpenses(prev.map(e => e.id === id ? row : e)));
    await refreshSummary();
  }, [refreshSummary]);

  const removeExpense = useCallback(async (id) => {
    await expRepo.remove(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    await refreshSummary();
  }, [refreshSummary]);

  const restoreExpense = useCallback(async (id) => {
    await expRepo.restore(id);
    await refresh();
  }, [refresh]);

  // 5.8 — batch ops. Refresh from SQL rather than optimistically patching N
  // rows: the in-memory feed cap (500) means we could be touching most of
  // what's loaded anyway, and the category-joined columns (`category_name`,
  // `category_emoji`, `category_color`) need to be re-fetched on recat.
  const bulkRemoveExpenses = useCallback(async (ids) => {
    const n = await expRepo.bulkRemove(ids);
    await refresh();
    return n;
  }, [refresh]);

  const bulkRestoreExpenses = useCallback(async (ids) => {
    const n = await expRepo.bulkRestore(ids);
    await refresh();
    return n;
  }, [refresh]);

  const bulkRecategorizeExpenses = useCallback(async (ids, category_id) => {
    const n = await expRepo.bulkUpdateCategory(ids, category_id);
    await refresh();
    return n;
  }, [refresh]);

  const addExpenseWithItems = useCallback(async ({ expense, items }) => {
    const row = await expRepo.createWithItems({ expense, items });
    setExpenses(prev => sortExpenses([row, ...prev]));
    await refreshSummary();
    return row;
  }, [refreshSummary]);

  const updateExpenseWithItems = useCallback(async (id, patch, items) => {
    const updated = await expRepo.update(id, patch);
    await itemRepo.replaceItems(id, items, updated?.expense_date);
    if (updated) setExpenses(prev => sortExpenses(prev.map(e => e.id === id ? updated : e)));
    await refreshSummary();
  }, [refreshSummary]);

  const value = {
    ready,
    expenses,
    pots: summary.pots,
    totalSpend: summary.totalSpend,
    monthBudget: summary.monthBudget,
    refreshSummary,
    addExpense, updateExpense, removeExpense, restoreExpense,
    bulkRemoveExpenses, bulkRestoreExpenses, bulkRecategorizeExpenses,
    addExpenseWithItems, updateExpenseWithItems,
    // read-only repo methods exposed so 2.10 can drop `useApp().repos.expenses.*`
    monthlyTrend: (...a) => expRepo.monthlyTrend(...a),
    streakDays:   (...a) => expRepo.streakDays(...a),
    findDuplicate: (...a) => expRepo.findDuplicate(...a),
  };
  return <ExpensesContext.Provider value={value}>{children}</ExpensesContext.Provider>;
}

export const useExpenses = () => useContext(ExpensesContext);

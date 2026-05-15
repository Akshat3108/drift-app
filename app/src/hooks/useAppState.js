import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { getDB, resetAll } from '../db';
import { profile as profileRepo } from '../db/repo/profile';
import { settings as settingsRepo } from '../db/repo/settings';
import { categories as catRepo } from '../db/repo/categories';
import { expenses as expRepo } from '../db/repo/expenses';
import { subs as subRepo } from '../db/repo/subs';
import { goals as goalRepo } from '../db/repo/goals';
import { accounts as accRepo } from '../db/repo/accounts';
import { trips as tripRepo } from '../db/repo/trips';
import { items as itemRepo } from '../db/repo/items';
import { CURRENCIES } from '../data/constants';
import { FT, FTD } from '../theme';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({ currency: 'INR', dark_mode: 0, carbon_tracking: 1 });
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [subs, setSubs] = useState([]);
  const [goals, setGoals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [trips, setTrips] = useState([]);

  const refresh = useCallback(async () => {
    const [p, s, c, e, sb, g, a, t] = await Promise.all([
      profileRepo.get(),
      settingsRepo.get(),
      catRepo.list(),
      expRepo.list({ limit: 500 }),
      subRepo.list(),
      goalRepo.list(),
      accRepo.list(),
      tripRepo.listWithCategories(),
    ]);
    setProfile(p);
    setSettings(s);
    setCategories(c);
    setExpenses(e);
    setSubs(sb);
    setGoals(g);
    setAccounts(a);
    setTrips(t);
  }, []);

  useEffect(() => {
    (async () => {
      await getDB();
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  // ── profile ────────────────────────────────────────────
  const createProfile = useCallback(async ({ name, avatar }) => {
    await profileRepo.create({ name, avatar });
    await refresh();
  }, [refresh]);

  const updateProfile = useCallback(async (patch) => {
    await profileRepo.update(patch);
    await refresh();
  }, [refresh]);

  // ── settings ──────────────────────────────────────────
  const setSetting = useCallback(async (key, val) => {
    await settingsRepo.set({ [key]: val });
    const s = await settingsRepo.get();
    setSettings(s);
  }, []);

  // ── categories ────────────────────────────────────────
  const addCategory    = useCallback(async (data) => { await catRepo.create(data); setCategories(await catRepo.list()); }, []);
  const updateCategory = useCallback(async (id, patch) => { await catRepo.update(id, patch); setCategories(await catRepo.list()); }, []);
  const removeCategory = useCallback(async (id) => { await catRepo.remove(id); setCategories(await catRepo.list()); }, []);

  // ── expenses ──────────────────────────────────────────
  const addExpense    = useCallback(async (data) => { await expRepo.create(data); setExpenses(await expRepo.list({ limit: 500 })); }, []);
  const updateExpense = useCallback(async (id, patch) => { await expRepo.update(id, patch); setExpenses(await expRepo.list({ limit: 500 })); }, []);
  const removeExpense = useCallback(async (id) => { await expRepo.remove(id); setExpenses(await expRepo.list({ limit: 500 })); }, []);
  const addExpenseWithItems = useCallback(async ({ expense, items }) => {
    await expRepo.createWithItems({ expense, items });
    setExpenses(await expRepo.list({ limit: 500 }));
  }, []);

  // ── subscriptions ─────────────────────────────────────
  const addSub       = useCallback(async (data) => { await subRepo.create(data); setSubs(await subRepo.list()); }, []);
  const updateSub    = useCallback(async (id, patch) => { await subRepo.update(id, patch); setSubs(await subRepo.list()); }, []);
  const cancelSub    = useCallback(async (id) => { await subRepo.cancel(id); setSubs(await subRepo.list()); }, []);
  const reinstateSub = useCallback(async (id) => { await subRepo.reinstate(id); setSubs(await subRepo.list()); }, []);
  const removeSub    = useCallback(async (id) => { await subRepo.remove(id); setSubs(await subRepo.list()); }, []);

  // ── goals ─────────────────────────────────────────────
  const addGoal      = useCallback(async (data) => { await goalRepo.create(data); setGoals(await goalRepo.list()); }, []);
  const updateGoal   = useCallback(async (id, patch) => { await goalRepo.update(id, patch); setGoals(await goalRepo.list()); }, []);
  const contributeGoal = useCallback(async (id, amount) => { await goalRepo.contribute(id, amount); setGoals(await goalRepo.list()); }, []);
  const removeGoal   = useCallback(async (id) => { await goalRepo.remove(id); setGoals(await goalRepo.list()); }, []);

  // ── accounts ──────────────────────────────────────────
  const addAccount    = useCallback(async (data) => { await accRepo.create(data); setAccounts(await accRepo.list()); }, []);
  const updateAccount = useCallback(async (id, patch) => { await accRepo.update(id, patch); setAccounts(await accRepo.list()); }, []);
  const removeAccount = useCallback(async (id) => { await accRepo.remove(id); setAccounts(await accRepo.list()); }, []);

  // ── trips ─────────────────────────────────────────────
  const addTrip    = useCallback(async (data) => { await tripRepo.create(data); setTrips(await tripRepo.listWithCategories()); }, []);
  const updateTrip = useCallback(async (id, patch) => { await tripRepo.update(id, patch); setTrips(await tripRepo.listWithCategories()); }, []);
  const removeTrip = useCallback(async (id) => { await tripRepo.remove(id); setTrips(await tripRepo.listWithCategories()); }, []);

  // ── reset ─────────────────────────────────────────────
  const resetApp = useCallback(async () => {
    await resetAll();
    await refresh();
  }, [refresh]);

  // ── derived ───────────────────────────────────────────
  const F = settings.dark_mode ? FTD : FT;
  const sym = CURRENCIES[settings.currency]?.symbol || '₹';

  const summary = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const monthExpenses = expenses.filter(e => (e.expense_date || '').startsWith(month));
    const byCat = new Map();
    for (const e of monthExpenses) {
      if (e.category_id) byCat.set(e.category_id, (byCat.get(e.category_id) || 0) + e.amount);
    }
    const pots = categories.map(c => ({
      ...c,
      key: c.id,
      label: c.name,
      spend: +(byCat.get(c.id) || 0).toFixed(2),
    }));
    const totalSpend  = pots.reduce((s, p) => s + p.spend, 0);
    const monthBudget = pots.reduce((s, p) => s + p.budget, 0);
    return { pots, totalSpend, monthBudget };
  }, [expenses, categories]);

  if (!ready) return null;

  const value = {
    ready,
    profile,
    onboarded: !!profile,
    settings,
    categories,
    pots: summary.pots,
    expenses,
    subs,
    goals,
    accounts,
    trips,
    totalSpend: summary.totalSpend,
    monthBudget: summary.monthBudget,
    F, sym,
    // repos exposed for screens that need ad-hoc queries (items, summaries)
    repos: { items: itemRepo, expenses: expRepo, accounts: accRepo, trips: tripRepo },
    // mutations
    createProfile, updateProfile,
    setSetting,
    addCategory, updateCategory, removeCategory,
    addExpense, updateExpense, removeExpense, addExpenseWithItems,
    addSub, updateSub, cancelSub, reinstateSub, removeSub,
    addGoal, updateGoal, contributeGoal, removeGoal,
    addAccount, updateAccount, removeAccount,
    addTrip, updateTrip, removeTrip,
    resetApp, refresh,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

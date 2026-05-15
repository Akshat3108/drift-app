import { useState, useEffect, createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_POTS, DEFAULT_EXPENSES, DEFAULT_SUBS, DEFAULT_GOALS, CURRENCIES } from '../data/constants';
import { FT, FTD } from '../theme';

const KEY = 'drift_state';

const INITIAL = {
  pots:     DEFAULT_POTS,
  expenses: DEFAULT_EXPENSES,
  subs:     DEFAULT_SUBS,
  goals:    DEFAULT_GOALS,
  settings: { currency: 'INR', dark: false },
};

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [state, setState] = useState(INITIAL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) {
        try { setState(JSON.parse(raw)); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(state));
  }, [state, loaded]);

  const update = fn => setState(prev => ({ ...prev, ...fn(prev) }));

  const addExpense = e => update(prev => {
    const newExp = { id: Date.now(), ...e };
    const pots = e.potKey
      ? prev.pots.map(p => p.key === e.potKey ? { ...p, spend: +(p.spend + e.amount).toFixed(2) } : p)
      : prev.pots;
    return { expenses: [newExp, ...prev.expenses], pots };
  });

  const cancelSub  = name => update(prev => ({ subs: prev.subs.map(s => s.name === name ? { ...s, cancelled: true }  : s) }));
  const undoCancel = name => update(prev => ({ subs: prev.subs.map(s => s.name === name ? { ...s, cancelled: false } : s) }));
  const addGoal    = g    => update(prev => ({ goals: [...prev.goals, { id: Date.now(), ...g }] }));
  const setSetting = (k, v) => update(prev => ({ settings: { ...prev.settings, [k]: v } }));

  const F   = state.settings.dark ? FTD : FT;
  const sym = CURRENCIES[state.settings.currency]?.symbol || '₹';
  const totalSpend  = state.pots.reduce((s, p) => s + p.spend, 0);
  const monthBudget = state.pots.reduce((s, p) => s + p.budget, 0);

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{ ...state, F, sym, totalSpend, monthBudget, addExpense, cancelSub, undoCancel, addGoal, setSetting }}>
      {children}
    </AppContext.Provider>
  );
}

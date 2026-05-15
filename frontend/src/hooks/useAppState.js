import { useLocalStorage } from './useLocalStorage';
import {
  DEFAULT_POTS, DEFAULT_EXPENSES, DEFAULT_SUBS, DEFAULT_GOALS,
} from '../data/sampleData';

const INITIAL = {
  pots:     DEFAULT_POTS,
  expenses: DEFAULT_EXPENSES,
  subs:     DEFAULT_SUBS,
  goals:    DEFAULT_GOALS,
  settings: { currency: 'INR', dark: false },
};

export function useAppState() {
  const [state, setState] = useLocalStorage('drift_state', INITIAL);

  const update = (fn) => setState(prev => ({ ...prev, ...fn(prev) }));

  const addExpense = (e) => update(prev => {
    const newExp = { id: Date.now(), ...e };
    const pots = e.potKey
      ? prev.pots.map(p => p.key === e.potKey ? { ...p, spend: p.spend + e.amount } : p)
      : prev.pots;
    return { expenses: [newExp, ...prev.expenses], pots };
  });

  const cancelSub = (name) => update(prev => ({
    subs: prev.subs.map(s => s.name === name ? { ...s, cancelled: true } : s),
  }));

  const undoCancel = (name) => update(prev => ({
    subs: prev.subs.map(s => s.name === name ? { ...s, cancelled: false } : s),
  }));

  const addGoal = (goal) => update(prev => ({
    goals: [...prev.goals, { id: Date.now(), ...goal }],
  }));

  const setSetting = (key, val) => update(prev => ({
    settings: { ...prev.settings, [key]: val },
  }));

  const totalSpend = state.pots.reduce((s, p) => s + p.spend, 0);
  const monthBudget = state.pots.reduce((s, p) => s + p.budget, 0);

  return {
    ...state,
    totalSpend,
    monthBudget,
    addExpense,
    cancelSub,
    undoCancel,
    addGoal,
    setSetting,
  };
}

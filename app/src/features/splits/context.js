import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { peopleRepo, splitsRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useNotifyBusListener, NOTIFY_EVENTS } from '@core/state/NotifyBus';

// 7.9 — People & splits feature provider.
//
// Holds:
//   - `people`:   live people list (small N — friends, flatmates, colleagues).
//   - `balances`: per-person rollup of money owed to the user.
//
// Refreshes on EXPENSE_CHANGED so the splits surface in EditExpense flows
// into balances without explicit cross-context wiring.

const PeopleContext = createContext(null);

export function PeopleProvider({ children }) {
  const [people, setPeople] = useState([]);
  const [balances, setBalances] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [live, bal] = await Promise.all([
      peopleRepo.listLive(),
      splitsRepo.balancesByPerson(),
    ]);
    setPeople(live);
    setBalances(bal);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('people', refresh);

  // Expense mutations may have changed split sums even if the people slice
  // itself didn't change.
  useNotifyBusListener(NOTIFY_EVENTS.EXPENSE_CHANGED, useCallback(() => {
    refresh().catch(() => {});
  }, [refresh]));

  const addPerson = useCallback(async (data) => {
    const row = await peopleRepo.create(data);
    await refresh();
    return row;
  }, [refresh]);

  const updatePerson = useCallback(async (id, patch) => {
    const row = await peopleRepo.update(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const removePerson = useCallback(async (id) => {
    await peopleRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restorePerson = useCallback(async (id) => {
    await peopleRepo.restore(id);
    await refresh();
  }, [refresh]);

  const getOrCreatePerson = useCallback(async (data) => {
    const row = await peopleRepo.getOrCreate(data);
    await refresh();
    return row;
  }, [refresh]);

  const value = {
    ready,
    people,
    balances,
    addPerson, updatePerson, removePerson, restorePerson, getOrCreatePerson,
    splitsForExpense: (id) => splitsRepo.listForExpense(id),
    expensesForPerson: (pid, opts) => splitsRepo.expensesForPerson(pid, opts),
  };
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export const usePeople = () => useContext(PeopleContext);

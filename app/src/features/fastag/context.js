import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fastagRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const FastagContext = createContext(null);

export function FastagProvider({ children }) {
  const [accounts,  setAccounts]  = useState([]);
  const [ytdSpend,  setYtdSpend]  = useState({});
  const [ready,     setReady]     = useState(false);

  const refresh = useCallback(async () => {
    const [list, spendRows] = await Promise.all([
      fastagRepo.list(),
      fastagRepo.ytdSpend(),
    ]);
    setAccounts(list);
    const map = {};
    for (const r of spendRows) map[r.account_id] = { txns: r.txns, total: r.total };
    setYtdSpend(map);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('fastag', refresh);

  const addAccount    = useCallback(async (data)      => { const row = await fastagRepo.create(data); await refresh(); return row; }, [refresh]);
  const updateAccount = useCallback(async (id, patch) => { const row = await fastagRepo.update(id, patch); await refresh(); return row; }, [refresh]);
  const removeAccount = useCallback(async (id)        => { await fastagRepo.remove(id);  await refresh(); }, [refresh]);
  const restoreAccount= useCallback(async (id)        => { await fastagRepo.restore(id); await refresh(); }, [refresh]);

  const value = {
    ready, accounts, ytdSpend,
    addAccount, updateAccount, removeAccount, restoreAccount,
    linkedExpenses: (id, opts) => fastagRepo.linkedExpenses(id, opts),
  };
  return <FastagContext.Provider value={value}>{children}</FastagContext.Provider>;
}

export const useFastag = () => useContext(FastagContext);

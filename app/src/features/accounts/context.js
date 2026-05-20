import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { accounts as accRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const AccountsContext = createContext(null);

export function AccountsProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setAccounts(await accRepo.list());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('accounts', refresh);

  const addAccount    = useCallback(async (data)      => { await accRepo.create(data);     setAccounts(await accRepo.list()); }, []);
  const updateAccount = useCallback(async (id, patch) => { await accRepo.update(id, patch); setAccounts(await accRepo.list()); }, []);
  const removeAccount  = useCallback(async (id)        => { await accRepo.remove(id);        setAccounts(await accRepo.list()); }, []);
  const restoreAccount = useCallback(async (id)        => { await accRepo.restore(id);       setAccounts(await accRepo.list()); }, []);

  const value = { ready, accounts, addAccount, updateAccount, removeAccount, restoreAccount,
                  netWorth: (...a) => accRepo.netWorth(...a) };
  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export const useAccounts = () => useContext(AccountsContext);

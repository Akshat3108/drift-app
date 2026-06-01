import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { accounts as accRepo } from './repo';
import { snapshotsRepo } from './snapshot';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useNotifyBusListener, NOTIFY_EVENTS } from '@core/state/NotifyBus';

const AccountsContext = createContext(null);

export function AccountsProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setAccounts(await accRepo.list());
  }, []);

  // 7.13 — every accounts mutation (and boot) re-stamps today's net-worth
  // snapshot. Idempotent via the PK conflict in ensureTodaySnapshot.
  // Errors are swallowed so a snapshot-table issue can't break the
  // accounts feature on a live device.
  const stampSnapshot = useCallback(async () => {
    try { await snapshotsRepo.ensureTodaySnapshot(); }
    catch (_) { /* no-op */ }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      await stampSnapshot();
      setReady(true);
    })();
  }, [refresh, stampSnapshot]);

  useRegisterRefresh('accounts', refresh);

  // PS-45 — a cash expense debits the Cash account outside this provider; re-list
  // on EXPENSE_CHANGED so NetWorth reflects the new wallet balance immediately.
  // Cheap single-row-set SELECT; no-op for users without cash tracking.
  useNotifyBusListener(NOTIFY_EVENTS.EXPENSE_CHANGED, refresh);

  const addAccount    = useCallback(async (data)      => { await accRepo.create(data);     setAccounts(await accRepo.list()); await stampSnapshot(); }, [stampSnapshot]);
  const updateAccount = useCallback(async (id, patch) => { await accRepo.update(id, patch); setAccounts(await accRepo.list()); await stampSnapshot(); }, [stampSnapshot]);
  const removeAccount  = useCallback(async (id)        => { await accRepo.remove(id);        setAccounts(await accRepo.list()); await stampSnapshot(); }, [stampSnapshot]);
  const restoreAccount = useCallback(async (id)        => { await accRepo.restore(id);       setAccounts(await accRepo.list()); await stampSnapshot(); }, [stampSnapshot]);

  const value = { ready, accounts, addAccount, updateAccount, removeAccount, restoreAccount,
                  netWorth: (...a) => accRepo.netWorth(...a),
                  // 7.13 — chart data exposed for NetWorthChart.
                  trajectory: (opts) => snapshotsRepo.trajectory(opts),
                  snapshotCount: () => snapshotsRepo.count() };
  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export const useAccounts = () => useContext(AccountsContext);

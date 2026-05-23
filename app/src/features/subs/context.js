import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { subs as subRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useNotifyBus, NOTIFY_EVENTS } from '@core/state/NotifyBus';

const SubsContext = createContext(null);

export function SubsProvider({ children }) {
  const [subs, setSubs] = useState([]);
  const [ready, setReady] = useState(false);
  const notifyBus = useNotifyBus();

  const refresh = useCallback(async () => {
    setSubs(await subRepo.list());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('subs', refresh);

  // 7.1 — emit on upsert so the notifications provider re-schedules the
  // sub's due-date trigger, and on remove/cancel so it can cancel any
  // pending trigger. Payload carries the updated row (or just an id) so
  // the listener can act without re-querying.
  const addSub = useCallback(async (data) => {
    const created = await subRepo.create(data);
    setSubs(await subRepo.list());
    notifyBus?.emit(NOTIFY_EVENTS.SUB_UPSERTED, created);
  }, [notifyBus]);

  const updateSub = useCallback(async (id, patch) => {
    const updated = await subRepo.update(id, patch);
    setSubs(await subRepo.list());
    notifyBus?.emit(NOTIFY_EVENTS.SUB_UPSERTED, updated);
  }, [notifyBus]);

  const cancelSub = useCallback(async (id) => {
    await subRepo.cancel(id);
    setSubs(await subRepo.list());
    notifyBus?.emit(NOTIFY_EVENTS.SUB_REMOVED, { id });
  }, [notifyBus]);

  const reinstateSub = useCallback(async (id) => {
    const updated = await subRepo.reinstate(id);
    setSubs(await subRepo.list());
    notifyBus?.emit(NOTIFY_EVENTS.SUB_UPSERTED, updated);
  }, [notifyBus]);

  const removeSub = useCallback(async (id) => {
    await subRepo.remove(id);
    setSubs(await subRepo.list());
    notifyBus?.emit(NOTIFY_EVENTS.SUB_REMOVED, { id });
  }, [notifyBus]);

  const restoreSub = useCallback(async (id) => {
    await subRepo.restore(id);
    const list = await subRepo.list();
    setSubs(list);
    const restored = list.find(s => s.id === id);
    if (restored) notifyBus?.emit(NOTIFY_EVENTS.SUB_UPSERTED, restored);
  }, [notifyBus]);

  const value = { ready, subs, addSub, updateSub, cancelSub, reinstateSub, removeSub, restoreSub };
  return <SubsContext.Provider value={value}>{children}</SubsContext.Provider>;
}

export const useSubs = () => useContext(SubsContext);

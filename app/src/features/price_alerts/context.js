import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { priceAlertsRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

// 7.8 — Price-alerts feature provider.
//
// Holds the full alerts list in memory (one row per watched canonical item —
// small N by design). NotificationsProvider reads `alerts` directly to feed
// the evaluatePriceAlerts checker when a PRICE_OBSERVATIONS event fires.
//
// Mutations also refresh the in-memory list. `markFired` is called from
// NotificationsProvider's post-log hook, not from a user-facing UI surface,
// so the action creator is exposed but rarely called from screens.

const PriceAlertsContext = createContext(null);

export function PriceAlertsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await priceAlertsRepo.listLive();
    setAlerts(rows);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('price_alerts', refresh);

  const addAlert = useCallback(async (data) => {
    const row = await priceAlertsRepo.create(data);
    await refresh();
    return row;
  }, [refresh]);

  const updateAlert = useCallback(async (id, patch) => {
    const row = await priceAlertsRepo.update(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const toggleEnabled = useCallback(async (id, enabled) => {
    const row = await priceAlertsRepo.toggleEnabled(id, enabled);
    await refresh();
    return row;
  }, [refresh]);

  const removeAlert = useCallback(async (id) => {
    await priceAlertsRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restoreAlert = useCallback(async (id) => {
    await priceAlertsRepo.restore(id);
    await refresh();
  }, [refresh]);

  const markFired = useCallback(async (id, price) => {
    await priceAlertsRepo.markFired(id, price);
    await refresh();
  }, [refresh]);

  const value = {
    ready,
    alerts,
    addAlert, updateAlert, toggleEnabled, removeAlert, restoreAlert, markFired,
    candidates: (...a) => priceAlertsRepo.candidates(...a),
    getByName:  (name) => priceAlertsRepo.getByName(name),
  };
  return <PriceAlertsContext.Provider value={value}>{children}</PriceAlertsContext.Provider>;
}

export const usePriceAlerts = () => useContext(PriceAlertsContext);

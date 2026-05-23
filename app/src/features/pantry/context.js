import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { pantryRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useNotifyBus, useNotifyBusListener, NOTIFY_EVENTS } from '@core/state/NotifyBus';

// 7.7 — Pantry feature provider.
//
// Holds the full pantry inventory in memory (one row per tracked item — small
// N by design, capped at a few hundred per user) plus the lowStock subset
// for the Shopping tab + low-stock notification check.
//
// Cross-feature integration: addExpenseWithItems (via expRepo.createWithItems)
// calls pantryRepo.autoPopulateFromItems directly — repo-to-repo coupling
// without React in the loop. We refresh the slice on NOTIFY_EVENTS.EXPENSE_CHANGED
// so the in-memory items[] catches up after a scan-save without explicit
// cross-context wiring.

const PantryContext = createContext(null);

export function PantryProvider({ children }) {
  const [items, setItems] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [ready, setReady] = useState(false);
  const bus = useNotifyBus();

  const refresh = useCallback(async () => {
    const [live, low] = await Promise.all([
      pantryRepo.listLive(),
      pantryRepo.listLowStock(),
    ]);
    setItems(live);
    setLowStock(low);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('pantry', refresh);

  // Refresh whenever expenses change — the auto-populate path inside
  // createWithItems may have added or topped up pantry rows.
  useNotifyBusListener(NOTIFY_EVENTS.EXPENSE_CHANGED, useCallback(() => {
    refresh().catch(() => {});
  }, [refresh]));

  const emitChanged = useCallback(() => {
    bus?.emit?.(NOTIFY_EVENTS.PANTRY_CHANGED);
  }, [bus]);

  const addItem = useCallback(async (data) => {
    const row = await pantryRepo.create(data);
    await refresh();
    emitChanged();
    return row;
  }, [refresh, emitChanged]);

  const updateItem = useCallback(async (id, patch) => {
    const row = await pantryRepo.update(id, patch);
    await refresh();
    emitChanged();
    return row;
  }, [refresh, emitChanged]);

  const removeItem = useCallback(async (id) => {
    await pantryRepo.remove(id);
    await refresh();
    emitChanged();
  }, [refresh, emitChanged]);

  const restoreItem = useCallback(async (id) => {
    await pantryRepo.restore(id);
    await refresh();
    emitChanged();
  }, [refresh, emitChanged]);

  const setQty = useCallback(async (id, qty) => {
    const row = await pantryRepo.setQty(id, qty);
    await refresh();
    emitChanged();
    return row;
  }, [refresh, emitChanged]);

  const incrementQty = useCallback(async (id, delta) => {
    const row = await pantryRepo.incrementQty(id, delta);
    await refresh();
    emitChanged();
    return row;
  }, [refresh, emitChanged]);

  const markUsedUp = useCallback(async (id) => {
    const row = await pantryRepo.setQty(id, 0);
    await refresh();
    emitChanged();
    return row;
  }, [refresh, emitChanged]);

  const value = {
    ready,
    items,
    lowStock,
    addItem, updateItem, removeItem, restoreItem,
    setQty, incrementQty, markUsedUp,
    candidates: (...a) => pantryRepo.candidates(...a),
    getByName: (name) => pantryRepo.getByName(name),
  };
  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export const usePantry = () => useContext(PantryContext);

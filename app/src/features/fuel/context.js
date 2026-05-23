import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { vehiclesRepo, fillupsRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';
import { useExpenses } from '@features/expenses/context';

// 7.6 — Fuel feature provider.
//
// Owns the vehicles slice plus aggregate data per vehicle (this-month spend,
// last fill-up date, count). Per-vehicle fill-up lists are not eagerly held
// here — VehicleDetail.js loads them via listByVehicle on mount + on
// refresh. Keeps the in-memory footprint bounded as the fill-up history
// grows.
//
// Cross-feature: addFillup / updateFillup / removeFillup mutate the expenses
// table too (via the atomic dual-write inside fillupsRepo). We pull
// useExpenses().refreshSummary so the monthly_summary-backed `pots` array
// updates in the same tick — same pattern Categories uses.

const FuelContext = createContext(null);

export function FuelProvider({ children }) {
  const [vehicles, setVehicles] = useState([]);
  const [aggregates, setAggregates] = useState({});
  const [ready, setReady] = useState(false);

  const { refresh: refreshExpenses, refreshSummary } = useExpenses();

  const refresh = useCallback(async () => {
    const [vs, aggs] = await Promise.all([
      vehiclesRepo.listLive(),
      fillupsRepo.aggregatesByVehicle(),
    ]);
    setVehicles(vs);
    setAggregates(aggs);
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('fuel', refresh);

  const addVehicle = useCallback(async (data) => {
    const row = await vehiclesRepo.create(data);
    await refresh();
    return row;
  }, [refresh]);

  const updateVehicle = useCallback(async (id, patch) => {
    const row = await vehiclesRepo.update(id, patch);
    await refresh();
    return row;
  }, [refresh]);

  const removeVehicle = useCallback(async (id) => {
    await vehiclesRepo.remove(id);
    await refresh();
  }, [refresh]);

  const restoreVehicle = useCallback(async (id) => {
    await vehiclesRepo.restore(id);
    await refresh();
  }, [refresh]);

  // addFillup creates BOTH the expense and the fill-up row atomically. The
  // expenses + summary slices need refresh so Home/Trends/AllExpenses see
  // the new spend without a pull-to-refresh.
  const addFillup = useCallback(async ({ expense, fillup }) => {
    const res = await fillupsRepo.createWithExpense({ expense, fillup });
    await Promise.all([refresh(), refreshExpenses(), refreshSummary()]);
    return res;
  }, [refresh, refreshExpenses, refreshSummary]);

  const updateFillup = useCallback(async (id, { expensePatch, fillupPatch }) => {
    const row = await fillupsRepo.updatePair(id, { expensePatch, fillupPatch });
    await Promise.all([refresh(), refreshExpenses(), refreshSummary()]);
    return row;
  }, [refresh, refreshExpenses, refreshSummary]);

  const removeFillup = useCallback(async (id) => {
    await fillupsRepo.remove(id);
    await Promise.all([refresh(), refreshExpenses(), refreshSummary()]);
  }, [refresh, refreshExpenses, refreshSummary]);

  const restoreFillup = useCallback(async (id) => {
    await fillupsRepo.restore(id);
    await Promise.all([refresh(), refreshExpenses(), refreshSummary()]);
  }, [refresh, refreshExpenses, refreshSummary]);

  const value = {
    ready,
    vehicles,
    aggregates,
    addVehicle, updateVehicle, removeVehicle, restoreVehicle,
    addFillup, updateFillup, removeFillup, restoreFillup,
    listByVehicle: (id) => fillupsRepo.listByVehicle(id),
    mileageWindow: (id) => fillupsRepo.mileageWindow(id),
    lastVehicleUsed: () => fillupsRepo.lastVehicleUsed(),
    getFillupByExpense: (eid) => fillupsRepo.getByExpense(eid),
  };
  return <FuelContext.Provider value={value}>{children}</FuelContext.Provider>;
}

export const useFuel = () => useContext(FuelContext);

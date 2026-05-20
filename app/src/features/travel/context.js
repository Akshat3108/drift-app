import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { trips as tripRepo } from './repo';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const TravelContext = createContext(null);

export function TravelProvider({ children }) {
  const [trips, setTrips] = useState([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setTrips(await tripRepo.listWithCategories());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('travel', refresh);

  const addTrip    = useCallback(async (data)      => { await tripRepo.create(data);     setTrips(await tripRepo.listWithCategories()); }, []);
  const updateTrip = useCallback(async (id, patch) => { await tripRepo.update(id, patch); setTrips(await tripRepo.listWithCategories()); }, []);
  const removeTrip  = useCallback(async (id)        => { await tripRepo.remove(id);        setTrips(await tripRepo.listWithCategories()); }, []);
  const restoreTrip = useCallback(async (id)        => { await tripRepo.restore(id);       setTrips(await tripRepo.listWithCategories()); }, []);

  const value = { ready, trips, addTrip, updateTrip, removeTrip, restoreTrip,
                  next: (...a) => tripRepo.next(...a) };
  return <TravelContext.Provider value={value}>{children}</TravelContext.Provider>;
}

export const useTravel = () => useContext(TravelContext);

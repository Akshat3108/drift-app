import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';

// Cross-feature refresh bus. Each feature provider registers its own
// `refresh()` here on mount; the shim's global `refresh()` and `resetApp`
// fan out by calling every registered callback in parallel. Ref-based so
// adding/removing registrations doesn't trigger re-renders.
const RefreshBusContext = createContext(null);

export function RefreshBusProvider({ children }) {
  const registry = useRef(new Map());

  const register = useCallback((key, fn) => {
    registry.current.set(key, fn);
    return () => {
      if (registry.current.get(key) === fn) registry.current.delete(key);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    const tasks = [...registry.current.values()].map(fn => fn());
    await Promise.all(tasks);
  }, []);

  const value = { register, refreshAll };
  return <RefreshBusContext.Provider value={value}>{children}</RefreshBusContext.Provider>;
}

export const useRefreshBus = () => useContext(RefreshBusContext);

// Convenience: register `refresh` against the bus for the lifetime of the
// calling component. Returns nothing; the bus key is the provided string.
export function useRegisterRefresh(key, refresh) {
  const bus = useRefreshBus();
  useEffect(() => {
    if (!bus) return undefined;
    return bus.register(key, refresh);
  }, [bus, key, refresh]);
}

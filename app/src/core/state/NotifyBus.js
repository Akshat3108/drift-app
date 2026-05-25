import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';

// Tiny ref-based event bus that lets ancestor providers (Expenses, Subs) emit
// events to a descendant provider (Notifications) without inverting the tree.
// Same pattern as RefreshBus: ref registry, no state, no re-renders. Listeners
// are keyed by event name and can be replaced on each re-render of the
// subscriber. Unknown events are silently dropped — emitter can fire freely.
const NotifyBusContext = createContext(null);

export function NotifyBusProvider({ children }) {
  const listeners = useRef(new Map()); // event -> Set<fn>

  const subscribe = useCallback((event, fn) => {
    let set = listeners.current.get(event);
    if (!set) { set = new Set(); listeners.current.set(event, set); }
    set.add(fn);
    return () => {
      const s = listeners.current.get(event);
      if (s) { s.delete(fn); if (!s.size) listeners.current.delete(event); }
    };
  }, []);

  const emit = useCallback((event, payload) => {
    const set = listeners.current.get(event);
    if (!set || !set.size) return;
    for (const fn of set) {
      try {
        const r = fn(payload);
        if (r && typeof r.then === 'function') r.catch(() => {});
      } catch {
        // listeners must not break emitters
      }
    }
  }, []);

  const value = { subscribe, emit };
  return <NotifyBusContext.Provider value={value}>{children}</NotifyBusContext.Provider>;
}

export const useNotifyBus = () => useContext(NotifyBusContext);

// Convenience subscribe-for-the-lifetime-of-the-component hook.
export function useNotifyBusListener(event, fn) {
  const bus = useNotifyBus();
  useEffect(() => {
    if (!bus) return undefined;
    return bus.subscribe(event, fn);
  }, [bus, event, fn]);
}

// Event names — single source of truth so emitters and listeners can't drift.
export const NOTIFY_EVENTS = {
  EXPENSE_CHANGED:     'expense:changed',
  SUB_UPSERTED:        'sub:upserted',
  SUB_REMOVED:         'sub:removed',
  PANTRY_CHANGED:      'pantry:changed',
  // 7.8 — fired by ExpensesProvider.addExpenseWithItems with payload
  // `{ observations: [{ normalized_name, scanned_price }] }` so the
  // notifications layer can run price-alert checks against the just-scanned
  // unit prices (item_summary.last_unit_price has already been mutated by
  // the receipt_items AI trigger, so this event carries the snapshot the
  // checker needs).
  PRICE_OBSERVATIONS:  'price:observations',
};

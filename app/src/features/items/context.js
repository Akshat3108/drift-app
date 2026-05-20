import React, { createContext, useContext, useMemo } from 'react';
import { items as itemRepo } from './repo';

const ItemsContext = createContext(null);

// Items has no cached list state — every query (suggest, trackedItems,
// priceHistory, etc.) hits SQL directly. The provider exists so that
// useItemActions() in 2.10 has a stable, named surface to migrate screens
// off `useApp().repos.items.*`.
export function ItemsProvider({ children }) {
  // Arrow wrappers preserve `itemRepo` as `this` (topMover internally calls
  // this.trackedItems — a bare reference would lose the binding).
  const value = useMemo(() => ({
    ready: true,
    suggest:        (...a) => itemRepo.suggest(...a),
    trackedItems:   (...a) => itemRepo.trackedItems(...a),
    listByExpense:  (...a) => itemRepo.listByExpense(...a),
    remove:         (...a) => itemRepo.remove(...a),
    restore:        (...a) => itemRepo.restore(...a),
    replaceItems:   (...a) => itemRepo.replaceItems(...a),
    priceHistory:   (...a) => itemRepo.priceHistory(...a),
    sameQtyHistory: (...a) => itemRepo.sameQtyHistory(...a),
    stats:          (...a) => itemRepo.stats(...a),
    consumption:    (...a) => itemRepo.consumption(...a),
    topMover:       (...a) => itemRepo.topMover(...a),
  }), []);
  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export const useItems = () => useContext(ItemsContext);
export const useItemActions = () => useContext(ItemsContext);

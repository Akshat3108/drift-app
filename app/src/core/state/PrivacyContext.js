// PS-21 — PrivacyContext. Centralises the "should amounts be masked right
// now?" decision so every `formatCurrency()` call can defer to a single
// place instead of each screen re-deriving the rule.
//
// Inputs that flip `hidden`:
//   - settings.privacy_mask_amounts_always  → hidden = true (permanently)
//   - settings.privacy_hide_on_minimize     → hidden = true while AppState
//                                              is NOT 'active'
//
// Callers: import `useAmountsHidden()` and `maskCurrency(value, sym)`.
// The legacy `formatCurrency()` in core/utils stays unchanged; screens
// that need privacy-aware rendering call `maskCurrency` instead.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useSettings } from '@features/profile/settings.context';

const PrivacyContext = createContext({ hidden: false });

export function PrivacyProvider({ children }) {
  const { settings } = useSettings();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  const hidden = useMemo(() => {
    if (settings?.privacy_mask_amounts_always) return true;
    if (settings?.privacy_hide_on_minimize && !appActive) return true;
    return false;
  }, [settings?.privacy_mask_amounts_always, settings?.privacy_hide_on_minimize, appActive]);

  const value = useMemo(() => ({ hidden }), [hidden]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function useAmountsHidden() {
  return useContext(PrivacyContext).hidden;
}

// Returns the user-facing string. When privacy mode is off, just formats
// the amount; when on, returns the masked placeholder. Callers that need
// to print the actual numeric value (e.g. CSV export) should NOT use
// this — they read from the source directly.
export function maskCurrency(amount, sym = '₹', hidden = false) {
  if (hidden) return `${sym}•••`;
  const v = Math.round(Number(amount) || 0);
  return `${sym}${Math.abs(v).toLocaleString('en-IN')}`;
}

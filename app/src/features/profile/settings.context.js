import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { settings as settingsRepo } from './settings.repo';
import { CURRENCIES } from '@core/domain/currencies';
import { useRegisterRefresh } from '@core/state/RefreshBus';

const SettingsContext = createContext(null);

const DEFAULTS = {
  currency: 'INR',
  dark_mode: 0,
  carbon_tracking: 1,
  orientation_seen: 0,
  notifications_enabled: 0,
  notif_budget_threshold: 0.8,
  notif_sub_lead_days: 3,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setSettings(await settingsRepo.get());
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  useRegisterRefresh('settings', refresh);

  const setSetting = useCallback(async (key, val) => {
    await settingsRepo.set({ [key]: val });
    setSettings(await settingsRepo.get());
  }, []);

  const sym = CURRENCIES[settings.currency]?.symbol || '₹';

  const value = { ready, settings, sym, setSetting };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

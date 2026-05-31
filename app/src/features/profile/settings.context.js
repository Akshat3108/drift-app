import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  app_lock_enabled: 0,
  privacy_block_screenshots: 0,
  privacy_hide_on_minimize: 0,
  privacy_mask_amounts_always: 0,
  capture_expense_time: 0,
  // v51 — Wave-1 settings batch
  notif_budget_enabled: 1,
  notif_sub_enabled: 1,
  notif_price_enabled: 1,
  notif_lowstock_enabled: 1,
  notif_health_enabled: 1,
  accent_color: null,
  show_receipt_thumbnails: 0,
  chart_prefs: '{}',
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

  // v52 — per-chart rendering preferences, parsed from the chart_prefs JSON
  // column. `chartPrefs[chartId]` is the user's last-chosen chart type for a
  // surface (undefined → that chart's hard-coded default).
  const chartPrefs = useMemo(() => {
    try { return JSON.parse(settings.chart_prefs || '{}') || {}; }
    catch { return {}; }
  }, [settings.chart_prefs]);

  // Merge a single chart's type into the JSON map. Re-reads the row first so a
  // concurrent write to another chart isn't clobbered. Pass type=null to clear.
  const setChartType = useCallback(async (chartId, type) => {
    if (!chartId) return;
    const cur = await settingsRepo.get();
    let map = {};
    try { map = JSON.parse(cur.chart_prefs || '{}') || {}; } catch { map = {}; }
    if (type == null) delete map[chartId]; else map[chartId] = type;
    await settingsRepo.set({ chart_prefs: JSON.stringify(map) });
    setSettings(await settingsRepo.get());
  }, []);

  const value = { ready, settings, sym, setSetting, chartPrefs, setChartType };
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

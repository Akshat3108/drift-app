import { exec, one } from '../../db';

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
};

export const settings = {
  async get() {
    const row = await one('SELECT * FROM settings WHERE id = 1');
    return row || { id: 1, ...DEFAULTS };
  },
  async set(patch) {
    const cur = await this.get();
    const next = { ...cur, ...patch };
    await exec(
      `INSERT INTO settings (id, currency, dark_mode, carbon_tracking, orientation_seen,
                             notifications_enabled, notif_budget_threshold, notif_sub_lead_days,
                             app_lock_enabled,
                             privacy_block_screenshots, privacy_hide_on_minimize,
                             privacy_mask_amounts_always,
                             capture_expense_time)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         currency               = excluded.currency,
         dark_mode              = excluded.dark_mode,
         carbon_tracking        = excluded.carbon_tracking,
         orientation_seen       = excluded.orientation_seen,
         notifications_enabled  = excluded.notifications_enabled,
         notif_budget_threshold = excluded.notif_budget_threshold,
         notif_sub_lead_days    = excluded.notif_sub_lead_days,
         app_lock_enabled       = excluded.app_lock_enabled,
         privacy_block_screenshots   = excluded.privacy_block_screenshots,
         privacy_hide_on_minimize    = excluded.privacy_hide_on_minimize,
         privacy_mask_amounts_always = excluded.privacy_mask_amounts_always,
         capture_expense_time   = excluded.capture_expense_time`,
      [
        next.currency,
        next.dark_mode ? 1 : 0,
        next.carbon_tracking ? 1 : 0,
        next.orientation_seen ? 1 : 0,
        next.notifications_enabled ? 1 : 0,
        Number.isFinite(next.notif_budget_threshold) ? next.notif_budget_threshold : 0.8,
        Number.isInteger(next.notif_sub_lead_days) ? next.notif_sub_lead_days : 3,
        next.app_lock_enabled ? 1 : 0,
        next.privacy_block_screenshots ? 1 : 0,
        next.privacy_hide_on_minimize ? 1 : 0,
        next.privacy_mask_amounts_always ? 1 : 0,
        next.capture_expense_time ? 1 : 0,
      ]
    );
    return this.get();
  },
};

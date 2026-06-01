import { exec, all, one } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

export const subs = {
  // PS-29 — stamp the last price-drift alert time (record-keeping; the
  // notification_log dedupe key is the real re-fire gate).
  async markAlerted(id) {
    return exec(`UPDATE subscriptions SET last_alert_at = datetime('now') WHERE id = ?`, [id]);
  },

  async list() {
    return all(`SELECT * FROM subscriptions WHERE ${NOT_DELETED} ORDER BY created_at DESC, id DESC`);
  },
  async get(id) {
    return one('SELECT * FROM subscriptions WHERE id = ?', [id]);
  },
  async create({ name, amount, period = 'mo', used_freq, verdict = 'keep', icon = '📦', color = '#888', next_bill }) {
    const res = await exec(
      `INSERT INTO subscriptions (name, amount, period, used_freq, verdict, icon, color, next_bill)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, amount, period, used_freq ?? null, verdict, icon, color, next_bill ?? null]
    );
    return this.get(res.lastInsertRowId);
  },
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE subscriptions SET name=?, amount=?, period=?, used_freq=?, verdict=?, icon=?, color=?, next_bill=? WHERE id=?`,
      [next.name, next.amount, next.period, next.used_freq, next.verdict, next.icon, next.color, next.next_bill, id]
    );
    return this.get(id);
  },
  async cancel(id) {
    await exec('UPDATE subscriptions SET cancelled = 1 WHERE id = ?', [id]);
    return this.get(id);
  },
  async reinstate(id) {
    await exec('UPDATE subscriptions SET cancelled = 0 WHERE id = ?', [id]);
    return this.get(id);
  },
  async remove(id) {
    await exec(`UPDATE subscriptions SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id]);
  },
  async restore(id) {
    await exec('UPDATE subscriptions SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

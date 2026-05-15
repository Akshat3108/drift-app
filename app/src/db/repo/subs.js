import { exec, all, one } from '../index';

export const subs = {
  async list() {
    return all('SELECT * FROM subscriptions ORDER BY created_at DESC, id DESC');
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
    await exec('DELETE FROM subscriptions WHERE id = ?', [id]);
  },
};

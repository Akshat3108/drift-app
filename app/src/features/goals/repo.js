import { exec, all, one } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

export const goals = {
  async list() {
    return all(`SELECT * FROM goals WHERE ${NOT_DELETED} ORDER BY created_at DESC, id DESC`);
  },
  async get(id) {
    return one('SELECT * FROM goals WHERE id = ?', [id]);
  },
  async create({ name, emoji = '🎯', target_amount, saved_amount = 0, eta }) {
    const res = await exec(
      'INSERT INTO goals (name, emoji, target_amount, saved_amount, eta) VALUES (?, ?, ?, ?, ?)',
      [name, emoji, target_amount, saved_amount, eta ?? null]
    );
    return this.get(res.lastInsertRowId);
  },
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      'UPDATE goals SET name=?, emoji=?, target_amount=?, saved_amount=?, eta=? WHERE id=?',
      [next.name, next.emoji, next.target_amount, next.saved_amount, next.eta ?? null, id]
    );
    return this.get(id);
  },
  async contribute(id, amount) {
    await exec('UPDATE goals SET saved_amount = saved_amount + ? WHERE id = ?', [amount, id]);
    return this.get(id);
  },
  async remove(id) {
    await exec(`UPDATE goals SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id]);
  },
  async restore(id) {
    await exec('UPDATE goals SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

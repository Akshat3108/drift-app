import { exec, all, one } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

export const categories = {
  async list() {
    return all(`SELECT * FROM categories WHERE ${NOT_DELETED} ORDER BY sort_order, id`);
  },
  async get(id) {
    return one('SELECT * FROM categories WHERE id = ?', [id]);
  },
  async create({ name, emoji = '💰', budget = 0, color = 'cream', sort_order, rollover_enabled = 0 }) {
    const ord = sort_order ?? (await one(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories'
    ))?.n ?? 0;
    const res = await exec(
      'INSERT INTO categories (name, emoji, budget, color, sort_order, rollover_enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [name, emoji, budget, color, ord, rollover_enabled ? 1 : 0]
    );
    return this.get(res.lastInsertRowId);
  },
  async update(id, { name, emoji, budget, color, sort_order, rollover_enabled }) {
    const cur = await this.get(id);
    if (!cur) return null;
    await exec(
      'UPDATE categories SET name = ?, emoji = ?, budget = ?, color = ?, sort_order = ?, rollover_enabled = ? WHERE id = ?',
      [
        name ?? cur.name,
        emoji ?? cur.emoji,
        budget ?? cur.budget,
        color ?? cur.color,
        sort_order ?? cur.sort_order,
        // 7.10 — undefined means "leave unchanged"; null/0 means off; 1 means on.
        rollover_enabled === undefined
          ? (cur.rollover_enabled ?? 0)
          : (rollover_enabled ? 1 : 0),
        id,
      ]
    );
    return this.get(id);
  },
  async remove(id) {
    await exec(`UPDATE categories SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id]);
  },
  async restore(id) {
    await exec('UPDATE categories SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

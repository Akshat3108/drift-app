import { exec, all, one } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

// PS-36 — true when making `childId` a child of `parentId` would create a cycle
// in the categories(parent_id) tree. Walks UP the ancestor chain from the
// candidate parent: if we ever reach `childId`, the link would loop. Pure /
// list-driven (operates on the already-loaded categories array) so it is unit
// testable and needs no DB round-trip. The `seen` guard also breaks on any
// pre-existing corrupt cycle rather than spinning forever.
export function wouldCycle(cats, childId, parentId) {
  if (parentId == null) return false;            // clearing the parent is always safe
  if (parentId === childId) return true;         // can't be your own parent
  const byId = new Map(cats.map((c) => [c.id, c]));
  const seen = new Set();
  let cur = byId.get(parentId);
  while (cur && cur.parent_id != null) {
    if (cur.parent_id === childId) return true;  // childId is an ancestor of parentId
    if (seen.has(cur.parent_id)) break;          // corrupt loop already in data
    seen.add(cur.parent_id);
    cur = byId.get(cur.parent_id);
  }
  return false;
}

export const categories = {
  async list() {
    return all(`SELECT * FROM categories WHERE ${NOT_DELETED} ORDER BY sort_order, id`);
  },
  async get(id) {
    return one('SELECT * FROM categories WHERE id = ?', [id]);
  },
  async create({ name, emoji = '💰', budget = 0, color = 'cream', sort_order, rollover_enabled = 0, parent_id = null }) {
    const ord = sort_order ?? (await one(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM categories'
    ))?.n ?? 0;
    const res = await exec(
      'INSERT INTO categories (name, emoji, budget, color, sort_order, rollover_enabled, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, emoji, budget, color, ord, rollover_enabled ? 1 : 0, parent_id ?? null]
    );
    return this.get(res.lastInsertRowId);
  },
  async update(id, { name, emoji, budget, color, sort_order, rollover_enabled, parent_id }) {
    const cur = await this.get(id);
    if (!cur) return null;
    await exec(
      'UPDATE categories SET name = ?, emoji = ?, budget = ?, color = ?, sort_order = ?, rollover_enabled = ?, parent_id = ? WHERE id = ?',
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
        // PS-36 — undefined means "leave unchanged"; null means "make top-level".
        parent_id === undefined ? (cur.parent_id ?? null) : (parent_id ?? null),
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

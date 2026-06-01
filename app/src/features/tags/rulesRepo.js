// PS-35 — auto-tag rule CRUD. Mirrors the merchant_aliases (5.10) rule pattern:
// soft-deletable rows whose `predicate_json` is evaluated on every expense save.

import { exec, all, one } from '../../db';

function safeParse(s) {
  try { return JSON.parse(s) || {}; } catch { return {}; }
}

export const tagRulesRepo = {
  // Full list for the Rules CRUD screen — joins the tag for display. Dropped
  // when the tag itself is soft-deleted (an orphaned rule is meaningless).
  async list() {
    return all(`
      SELECT r.id, r.predicate_json, r.tag_id, r.enabled, r.created_at,
             t.name AS tag_name, t.color AS tag_color
        FROM tag_rules r
        JOIN tags t ON t.id = r.tag_id
       WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL
       ORDER BY r.created_at DESC
    `);
  },

  // Enabled, live rules with the predicate parsed + the tag name resolved —
  // the shape the save path evaluates against.
  async enabledRules() {
    const rows = await all(`
      SELECT r.id, r.predicate_json, r.tag_id, r.enabled, t.name AS tag_name
        FROM tag_rules r
        JOIN tags t ON t.id = r.tag_id
       WHERE r.deleted_at IS NULL AND t.deleted_at IS NULL AND r.enabled = 1
    `);
    return rows.map((r) => ({ ...r, predicate: safeParse(r.predicate_json) }));
  },

  async get(id) {
    return one('SELECT * FROM tag_rules WHERE id = ?', [id]);
  },

  async create({ predicate, tag_id, enabled = 1 }) {
    const res = await exec(
      'INSERT INTO tag_rules (predicate_json, tag_id, enabled) VALUES (?, ?, ?)',
      [JSON.stringify(predicate || {}), tag_id, enabled ? 1 : 0],
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, { predicate, tag_id, enabled }) {
    const cur = await this.get(id);
    if (!cur) return null;
    await exec(
      'UPDATE tag_rules SET predicate_json = ?, tag_id = ?, enabled = ? WHERE id = ?',
      [
        predicate !== undefined ? JSON.stringify(predicate) : cur.predicate_json,
        tag_id ?? cur.tag_id,
        enabled === undefined ? cur.enabled : (enabled ? 1 : 0),
        id,
      ],
    );
    return this.get(id);
  },

  async setEnabled(id, on) {
    await exec('UPDATE tag_rules SET enabled = ? WHERE id = ?', [on ? 1 : 0, id]);
  },

  async remove(id) {
    await exec(
      `UPDATE tag_rules SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  async restore(id) {
    await exec('UPDATE tag_rules SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

// 5.3 — saved_filters CRUD. JSON round-trip on the `criteria` column so
// callers consume / produce plain objects. Hard-DELETE today; the
// `deleted_at` column is reserved for a future Recycle Bin (1.C.20 discipline).

import { all, exec, one } from '../../db';
import { normalizeCriteria } from './filters';

function rowToShape(row) {
  if (!row) return row;
  let criteria = {};
  try { criteria = row.criteria ? JSON.parse(row.criteria) : {}; }
  catch (_e) { criteria = {}; }
  return { ...row, criteria };
}

export const savedFilters = {
  async list() {
    const rows = await all(
      `SELECT id, name, criteria, created_at, updated_at
         FROM saved_filters
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC, id DESC`
    );
    return rows.map(rowToShape);
  },

  async get(id) {
    const row = await one(
      `SELECT id, name, criteria, created_at, updated_at
         FROM saved_filters
        WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return rowToShape(row);
  },

  async create(name, criteria) {
    const cleanName = String(name || '').trim().slice(0, 60);
    if (!cleanName) throw new Error('Filter name is required');
    const json = JSON.stringify(normalizeCriteria(criteria));
    const res = await exec(
      `INSERT INTO saved_filters (name, criteria) VALUES (?, ?)`,
      [cleanName, json]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, { name, criteria }) {
    const cur = await this.get(id);
    if (!cur) return null;
    const nextName = name != null ? String(name).trim().slice(0, 60) : cur.name;
    const nextCriteria = criteria != null
      ? JSON.stringify(normalizeCriteria(criteria))
      : JSON.stringify(cur.criteria);
    await exec(
      `UPDATE saved_filters
          SET name = ?, criteria = ?, updated_at = datetime('now')
        WHERE id = ?`,
      [nextName, nextCriteria, id]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE saved_filters SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec(`UPDATE saved_filters SET deleted_at = NULL WHERE id = ?`, [id]);
  },
};

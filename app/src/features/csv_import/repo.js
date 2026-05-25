import { exec, all, one } from '../../db';

// 7.15 — CSV import audit log.

export const csvImportsRepo = {
  async create({ format, filename, total_rows, imported_rows, skipped_rows, notes }) {
    const res = await exec(
      `INSERT INTO csv_imports
         (format, filename, total_rows, imported_rows, skipped_rows, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [format, filename || null, total_rows || 0, imported_rows || 0, skipped_rows || 0, notes || null]
    );
    return this.get(res.lastInsertRowId);
  },

  async get(id) {
    return one('SELECT * FROM csv_imports WHERE id = ?', [id]);
  },

  async list({ limit = 20 } = {}) {
    return all('SELECT * FROM csv_imports ORDER BY imported_at DESC LIMIT ?', [limit]);
  },
};

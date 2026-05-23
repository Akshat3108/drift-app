import { exec, all, one, getDB } from '../../db';

// 7.3 — tags repo.
//
// `tags.name` uses COLLATE NOCASE + a partial UNIQUE index WHERE deleted_at
// IS NULL, so case-insensitive collisions are caught at the DB layer and
// soft-deleted tags free their name for re-use without a hard delete.
//
// `expense_tags` is M:N with composite PK (expense_id, tag_id). FK CASCADE
// on both sides keeps joins consistent on hard deletes; soft-deleted
// expenses today leave their joins behind (same posture as receipt_items
// — Recycle Bin work will sweep both).

function normName(name) {
  // Trim only — case is preserved as typed for display. The DB collation
  // takes care of equality at lookup time.
  return typeof name === 'string' ? name.trim() : '';
}

export const tagsRepo = {
  // List every live tag with its current usage count (LEFT JOIN so tags
  // with zero expense links still appear, e.g. just-created tags). Sorted
  // by usage desc, then name asc so the chip surface naturally surfaces
  // the user's most-used tags first.
  async listLive() {
    return all(`
      SELECT t.id, t.name, t.color, t.created_at,
             COUNT(et.expense_id) AS usage_count
        FROM tags t
        LEFT JOIN expense_tags et ON et.tag_id = t.id
       WHERE t.deleted_at IS NULL
       GROUP BY t.id
       ORDER BY usage_count DESC, t.name COLLATE NOCASE ASC
    `);
  },

  async get(id) {
    return one('SELECT * FROM tags WHERE id = ?', [id]);
  },

  // Case-insensitive lookup using the NOCASE collation on the column.
  // Returns the live row matching `name` or null.
  async findByNameLive(name) {
    const n = normName(name);
    if (!n) return null;
    return one(
      `SELECT * FROM tags
        WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL`,
      [n],
    );
  },

  // Idempotent create. Returns the existing live row if one exists with the
  // given name (NOCASE), else INSERTs and returns the new row. Safe to call
  // from a write path repeatedly with the same name.
  async getOrCreate(name) {
    const n = normName(name);
    if (!n) return null;
    const existing = await this.findByNameLive(n);
    if (existing) return existing;
    const res = await exec('INSERT INTO tags (name) VALUES (?)', [n]);
    return this.get(res.lastInsertRowId);
  },

  // List the tags currently attached to one expense.
  async listForExpense(expenseId) {
    return all(`
      SELECT t.id, t.name, t.color
        FROM tags t
        JOIN expense_tags et ON et.tag_id = t.id
       WHERE et.expense_id = ?
         AND t.deleted_at IS NULL
       ORDER BY t.name COLLATE NOCASE ASC
    `, [expenseId]);
  },

  // Replace the tag set for one expense. `names` is the desired set of tag
  // names (strings); the diff INSERTs missing links and DELETEs surplus
  // ones. Idempotent — calling with the same names is a no-op. Runs inside
  // a single transaction so a half-applied diff is impossible.
  async setForExpense(expenseId, names) {
    if (expenseId == null) return;
    const cleanNames = Array.isArray(names)
      ? Array.from(new Set(names.map(normName).filter(Boolean)))
      : [];

    // Resolve names → tag ids OUTSIDE the transaction; getOrCreate may
    // INSERT new tags and a multi-statement transaction would mask the
    // returned lastInsertRowId. The cost is one extra round-trip per new
    // tag; the wins are simpler error handling and deterministic IDs.
    const desiredIds = [];
    for (const n of cleanNames) {
      const tag = await this.getOrCreate(n);
      if (tag) desiredIds.push(tag.id);
    }
    const desiredSet = new Set(desiredIds);

    const existing = await all(
      'SELECT tag_id FROM expense_tags WHERE expense_id = ?',
      [expenseId],
    );
    const existingSet = new Set(existing.map(r => r.tag_id));

    const toAdd    = desiredIds.filter(id => !existingSet.has(id));
    const toRemove = [...existingSet].filter(id => !desiredSet.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) return;

    const db = await getDB();
    await db.withTransactionAsync(async () => {
      for (const id of toAdd) {
        await db.runAsync(
          'INSERT OR IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)',
          [expenseId, id],
        );
      }
      if (toRemove.length > 0) {
        const placeholders = toRemove.map(() => '?').join(', ');
        await db.runAsync(
          `DELETE FROM expense_tags
            WHERE expense_id = ? AND tag_id IN (${placeholders})`,
          [expenseId, ...toRemove],
        );
      }
    });
  },

  // Rename a tag. If `newName` collides with another live tag (NOCASE), the
  // operation becomes a MERGE: the destination tag absorbs the source's
  // expense_tags rows (INSERT OR IGNORE so existing duplicates are skipped),
  // the source is soft-deleted, and the destination is returned. Returns
  // `{ merged: boolean, tag }` so callers can show the right toast.
  async rename(id, newName) {
    const n = normName(newName);
    if (!n) throw new Error('Tag name required');
    const src = await this.get(id);
    if (!src || src.deleted_at) throw new Error('Tag not found');

    const collision = await this.findByNameLive(n);
    if (collision && collision.id !== id) {
      const db = await getDB();
      await db.withTransactionAsync(async () => {
        // Move every join from src to dest. INSERT OR IGNORE skips rows
        // where the expense already has the destination tag (double-tagged
        // expenses don't get a duplicate join).
        await db.runAsync(
          `INSERT OR IGNORE INTO expense_tags (expense_id, tag_id)
           SELECT expense_id, ? FROM expense_tags WHERE tag_id = ?`,
          [collision.id, id],
        );
        await db.runAsync('DELETE FROM expense_tags WHERE tag_id = ?', [id]);
        await db.runAsync(
          `UPDATE tags SET deleted_at = datetime('now') WHERE id = ?`,
          [id],
        );
      });
      return { merged: true, tag: collision };
    }

    await exec('UPDATE tags SET name = ? WHERE id = ?', [n, id]);
    return { merged: false, tag: await this.get(id) };
  },

  // Soft-delete. The tag's expense_tags rows are retained intact so a
  // restore can re-link them; the partial-UNIQUE index frees the name for
  // re-use immediately.
  async remove(id) {
    await exec(
      `UPDATE tags SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  async restore(id) {
    // Clear deleted_at only if the name doesn't collide with a live tag
    // that was created in the meantime; surface the conflict via the
    // partial-UNIQUE index (the UPDATE will fail with a constraint error
    // which the caller can catch + relay to the user).
    await exec('UPDATE tags SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

// PS-09 — Quick-Entry Templates repo.
//
// `expense_templates` table (v44) backs the horizontal chip row on the Add
// screen + the Profile → Quick templates CRUD surface. Soft-delete via
// `deleted_at` mirrors every other user-owned mutable table; reads filter
// through that predicate. `default_day_of_month` is reserved for a future
// auto-create-on-day-X scheduler — column is stored but not yet acted on.

import { exec, all, one, getDB } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

function nextSortOrder(rows) {
  if (!rows || rows.length === 0) return 0;
  return rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0) + 1;
}

export const templatesRepo = {
  async list() {
    return all(
      `SELECT id, label, amount, category_id, payment_method, default_day_of_month,
              icon, sort_order, created_at, deleted_at
         FROM expense_templates
        WHERE ${NOT_DELETED}
        ORDER BY sort_order, id`,
    );
  },

  async get(id) {
    return one(`SELECT * FROM expense_templates WHERE id = ?`, [id]);
  },

  async create({ label, amount, category_id, payment_method, default_day_of_month, icon }) {
    const existing = await this.list();
    const sort_order = nextSortOrder(existing);
    const res = await exec(
      `INSERT INTO expense_templates
         (label, amount, category_id, payment_method, default_day_of_month, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        label,
        Number(amount) || 0,
        category_id ?? null,
        payment_method ?? null,
        Number.isFinite(Number(default_day_of_month)) ? Number(default_day_of_month) : null,
        icon || '🧷',
        sort_order,
      ],
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE expense_templates
          SET label = ?, amount = ?, category_id = ?, payment_method = ?,
              default_day_of_month = ?, icon = ?, sort_order = ?
        WHERE id = ?`,
      [
        next.label,
        Number(next.amount) || 0,
        next.category_id ?? null,
        next.payment_method ?? null,
        Number.isFinite(Number(next.default_day_of_month)) ? Number(next.default_day_of_month) : null,
        next.icon || '🧷',
        Number.isFinite(Number(next.sort_order)) ? Number(next.sort_order) : 0,
        id,
      ],
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE expense_templates SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  // Bulk-update sort_order for every id in the order passed. Used by the
  // QuickTemplates screen's up/down arrows so the chip row reflects the
  // user's curation. A single transaction so partial reorders never land.
  async reorder(idsInOrder) {
    if (!Array.isArray(idsInOrder) || !idsInOrder.length) return 0;
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < idsInOrder.length; i++) {
        await db.runAsync(
          `UPDATE expense_templates SET sort_order = ? WHERE id = ?`,
          [i, idsInOrder[i]],
        );
      }
    });
    return idsInOrder.length;
  },
};

// Pure helper — exported for /tmp/ validation. Given a template + the pots
// list (categories joined with current-month spend), returns the slice of
// Add.js state that should be patched in when the chip is tapped. Falls
// back gracefully when `category_id` is null or the category was deleted —
// caller's `selected` stays unchanged in that case.
export function applyTemplateToAddState(tmpl, pots) {
  if (!tmpl) return null;
  const cat = (pots || []).find((p) => p.id === tmpl.category_id) || null;
  return {
    amount: String(Number(tmpl.amount) || 0),
    merchant: tmpl.label || '',
    selected: cat,
    paymentMethod: tmpl.payment_method || null,
  };
}

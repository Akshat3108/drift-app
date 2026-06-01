// PS-34 — tag analytics.
//
// 7.3 ships the tag chip surface + ManageTags CRUD, but no rollup. This adds a
// per-tag spend aggregate (with an inner category breakdown) so a user tagging
// "work · personal · reimbursable" can see the splits without manual filtering.
//
// Single-user GROUP BY over the indexed expense_tags join — cheap, so no cache.
// All reads honour soft-delete (`NOT_DELETED_*`) and exclude PS-30 pending rows
// (`NOT_PENDING_E`). Refunds carry a negative amount and net out naturally.

import { all, one } from '../db';
import { NOT_DELETED_E, NOT_PENDING_E, NOT_DELETED_T } from '../db/predicates';

// [{ tag_id, tag_name, tag_color, txn_count, total, cat_breakdown:[{category_name,category_emoji,total}] }]
// monthKey: 'YYYY-MM' to scope to one month, or null/omitted for all-time.
export async function tagAggregates(monthKey = null) {
  const monthClause = monthKey ? 'AND e.month_key = ?' : '';
  const params = monthKey ? [monthKey] : [];

  const totals = await all(
    `SELECT t.id AS tag_id, t.name AS tag_name, t.color AS tag_color,
            COUNT(DISTINCT e.id)        AS txn_count,
            COALESCE(SUM(e.amount), 0)  AS total
       FROM tags t
       JOIN expense_tags et ON et.tag_id = t.id
       JOIN expenses e      ON e.id = et.expense_id
      WHERE ${NOT_DELETED_T} AND ${NOT_DELETED_E} AND ${NOT_PENDING_E}
        ${monthClause}
      GROUP BY t.id
     HAVING txn_count > 0
      ORDER BY total DESC, txn_count DESC, t.name COLLATE NOCASE ASC`,
    params,
  );
  if (totals.length === 0) return [];

  // Inner per-category breakdown for every tag, in one pass.
  const cats = await all(
    `SELECT et.tag_id AS tag_id,
            COALESCE(c.name, 'Uncategorised') AS category_name,
            COALESCE(c.emoji, '')             AS category_emoji,
            COALESCE(SUM(e.amount), 0)        AS total
       FROM expense_tags et
       JOIN expenses e      ON e.id = et.expense_id
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE ${NOT_DELETED_E} AND ${NOT_PENDING_E}
        ${monthClause}
      GROUP BY et.tag_id, e.category_id
      ORDER BY et.tag_id, total DESC`,
    params,
  );
  const byTag = new Map();
  for (const r of cats) {
    const arr = byTag.get(r.tag_id) || [];
    arr.push({ category_name: r.category_name, category_emoji: r.category_emoji, total: r.total });
    byTag.set(r.tag_id, arr);
  }
  return totals.map((t) => ({ ...t, cat_breakdown: byTag.get(t.tag_id) || [] }));
}

// Lightweight count of distinct tags used in `monthKey` (or all-time). Powers
// the Hub gating ("Top tags" row only when ≥ 1 tag is in use) without running
// the full aggregate.
export async function activeTagCount(monthKey = null) {
  const monthClause = monthKey ? 'AND e.month_key = ?' : '';
  const params = monthKey ? [monthKey] : [];
  const row = await one(
    `SELECT COUNT(DISTINCT et.tag_id) AS n
       FROM expense_tags et
       JOIN tags t     ON t.id = et.tag_id
       JOIN expenses e ON e.id = et.expense_id
      WHERE ${NOT_DELETED_T} AND ${NOT_DELETED_E} AND ${NOT_PENDING_E}
        ${monthClause}`,
    params,
  );
  return row?.n || 0;
}

import { exec, all, one, getDB } from '../../db';

// 7.9 — People + expense splits repo.
//
// Two related tables:
//   - people:         small reference table, one row per friend/colleague.
//   - expense_splits: M:N join — when the user pays for a shared expense,
//                     one row per (expense, person) records the share owed.
//
// The user is the implicit "payer" — there is no payer_id column. Every
// split row therefore represents money that the person owes the user.
// Balance per person = SUM of their split amounts across all live expenses.
//
// `setForExpense(expenseId, splits)` is the bulk write entry point — used by
// EditExpense's splits surface. Diffs desired-vs-existing in a transaction:
// INSERTs new rows, DELETEs missing rows, UPDATEs amount changes.

export const peopleRepo = {
  async listLive() {
    return all(
      `SELECT * FROM people
        WHERE deleted_at IS NULL
        ORDER BY name COLLATE NOCASE ASC`
    );
  },

  async get(id) {
    return one('SELECT * FROM people WHERE id = ?', [id]);
  },

  async findByNameLive(name) {
    if (!name) return null;
    return one(
      `SELECT * FROM people
        WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE`,
      [name]
    );
  },

  async create({ name, emoji = '👤', color = '#888', notes = null }) {
    if (!name) throw new Error('peopleRepo.create: name required');
    const res = await exec(
      `INSERT INTO people (name, emoji, color, notes)
       VALUES (?, ?, ?, ?)`,
      [name, emoji, color, notes]
    );
    return this.get(res.lastInsertRowId);
  },

  async getOrCreate({ name, emoji, color }) {
    const existing = await this.findByNameLive(name);
    if (existing) return existing;
    return this.create({ name, emoji, color });
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      `UPDATE people SET name = ?, emoji = ?, color = ?, notes = ? WHERE id = ?`,
      [next.name, next.emoji || '👤', next.color || '#888', next.notes ?? null, id]
    );
    return this.get(id);
  },

  async remove(id) {
    await exec(
      `UPDATE people SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
  },

  async restore(id) {
    await exec('UPDATE people SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

export const splitsRepo = {
  // Return rows: [{ id, person_id, amount, person_name, person_emoji, person_color }]
  async listForExpense(expenseId) {
    if (expenseId == null) return [];
    return all(
      `SELECT s.id, s.person_id, s.amount, s.created_at,
              p.name  AS person_name,
              p.emoji AS person_emoji,
              p.color AS person_color,
              p.deleted_at AS person_deleted_at
         FROM expense_splits s
    LEFT JOIN people p ON p.id = s.person_id
        WHERE s.expense_id = ?
     ORDER BY p.name COLLATE NOCASE ASC`,
      [expenseId]
    );
  },

  // Per-person balance roll-up. Live people only; soft-deleted expenses excluded
  // (LEFT JOIN + AND e.deleted_at IS NULL so a person with no splits still
  // appears with balance=0).
  async balancesByPerson() {
    return all(
      `SELECT p.id, p.name, p.emoji, p.color,
              COALESCE(SUM(CASE WHEN e.deleted_at IS NULL THEN s.amount ELSE 0 END), 0) AS owed,
              COUNT(CASE WHEN e.deleted_at IS NULL THEN s.id ELSE NULL END) AS split_count
         FROM people p
    LEFT JOIN expense_splits s ON s.person_id = p.id
    LEFT JOIN expenses e ON e.id = s.expense_id
        WHERE p.deleted_at IS NULL
     GROUP BY p.id, p.name, p.emoji, p.color
     ORDER BY owed DESC, p.name COLLATE NOCASE ASC`
    );
  },

  async expensesForPerson(personId, { limit = 50 } = {}) {
    if (personId == null) return [];
    return all(
      `SELECT e.id, e.merchant, e.expense_date, e.amount AS expense_total,
              s.amount AS share, s.id AS split_id
         FROM expense_splits s
         JOIN expenses e ON e.id = s.expense_id
        WHERE s.person_id = ?
          AND e.deleted_at IS NULL
     ORDER BY e.expense_date DESC, e.created_at DESC
        LIMIT ?`,
      [personId, limit]
    );
  },

  // Bulk diff-and-write for the EditExpense splits surface.
  // `desired` is an array of {person_id, amount}. Removes splits not in the
  // desired set, inserts new ones, updates amounts where they changed.
  // Runs in a single transaction so a partial failure rolls back the lot.
  async setForExpense(expenseId, desired) {
    if (expenseId == null) throw new Error('splitsRepo.setForExpense: expenseId required');
    const want = Array.isArray(desired) ? desired : [];
    // Validate before opening a transaction.
    for (const d of want) {
      if (d?.person_id == null) throw new Error('splitsRepo.setForExpense: every entry needs person_id');
      const a = Number(d?.amount);
      if (!Number.isFinite(a) || a <= 0) {
        throw new Error('splitsRepo.setForExpense: every entry needs amount > 0');
      }
    }
    const existing = await this.listForExpense(expenseId);
    const wantByPid = new Map(want.map(d => [d.person_id, Number(d.amount)]));
    const haveByPid = new Map(existing.map(r => [r.person_id, { id: r.id, amount: Number(r.amount) }]));

    const db = await getDB();
    await db.withTransactionAsync(async () => {
      // DELETE rows that are not in desired.
      for (const [pid, row] of haveByPid) {
        if (!wantByPid.has(pid)) {
          await db.runAsync(`DELETE FROM expense_splits WHERE id = ?`, [row.id]);
        }
      }
      // INSERT or UPDATE for desired.
      for (const [pid, amount] of wantByPid) {
        const had = haveByPid.get(pid);
        if (!had) {
          await db.runAsync(
            `INSERT INTO expense_splits (expense_id, person_id, amount) VALUES (?, ?, ?)`,
            [expenseId, pid, amount]
          );
        } else if (had.amount !== amount) {
          await db.runAsync(
            `UPDATE expense_splits SET amount = ? WHERE id = ?`,
            [amount, had.id]
          );
        }
      }
    });
    return this.listForExpense(expenseId);
  },

  async clearForExpense(expenseId) {
    if (expenseId == null) return;
    await exec(`DELETE FROM expense_splits WHERE expense_id = ?`, [expenseId]);
  },
};

// Pure-function helper for the "split equally" UI shortcut. Splits `total`
// across `count` ways with paise-residue routed to the first share so the
// sum is exactly `total` (in `precision`-decimal). Returns array of amounts
// length === count. count <= 0 returns [].
export function splitEqually(total, count, precision = 2) {
  if (!(count > 0)) return [];
  const t = Number(total) || 0;
  const factor = Math.pow(10, precision);
  const totalCents = Math.round(t * factor);
  const base = Math.floor(totalCents / count);
  const residue = totalCents - base * count;
  const out = new Array(count).fill(base);
  for (let i = 0; i < residue; i += 1) out[i] += 1;
  return out.map(c => c / factor);
}

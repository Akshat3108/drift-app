import { exec, all, one, getDB } from '../../db';
import { NOT_DELETED } from '../../db/predicates';

export const trips = {
  async list() {
    return all(`SELECT * FROM trips WHERE ${NOT_DELETED} ORDER BY start_date IS NULL, start_date, id`);
  },
  async get(id) {
    const t = await one(`SELECT * FROM trips WHERE id = ? AND ${NOT_DELETED}`, [id]);
    if (!t) return null;
    t.categories = await all('SELECT * FROM trip_categories WHERE trip_id = ? ORDER BY id', [id]);
    return t;
  },
  async listWithCategories() {
    // 3.18 — collapsed from N+1 (1 trips query + N trip_categories queries) to
    // a single LEFT JOIN. Grouping happens in JS; ORDER BY mirrors the previous
    // contract (trips by start_date NULLS LAST then id; categories by id).
    // 2.D.09 — trips gained deleted_at in v25; filter live rows only.
    const rows = await all(
      `SELECT t.id AS t_id, t.name, t.destination, t.start_date, t.end_date,
              t.budget, t.home_currency, t.dest_currency, t.dest_rate, t.notes,
              t.created_at,
              tc.id AS tc_id, tc.label AS tc_label, tc.emoji AS tc_emoji,
              tc.amount AS tc_amount
       FROM trips t
       LEFT JOIN trip_categories tc ON tc.trip_id = t.id
       WHERE t.deleted_at IS NULL
       ORDER BY t.start_date IS NULL, t.start_date, t.id, tc.id`
    );
    const byId = new Map();
    const order = [];
    for (const r of rows) {
      let trip = byId.get(r.t_id);
      if (!trip) {
        trip = {
          id: r.t_id,
          name: r.name,
          destination: r.destination,
          start_date: r.start_date,
          end_date: r.end_date,
          budget: r.budget,
          home_currency: r.home_currency,
          dest_currency: r.dest_currency,
          dest_rate: r.dest_rate,
          notes: r.notes,
          created_at: r.created_at,
          categories: [],
        };
        byId.set(r.t_id, trip);
        order.push(trip);
      }
      if (r.tc_id !== null) {
        trip.categories.push({
          id: r.tc_id,
          trip_id: r.t_id,
          label: r.tc_label,
          emoji: r.tc_emoji,
          amount: r.tc_amount,
        });
      }
    }
    return order;
  },
  async next() {
    const today = new Date().toISOString().slice(0, 10);
    return one(
      `SELECT * FROM trips
       WHERE deleted_at IS NULL AND (end_date IS NULL OR end_date >= ?)
       ORDER BY start_date IS NULL, start_date, id
       LIMIT 1`,
      [today]
    );
  },
  async create({ name, destination, start_date, end_date, budget = 0, home_currency = 'INR', dest_currency = 'USD', dest_rate = 1, notes, categories = [] }) {
    const db = await getDB();
    let newId = null;
    await db.withTransactionAsync(async () => {
      const res = await db.runAsync(
        `INSERT INTO trips (name, destination, start_date, end_date, budget, home_currency, dest_currency, dest_rate, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, destination ?? null, start_date ?? null, end_date ?? null, budget, home_currency, dest_currency, dest_rate, notes ?? null]
      );
      newId = res.lastInsertRowId;
      for (const c of categories) {
        await db.runAsync(
          'INSERT INTO trip_categories (trip_id, label, emoji, amount) VALUES (?, ?, ?, ?)',
          [newId, c.label, c.emoji || '🧳', c.amount || 0]
        );
      }
    });
    return this.get(newId);
  },
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE trips SET name=?, destination=?, start_date=?, end_date=?, budget=?,
         home_currency=?, dest_currency=?, dest_rate=?, notes=? WHERE id=?`,
        [next.name, next.destination ?? null, next.start_date ?? null, next.end_date ?? null,
         next.budget, next.home_currency, next.dest_currency, next.dest_rate, next.notes ?? null, id]
      );
      if (patch.categories) {
        await db.runAsync('DELETE FROM trip_categories WHERE trip_id = ?', [id]);
        for (const c of patch.categories) {
          await db.runAsync(
            'INSERT INTO trip_categories (trip_id, label, emoji, amount) VALUES (?, ?, ?, ?)',
            [id, c.label, c.emoji || '🧳', c.amount || 0]
          );
        }
      }
    });
    return this.get(id);
  },
  async remove(id) {
    await exec(`UPDATE trips SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`, [id]);
  },
  async restore(id) {
    await exec('UPDATE trips SET deleted_at = NULL WHERE id = ?', [id]);
  },
};

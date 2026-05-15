import { exec, all, one, getDB } from '../index';

export const trips = {
  async list() {
    return all('SELECT * FROM trips ORDER BY start_date IS NULL, start_date, id');
  },
  async get(id) {
    const t = await one('SELECT * FROM trips WHERE id = ?', [id]);
    if (!t) return null;
    t.categories = await all('SELECT * FROM trip_categories WHERE trip_id = ? ORDER BY id', [id]);
    return t;
  },
  async listWithCategories() {
    const list = await this.list();
    for (const t of list) {
      t.categories = await all('SELECT * FROM trip_categories WHERE trip_id = ? ORDER BY id', [t.id]);
    }
    return list;
  },
  async next() {
    const today = new Date().toISOString().slice(0, 10);
    return one(
      `SELECT * FROM trips
       WHERE end_date IS NULL OR end_date >= ?
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
    await exec('DELETE FROM trips WHERE id = ?', [id]);
  },
};

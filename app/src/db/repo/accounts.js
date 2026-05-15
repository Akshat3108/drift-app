import { exec, all, one } from '../index';

export const accounts = {
  async list() {
    return all('SELECT * FROM accounts ORDER BY kind, id');
  },
  async get(id) {
    return one('SELECT * FROM accounts WHERE id = ?', [id]);
  },
  async create({ kind, label, emoji = '💼', balance = 0, category }) {
    const res = await exec(
      'INSERT INTO accounts (kind, label, emoji, balance, category) VALUES (?, ?, ?, ?, ?)',
      [kind, label, emoji, balance, category ?? null]
    );
    return this.get(res.lastInsertRowId);
  },
  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await exec(
      'UPDATE accounts SET kind=?, label=?, emoji=?, balance=?, category=? WHERE id=?',
      [next.kind, next.label, next.emoji, next.balance, next.category ?? null, id]
    );
    return this.get(id);
  },
  async remove(id) {
    await exec('DELETE FROM accounts WHERE id = ?', [id]);
  },
  async netWorth() {
    const row = await one(`
      SELECT
        COALESCE(SUM(CASE WHEN kind='asset' THEN balance ELSE 0 END), 0) AS assets,
        COALESCE(SUM(CASE WHEN kind='liability' THEN balance ELSE 0 END), 0) AS liabilities
      FROM accounts
    `);
    return {
      assets: row?.assets || 0,
      liabilities: row?.liabilities || 0,
      net: (row?.assets || 0) - (row?.liabilities || 0),
    };
  },
};

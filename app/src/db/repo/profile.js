import { exec, one } from '../index';

export const profile = {
  async get() {
    return one('SELECT * FROM profile WHERE id = 1');
  },
  async create({ name, avatar = 'U' }) {
    await exec(
      'INSERT OR REPLACE INTO profile (id, name, avatar) VALUES (1, ?, ?)',
      [name, avatar]
    );
    return this.get();
  },
  async update({ name, avatar }) {
    const cur = await this.get();
    if (!cur) return null;
    await exec(
      'UPDATE profile SET name = ?, avatar = ? WHERE id = 1',
      [name ?? cur.name, avatar ?? cur.avatar]
    );
    return this.get();
  },
};

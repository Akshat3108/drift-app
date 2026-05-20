import { exec, one } from '../../db';
import { MAX_RECENT_SEARCHES } from '@features/expenses/search';

// JSON-round-trip helper. Tolerates a NULL column (fresh post-migration row)
// or a corrupt payload (returns []) so the Search screen never crashes the
// app over a parse error.
function parseRecent(json) {
  if (json == null) return [];
  try {
    const v = JSON.parse(String(json));
    return Array.isArray(v)
      ? v.filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch (_e) {
    return [];
  }
}

export const profile = {
  async get() {
    const row = await one('SELECT * FROM profile WHERE id = 1');
    if (!row) return row;
    // Surface a normalised array so consumers don't have to JSON.parse.
    return { ...row, recent_searches: parseRecent(row.recent_searches) };
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

  // 5.2 — recent searches. Stored as a JSON array of strings on profile.
  async getRecentSearches() {
    const row = await one('SELECT recent_searches FROM profile WHERE id = 1');
    return parseRecent(row?.recent_searches);
  },
  async setRecentSearches(list) {
    const arr = Array.isArray(list) ? list.slice(0, MAX_RECENT_SEARCHES) : [];
    await exec(
      'UPDATE profile SET recent_searches = ? WHERE id = 1',
      [JSON.stringify(arr)]
    );
    return arr;
  },
  async clearRecentSearches() {
    await exec('UPDATE profile SET recent_searches = NULL WHERE id = 1');
    return [];
  },
};

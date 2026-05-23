import { exec, all, one } from '../../db';

// notification_log is local-only audit + dedupe storage. It is written by:
//   - checkers.js (after a checker decides a notification should fire)
//   - scheduler.js (writes scheduled_for at schedule time; later updates
//     delivered_at when expo-notifications surfaces the response handler)
// dedupe_key is a stable string keyed per-kind (see checkers.js for the format)
// and is guarded by a UNIQUE WHERE NOT NULL index — inserts with a duplicate
// key throw a SQLite constraint error, which the caller catches and treats as
// "already fired, skip".

function parsePayload(row) {
  if (!row) return row;
  let payload = null;
  if (row.payload_json) {
    try { payload = JSON.parse(row.payload_json); } catch { payload = null; }
  }
  return { ...row, payload };
}

export const notificationsRepo = {
  async list({ limit = 100 } = {}) {
    const rows = await all(
      'SELECT * FROM notification_log ORDER BY created_at DESC, id DESC LIMIT ?',
      [limit]
    );
    return rows.map(parsePayload);
  },
  async listUnread({ limit = 100 } = {}) {
    const rows = await all(
      'SELECT * FROM notification_log WHERE read_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?',
      [limit]
    );
    return rows.map(parsePayload);
  },
  async unreadCount() {
    const row = await one('SELECT COUNT(*) AS n FROM notification_log WHERE read_at IS NULL');
    return row?.n || 0;
  },
  async get(id) {
    const row = await one('SELECT * FROM notification_log WHERE id = ?', [id]);
    return parsePayload(row);
  },
  async getByDedupe(dedupe_key) {
    if (!dedupe_key) return null;
    const row = await one('SELECT * FROM notification_log WHERE dedupe_key = ?', [dedupe_key]);
    return parsePayload(row);
  },
  async log({ kind, title, body, payload = null, scheduled_for = null, dedupe_key = null }) {
    const payload_json = payload ? JSON.stringify(payload) : null;
    try {
      const res = await exec(
        `INSERT INTO notification_log (kind, title, body, payload_json, scheduled_for, dedupe_key)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [kind, title, body, payload_json, scheduled_for, dedupe_key]
      );
      return this.get(res.lastInsertRowId);
    } catch (e) {
      // Dedupe collision is expected on re-evaluation; surface as null so callers
      // can treat it as "already logged" without try/catch noise.
      if (/UNIQUE constraint failed/i.test(e?.message || '')) return null;
      throw e;
    }
  },
  async markDelivered(id) {
    await exec(`UPDATE notification_log SET delivered_at = datetime('now') WHERE id = ?`, [id]);
  },
  async markRead(id) {
    await exec(`UPDATE notification_log SET read_at = datetime('now') WHERE id = ?`, [id]);
  },
  async markAllRead() {
    await exec(`UPDATE notification_log SET read_at = datetime('now') WHERE read_at IS NULL`);
  },
};

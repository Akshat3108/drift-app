// 8.10 — Maintenance task: trim db_slow_log to the last 500 rows.
//
// db_stats aggregate counters are bounded by the number of distinct SQL
// labels (typically < 50) so they need no trim. db_slow_log can grow
// without bound in long dev sessions — keep only the most recent 500.

const KEEP_ROWS = 500;

export default {
  name: 'trimDbStats',
  async run({ db }) {
    const before = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM db_slow_log`);
    const total = before?.n ?? 0;
    if (total <= KEEP_ROWS) return { kept: total, deleted: 0 };
    await db.runAsync(
      `DELETE FROM db_slow_log WHERE id IN (
         SELECT id FROM db_slow_log ORDER BY id ASC LIMIT ?
       )`,
      [total - KEEP_ROWS]
    );
    return { kept: KEEP_ROWS, deleted: total - KEEP_ROWS };
  },
};

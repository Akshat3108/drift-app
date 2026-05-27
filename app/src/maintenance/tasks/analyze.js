// 8.7 — Maintenance task: SQLite ANALYZE.
//
// Refreshes the query planner's stats so future SELECTs pick the best
// index. Cheap insurance after a heavy write batch (CSV import, bulk
// delete, factory reset undo). Sub-200ms on a 100k-row DB with the
// QW-05 PRAGMAs (mmap_size, cache_size).

export default {
  name: 'analyze',
  async run({ db }) {
    await db.execAsync('ANALYZE;');
    return { ok: true };
  },
};

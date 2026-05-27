// PS-19 — Seed test #1: monthly_summary rollup stays consistent across
// insert / update / soft-delete on `expenses`.
//
// Runs against `node:sqlite` (in-memory) so we don't need expo-sqlite or
// a device. The V1+V2+V3+V12 SQL is extracted from `src/db/schema.js` at
// test time so the test follows whatever the canonical schema does — no
// duplicate SQL to drift.

const { DatabaseSync } = require('node:sqlite');
const { readFileSync } = require('node:fs');
const path = require('node:path');

function extractConst(src, name) {
  const re = new RegExp(`const ${name} = \\\`([\\s\\S]*?)\\\`;`);
  const m = re.exec(src);
  if (!m) throw new Error(`Could not locate ${name}`);
  return m[1];
}

function buildDb() {
  const schemaSrc = readFileSync(
    path.resolve(__dirname, '..', '..', 'src', 'db', 'schema.js'),
    'utf8'
  );
  const V1  = extractConst(schemaSrc, 'V1_SQL');
  const V2  = extractConst(schemaSrc, 'V2_SQL');
  const V3  = extractConst(schemaSrc, 'V3_SQL');
  const V12 = extractConst(schemaSrc, 'V12_SQL');
  const db = new DatabaseSync(':memory:');
  db.exec(V1 + '\n' + V2 + '\n' + V3 + '\n' + V12);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

describe('monthly_summary triggers', () => {
  test('insert + update + soft-delete keep monthly_summary consistent', () => {
    const db = buildDb();

    // Seed a category so expenses.category_id has a target.
    db.prepare(`INSERT INTO categories (name, emoji, budget) VALUES ('Food', '🍔', 10000)`).run();
    const catId = db.prepare(`SELECT last_insert_rowid() AS id`).get().id;

    // Insert two expenses in May 2026.
    db.prepare(`INSERT INTO expenses (category_id, merchant, amount, expense_date) VALUES (?, 'A', 500, '2026-05-01')`).run(catId);
    db.prepare(`INSERT INTO expenses (category_id, merchant, amount, expense_date) VALUES (?, 'B', 300, '2026-05-10')`).run(catId);

    let row = db.prepare(`SELECT total, txn_count FROM monthly_summary WHERE month_key = '2026-05' AND category_id = ?`).get(catId);
    expect(row).toBeDefined();
    expect(row.total).toBe(800);
    expect(row.txn_count).toBe(2);

    // Update one expense's amount: 500 → 700.
    db.prepare(`UPDATE expenses SET amount = 700 WHERE merchant = 'A'`).run();
    row = db.prepare(`SELECT total, txn_count FROM monthly_summary WHERE month_key = '2026-05' AND category_id = ?`).get(catId);
    expect(row.total).toBe(1000);
    expect(row.txn_count).toBe(2);

    // Soft-delete one expense via UPDATE (sets deleted_at). The AU trigger
    // should subtract it from the rollup (the v12 schema treats soft-delete
    // as the "deleted" state for monthly_summary).
    db.prepare(`UPDATE expenses SET deleted_at = datetime('now') WHERE merchant = 'B'`).run();
    row = db.prepare(`SELECT total, txn_count FROM monthly_summary WHERE month_key = '2026-05' AND category_id = ?`).get(catId);
    expect(row.total).toBe(700);
    expect(row.txn_count).toBe(1);

    // Restore the soft-deleted row → it re-enters the rollup.
    db.prepare(`UPDATE expenses SET deleted_at = NULL WHERE merchant = 'B'`).run();
    row = db.prepare(`SELECT total, txn_count FROM monthly_summary WHERE month_key = '2026-05' AND category_id = ?`).get(catId);
    expect(row.total).toBe(1000);
    expect(row.txn_count).toBe(2);

    db.close();
  });
});

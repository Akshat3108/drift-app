// Migration v1 — bakes the schema as it existed before the migration runner landed.
// PRAGMA foreign_keys is intentionally NOT here (per-connection PRAGMA, set at open
// time in db/index.js). Subsequent versions land as additive ALTER TABLE migrations
// appended to the `migrations` array — never edit v1 retroactively.
const V1_SQL = `
CREATE TABLE IF NOT EXISTS profile (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  name        TEXT NOT NULL,
  avatar      TEXT NOT NULL DEFAULT 'U',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  currency        TEXT NOT NULL DEFAULT 'INR',
  dark_mode       INTEGER NOT NULL DEFAULT 0,
  carbon_tracking INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '💰',
  budget      REAL NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT 'cream',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  merchant     TEXT NOT NULL,
  amount       REAL NOT NULL,
  mood         TEXT,
  carbon       REAL NOT NULL DEFAULT 0,
  recurring    INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  receipt_uri  TEXT,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_exp_cat_date ON expenses(category_id, expense_date DESC);

CREATE TABLE IF NOT EXISTS receipt_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id      INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'other',
  qty             REAL NOT NULL DEFAULT 1,
  unit            TEXT NOT NULL DEFAULT 'pcs',
  canonical_qty   REAL NOT NULL DEFAULT 1,
  canonical_unit  TEXT NOT NULL DEFAULT 'pcs',
  unit_price      REAL NOT NULL DEFAULT 0,
  price           REAL NOT NULL DEFAULT 0,
  purchase_date   TEXT NOT NULL DEFAULT (date('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_name_date ON receipt_items(normalized_name, purchase_date);
CREATE INDEX IF NOT EXISTS idx_items_kind_date ON receipt_items(kind, purchase_date);
CREATE INDEX IF NOT EXISTS idx_items_expense ON receipt_items(expense_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  amount      REAL NOT NULL,
  period      TEXT NOT NULL DEFAULT 'mo',
  used_freq   TEXT,
  verdict     TEXT NOT NULL DEFAULT 'keep',
  icon        TEXT NOT NULL DEFAULT '📦',
  color       TEXT NOT NULL DEFAULT '#888',
  cancelled   INTEGER NOT NULL DEFAULT 0,
  next_bill   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '🎯',
  target_amount REAL NOT NULL,
  saved_amount  REAL NOT NULL DEFAULT 0,
  eta           TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('asset','liability')),
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '💼',
  balance     REAL NOT NULL DEFAULT 0,
  category    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  destination   TEXT,
  start_date    TEXT,
  end_date      TEXT,
  budget        REAL NOT NULL DEFAULT 0,
  home_currency TEXT NOT NULL DEFAULT 'INR',
  dest_currency TEXT NOT NULL DEFAULT 'USD',
  dest_rate     REAL NOT NULL DEFAULT 1,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id   INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  emoji     TEXT NOT NULL DEFAULT '🧳',
  amount    REAL NOT NULL DEFAULT 0
);
`;

// v2 — soft delete columns on every mutable user-owned table. Repos do not yet
// filter on deleted_at; that work lands with the soft-delete predicate helper
// (1.C.20) and the repo rewrites in 3.15. Until then this is inert.
const V2_SQL = `
ALTER TABLE expenses       ADD COLUMN deleted_at TEXT;
ALTER TABLE receipt_items  ADD COLUMN deleted_at TEXT;
ALTER TABLE categories     ADD COLUMN deleted_at TEXT;
ALTER TABLE accounts       ADD COLUMN deleted_at TEXT;
ALTER TABLE subscriptions  ADD COLUMN deleted_at TEXT;
ALTER TABLE goals          ADD COLUMN deleted_at TEXT;
`;

// v3 — month_key generated columns + supporting indexes. VIRTUAL (computed on
// read) so existing rows are not rewritten and the migration is O(1). Indexes
// on VIRTUAL generated columns are supported in SQLite >= 3.31; Expo SDK 54
// ships 3.45+.
const V3_SQL = `
ALTER TABLE expenses      ADD COLUMN month_key TEXT
  GENERATED ALWAYS AS (substr(expense_date,1,7)) VIRTUAL;
ALTER TABLE receipt_items ADD COLUMN month_key TEXT
  GENERATED ALWAYS AS (substr(purchase_date,1,7)) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_exp_month     ON expenses(month_key);
CREATE INDEX IF NOT EXISTS idx_exp_month_cat ON expenses(month_key, category_id);
CREATE INDEX IF NOT EXISTS idx_items_month   ON receipt_items(month_key);
`;

// v4 — merchants lookup table + expenses.merchant_id FK. Minimal v1 shape
// (id/name/canonical_name/created_at). Resolution + auto-link logic lives in
// 4.15 (Phase 2 OCR). Existing expenses keep merchant_id NULL until then.
const V4_SQL = `
CREATE TABLE IF NOT EXISTS merchants (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_canonical
  ON merchants(canonical_name COLLATE NOCASE);
ALTER TABLE expenses ADD COLUMN merchant_id INTEGER
  REFERENCES merchants(id) ON DELETE SET NULL;
`;

// v5 — products lookup + FTS5 shadow + receipt_items.product_id FK. FTS sync
// triggers are deferred to 3.13 (item_fts); products_fts here is a contentless
// FTS5 table that 3.13's work can either reuse or replace.
const V5_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_name
  ON products(canonical_name COLLATE NOCASE);
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, canonical_name, content='products', content_rowid='id'
);
ALTER TABLE receipt_items ADD COLUMN product_id INTEGER
  REFERENCES products(id) ON DELETE SET NULL;
`;

// v6 — expense multi-context FKs + currency columns. All nullable; existing
// rows stay NULL and the app falls back to settings.currency at read time.
// Partial indexes (WHERE NOT NULL) keep the index small until population grows.
const V6_SQL = `
ALTER TABLE expenses ADD COLUMN account_id      INTEGER
  REFERENCES accounts(id)      ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN trip_id         INTEGER
  REFERENCES trips(id)         ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN subscription_id INTEGER
  REFERENCES subscriptions(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN currency    TEXT;
ALTER TABLE expenses ADD COLUMN amount_home REAL;
ALTER TABLE expenses ADD COLUMN fx_rate     REAL;
CREATE INDEX IF NOT EXISTS idx_expenses_account
  ON expenses(account_id)      WHERE account_id      IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_trip
  ON expenses(trip_id)         WHERE trip_id         IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_sub
  ON expenses(subscription_id) WHERE subscription_id IS NOT NULL;
`;

// v7 — permanent receipt metadata. receipt_uri (v1) is volatile (cache URI);
// the image-pipeline work in 5.12/5.15/8.6 copies into permanent storage and
// populates these columns. receipt_bytes is file size; hashes are hex strings.
const V7_SQL = `
ALTER TABLE expenses ADD COLUMN receipt_path      TEXT;
ALTER TABLE expenses ADD COLUMN receipt_thumb     TEXT;
ALTER TABLE expenses ADD COLUMN receipt_bytes     INTEGER;
ALTER TABLE expenses ADD COLUMN receipt_hash      TEXT;
ALTER TABLE expenses ADD COLUMN receipt_soft_hash TEXT;
`;

// v8 — account_transactions ledger. expense_id is a nullable link back to the
// originating expense for drill-through; ON DELETE SET NULL so deleting the
// expense doesn't lose the ledger entry.
const V8_SQL = `
CREATE TABLE IF NOT EXISTS account_transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount     REAL    NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('debit','credit')),
  txn_date   TEXT    NOT NULL DEFAULT (date('now')),
  note       TEXT,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acctxn_account_date
  ON account_transactions(account_id, txn_date DESC);
`;

// v9 — goal_contributions ledger. Mirrors account_transactions shape; same
// rationale for the nullable expense_id link.
const V9_SQL = `
CREATE TABLE IF NOT EXISTS goal_contributions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id        INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  amount         REAL    NOT NULL,
  contributed_at TEXT    NOT NULL DEFAULT (date('now')),
  note           TEXT,
  expense_id     INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal
  ON goal_contributions(goal_id);
`;

// v10 — subscriptions table rebuild. Adds CHECK on verdict (which requires
// CREATE-NEW + INSERT + DROP + RENAME because SQLite has no ADD CONSTRAINT)
// plus three new columns. Runs `transactionless` because expenses.subscription_id
// (added in v6) is a FK pointing at this table — DROP TABLE fails unless we
// toggle PRAGMA foreign_keys, which can only happen outside a transaction.
// Existing verdict values outside the enum are coerced to 'keep' during the
// INSERT … SELECT.
async function v10Up(db) {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.execAsync(`
      BEGIN;
      DROP TABLE IF EXISTS subscriptions_new;
      CREATE TABLE subscriptions_new (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        name               TEXT NOT NULL,
        amount             REAL NOT NULL,
        period             TEXT NOT NULL DEFAULT 'mo',
        used_freq          TEXT,
        verdict            TEXT NOT NULL DEFAULT 'keep'
                             CHECK (verdict IN ('keep','cancel','review')),
        icon               TEXT NOT NULL DEFAULT '📦',
        color              TEXT NOT NULL DEFAULT '#888',
        cancelled          INTEGER NOT NULL DEFAULT 0,
        next_bill          TEXT,
        created_at         TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at         TEXT,
        cancelled_at       TEXT,
        linked_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        currency           TEXT
      );
      INSERT INTO subscriptions_new
        (id, name, amount, period, used_freq, verdict, icon, color, cancelled,
         next_bill, created_at, deleted_at, cancelled_at, linked_category_id, currency)
      SELECT
        id, name, amount, period, used_freq,
        CASE WHEN verdict IN ('keep','cancel','review') THEN verdict ELSE 'keep' END,
        icon, color, cancelled, next_bill, created_at, deleted_at,
        NULL, NULL, NULL
      FROM subscriptions;
      DROP TABLE subscriptions;
      ALTER TABLE subscriptions_new RENAME TO subscriptions;
      CREATE INDEX IF NOT EXISTS idx_subs_next_bill ON subscriptions(next_bill);
      COMMIT;
    `);
  } catch (e) {
    try { await db.execAsync('ROLLBACK;'); } catch (_) {}
    throw e;
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

// v11 — categories.budget_period with CHECK + default. ADD COLUMN with a
// constant DEFAULT is allowed in SQLite without a rebuild; the CHECK applies
// from the moment the column exists.
const V11_SQL = `
ALTER TABLE categories ADD COLUMN budget_period TEXT NOT NULL DEFAULT 'month'
  CHECK (budget_period IN ('month','week','year'));
`;

// v12 — rollup tables + maintenance triggers.
// - monthly_summary holds (month_key, category_id) → (total, txn_count). category_id
//   is NOT NULL with a `0` sentinel for "uncategorised" (no real category has id 0;
//   AUTOINCREMENT starts at 1). This avoids SQLite's NULL-in-PRIMARY-KEY quirk
//   where multiple NULLs would collide.
// - item_summary stores the invariants needed by trackedItems() and suggest():
//   display_name + kind + canonical_unit + last_* fields + points_count, keyed by
//   normalized_name.
// - 6 triggers maintain the rollups. All AI/AD triggers gate on `deleted_at IS NULL`
//   so soft-deleted rows never contribute. AU triggers do (-OLD if OLD live)
//   + (+NEW if NEW live), correctly handling the 9 transitions of
//   category_id × month_key × deleted_at.
// - item_summary AU/AD recompute last_* from the next most-recent live row via
//   UPDATE … FROM (SELECT … LIMIT 1) — supported in SQLite ≥ 3.33 (Expo 54 ships 3.45+).
const V12_SQL = `
CREATE TABLE IF NOT EXISTS monthly_summary (
  month_key   TEXT    NOT NULL,
  category_id INTEGER NOT NULL DEFAULT 0,
  total       REAL    NOT NULL DEFAULT 0,
  txn_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month_key, category_id)
);

CREATE TABLE IF NOT EXISTS item_summary (
  normalized_name      TEXT PRIMARY KEY,
  display_name         TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  canonical_unit       TEXT NOT NULL,
  last_unit_price      REAL,
  last_qty             REAL,
  last_unit            TEXT,
  last_canonical_unit  TEXT,
  last_seen            TEXT,
  points_count         INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS trg_exp_ai AFTER INSERT ON expenses
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO monthly_summary (month_key, category_id, total, txn_count)
  VALUES (
    substr(NEW.expense_date, 1, 7),
    COALESCE(NEW.category_id, 0),
    NEW.amount,
    1
  )
  ON CONFLICT (month_key, category_id) DO UPDATE SET
    total     = monthly_summary.total     + excluded.total,
    txn_count = monthly_summary.txn_count + excluded.txn_count;
END;

CREATE TRIGGER IF NOT EXISTS trg_exp_ad AFTER DELETE ON expenses
WHEN OLD.deleted_at IS NULL
BEGIN
  UPDATE monthly_summary
     SET total     = total - OLD.amount,
         txn_count = txn_count - 1
   WHERE month_key   = substr(OLD.expense_date, 1, 7)
     AND category_id = COALESCE(OLD.category_id, 0);
END;

CREATE TRIGGER IF NOT EXISTS trg_exp_au AFTER UPDATE ON expenses
BEGIN
  UPDATE monthly_summary
     SET total     = total - OLD.amount,
         txn_count = txn_count - 1
   WHERE OLD.deleted_at IS NULL
     AND month_key   = substr(OLD.expense_date, 1, 7)
     AND category_id = COALESCE(OLD.category_id, 0);
  INSERT INTO monthly_summary (month_key, category_id, total, txn_count)
  SELECT
    substr(NEW.expense_date, 1, 7),
    COALESCE(NEW.category_id, 0),
    NEW.amount,
    1
  WHERE NEW.deleted_at IS NULL
  ON CONFLICT (month_key, category_id) DO UPDATE SET
    total     = monthly_summary.total     + excluded.total,
    txn_count = monthly_summary.txn_count + excluded.txn_count;
END;

CREATE TRIGGER IF NOT EXISTS trg_items_ai AFTER INSERT ON receipt_items
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO item_summary (
    normalized_name, display_name, kind, canonical_unit,
    last_unit_price, last_qty, last_unit, last_canonical_unit,
    last_seen, points_count
  )
  VALUES (
    NEW.normalized_name, NEW.name, NEW.kind, NEW.canonical_unit,
    NEW.unit_price, NEW.qty, NEW.unit, NEW.canonical_unit,
    NEW.purchase_date, 1
  )
  ON CONFLICT (normalized_name) DO UPDATE SET
    points_count        = item_summary.points_count + 1,
    display_name        = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.display_name        ELSE item_summary.display_name        END,
    kind                = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.kind                ELSE item_summary.kind                END,
    canonical_unit      = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.canonical_unit      ELSE item_summary.canonical_unit      END,
    last_unit_price     = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_unit_price     ELSE item_summary.last_unit_price     END,
    last_qty            = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_qty            ELSE item_summary.last_qty            END,
    last_unit           = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_unit           ELSE item_summary.last_unit           END,
    last_canonical_unit = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_canonical_unit ELSE item_summary.last_canonical_unit END,
    last_seen           = MAX(item_summary.last_seen, excluded.last_seen);
END;

CREATE TRIGGER IF NOT EXISTS trg_items_ad AFTER DELETE ON receipt_items
WHEN OLD.deleted_at IS NULL
BEGIN
  UPDATE item_summary
     SET points_count = points_count - 1
   WHERE normalized_name = OLD.normalized_name;
  DELETE FROM item_summary
   WHERE normalized_name = OLD.normalized_name
     AND points_count <= 0;
  UPDATE item_summary
     SET display_name        = r.name,
         kind                = r.kind,
         canonical_unit      = r.canonical_unit,
         last_unit_price     = r.unit_price,
         last_qty            = r.qty,
         last_unit           = r.unit,
         last_canonical_unit = r.canonical_unit,
         last_seen           = r.purchase_date
    FROM (
      SELECT name, kind, canonical_unit, unit_price, qty, unit, purchase_date
      FROM receipt_items
      WHERE normalized_name = OLD.normalized_name
        AND deleted_at IS NULL
      ORDER BY purchase_date DESC, id DESC
      LIMIT 1
    ) AS r
   WHERE item_summary.normalized_name = OLD.normalized_name;
END;

CREATE TRIGGER IF NOT EXISTS trg_items_au AFTER UPDATE ON receipt_items
BEGIN
  UPDATE item_summary
     SET points_count = points_count - 1
   WHERE OLD.deleted_at IS NULL
     AND normalized_name = OLD.normalized_name;
  DELETE FROM item_summary
   WHERE OLD.deleted_at IS NULL
     AND normalized_name = OLD.normalized_name
     AND points_count <= 0;
  UPDATE item_summary
     SET display_name        = r.name,
         kind                = r.kind,
         canonical_unit      = r.canonical_unit,
         last_unit_price     = r.unit_price,
         last_qty            = r.qty,
         last_unit           = r.unit,
         last_canonical_unit = r.canonical_unit,
         last_seen           = r.purchase_date
    FROM (
      SELECT name, kind, canonical_unit, unit_price, qty, unit, purchase_date
      FROM receipt_items
      WHERE normalized_name = OLD.normalized_name
        AND deleted_at IS NULL
      ORDER BY purchase_date DESC, id DESC
      LIMIT 1
    ) AS r
   WHERE OLD.deleted_at IS NULL
     AND item_summary.normalized_name = OLD.normalized_name;
  INSERT INTO item_summary (
    normalized_name, display_name, kind, canonical_unit,
    last_unit_price, last_qty, last_unit, last_canonical_unit,
    last_seen, points_count
  )
  SELECT
    NEW.normalized_name, NEW.name, NEW.kind, NEW.canonical_unit,
    NEW.unit_price, NEW.qty, NEW.unit, NEW.canonical_unit,
    NEW.purchase_date, 1
  WHERE NEW.deleted_at IS NULL
  ON CONFLICT (normalized_name) DO UPDATE SET
    points_count        = item_summary.points_count + 1,
    display_name        = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.display_name        ELSE item_summary.display_name        END,
    kind                = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.kind                ELSE item_summary.kind                END,
    canonical_unit      = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.canonical_unit      ELSE item_summary.canonical_unit      END,
    last_unit_price     = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_unit_price     ELSE item_summary.last_unit_price     END,
    last_qty            = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_qty            ELSE item_summary.last_qty            END,
    last_unit           = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_unit           ELSE item_summary.last_unit           END,
    last_canonical_unit = CASE WHEN excluded.last_seen >= item_summary.last_seen
                            THEN excluded.last_canonical_unit ELSE item_summary.last_canonical_unit END,
    last_seen           = MAX(item_summary.last_seen, excluded.last_seen);
END;
`;

// v13 — expense_fts (FTS5 over expenses.merchant + expenses.notes). External
// content table: data lives in `expenses`, FTS holds only the inverted index
// keyed by rowid=expenses.id. AI/AD/AU triggers gate on deleted_at so search
// excludes soft-deleted rows. AD uses the FTS5 'delete' command pattern.
const V13_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS expense_fts USING fts5(
  merchant, notes,
  content='expenses', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_expense_fts_ai AFTER INSERT ON expenses
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO expense_fts(rowid, merchant, notes)
  VALUES (NEW.id, NEW.merchant, COALESCE(NEW.notes, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_fts_ad AFTER DELETE ON expenses
WHEN OLD.deleted_at IS NULL
BEGIN
  INSERT INTO expense_fts(expense_fts, rowid, merchant, notes)
  VALUES ('delete', OLD.id, OLD.merchant, COALESCE(OLD.notes, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_expense_fts_au AFTER UPDATE ON expenses
BEGIN
  INSERT INTO expense_fts(expense_fts, rowid, merchant, notes)
  SELECT 'delete', OLD.id, OLD.merchant, COALESCE(OLD.notes, '')
  WHERE OLD.deleted_at IS NULL;
  INSERT INTO expense_fts(rowid, merchant, notes)
  SELECT NEW.id, NEW.merchant, COALESCE(NEW.notes, '')
  WHERE NEW.deleted_at IS NULL;
END;
`;

// v14 — item_fts (FTS5 over receipt_items.name + receipt_items.normalized_name).
// Same external-content pattern. products_fts (v5) is left untouched — different
// content table (products vs receipt_items), different purpose.
const V14_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS item_fts USING fts5(
  name, normalized_name,
  content='receipt_items', content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_item_fts_ai AFTER INSERT ON receipt_items
WHEN NEW.deleted_at IS NULL
BEGIN
  INSERT INTO item_fts(rowid, name, normalized_name)
  VALUES (NEW.id, NEW.name, NEW.normalized_name);
END;

CREATE TRIGGER IF NOT EXISTS trg_item_fts_ad AFTER DELETE ON receipt_items
WHEN OLD.deleted_at IS NULL
BEGIN
  INSERT INTO item_fts(item_fts, rowid, name, normalized_name)
  VALUES ('delete', OLD.id, OLD.name, OLD.normalized_name);
END;

CREATE TRIGGER IF NOT EXISTS trg_item_fts_au AFTER UPDATE ON receipt_items
BEGIN
  INSERT INTO item_fts(item_fts, rowid, name, normalized_name)
  SELECT 'delete', OLD.id, OLD.name, OLD.normalized_name
  WHERE OLD.deleted_at IS NULL;
  INSERT INTO item_fts(rowid, name, normalized_name)
  SELECT NEW.id, NEW.name, NEW.normalized_name
  WHERE NEW.deleted_at IS NULL;
END;
`;

// v15 — one-shot backfill of all four artefacts from existing live rows.
// Runs once on first launch after upgrade. No-op for fresh installs (base tables
// empty). Tolerant of re-application only in the sense that the migration runner
// already gates on schema_version — this body is NOT itself idempotent (would
// hit UNIQUE constraint on PK if re-run with data present).
const V15_SQL = `
INSERT INTO monthly_summary (month_key, category_id, total, txn_count)
SELECT substr(expense_date, 1, 7),
       COALESCE(category_id, 0),
       SUM(amount),
       COUNT(*)
FROM expenses
WHERE deleted_at IS NULL
GROUP BY substr(expense_date, 1, 7), COALESCE(category_id, 0);

INSERT INTO item_summary (
  normalized_name, display_name, kind, canonical_unit,
  last_unit_price, last_qty, last_unit, last_canonical_unit,
  last_seen, points_count
)
SELECT
  normalized_name,
  display_name,
  kind,
  canonical_unit,
  last_unit_price,
  last_qty,
  last_unit,
  last_canonical_unit,
  last_seen,
  points_count
FROM (
  SELECT
    normalized_name,
    FIRST_VALUE(name)           OVER w AS display_name,
    FIRST_VALUE(kind)           OVER w AS kind,
    FIRST_VALUE(canonical_unit) OVER w AS canonical_unit,
    FIRST_VALUE(unit_price)     OVER w AS last_unit_price,
    FIRST_VALUE(qty)            OVER w AS last_qty,
    FIRST_VALUE(unit)           OVER w AS last_unit,
    FIRST_VALUE(canonical_unit) OVER w AS last_canonical_unit,
    FIRST_VALUE(purchase_date)  OVER w AS last_seen,
    COUNT(*) OVER (PARTITION BY normalized_name) AS points_count,
    ROW_NUMBER() OVER w AS rn
  FROM receipt_items
  WHERE deleted_at IS NULL
  WINDOW w AS (PARTITION BY normalized_name ORDER BY purchase_date DESC, id DESC)
) AS ranked
WHERE rn = 1;

INSERT INTO expense_fts(rowid, merchant, notes)
SELECT id, merchant, COALESCE(notes, '')
FROM expenses
WHERE deleted_at IS NULL;

INSERT INTO item_fts(rowid, name, normalized_name)
SELECT id, name, normalized_name
FROM receipt_items
WHERE deleted_at IS NULL;
`;

// v16 — tax invoice fields. expenses gains the bill-level identifiers
// (gstin, invoice_number) and the three GST component amounts (cgst/sgst/igst);
// receipt_items gains per-row hsn. All nullable — populated only by the Scan
// flow today (manual Add/EditExpense doesn't surface these). Detail-screen
// UI is task 5.11; this migration just creates the persistence shape.
const V16_SQL = `
ALTER TABLE expenses      ADD COLUMN gstin          TEXT;
ALTER TABLE expenses      ADD COLUMN invoice_number TEXT;
ALTER TABLE expenses      ADD COLUMN cgst           REAL;
ALTER TABLE expenses      ADD COLUMN sgst           REAL;
ALTER TABLE expenses      ADD COLUMN igst           REAL;
ALTER TABLE receipt_items ADD COLUMN hsn            TEXT;
`;

// v17 — per-item GST rate columns. Bill-level amounts already live on expenses
// (v16). Per-item rates land on receipt_items so analytics can roll them up by
// product without re-parsing the bill. All nullable — when the parser can't
// disambiguate between CGST+SGST (intrastate) and IGST (interstate) for a bare
// "GST 5%" mention, it leaves all three NULL rather than guessing.
const V17_SQL = `
ALTER TABLE receipt_items ADD COLUMN cgst_rate REAL;
ALTER TABLE receipt_items ADD COLUMN sgst_rate REAL;
ALTER TABLE receipt_items ADD COLUMN igst_rate REAL;
`;

// v21 — saved_filters (5.3). One row per user-saved FilterSheet preset.
// `criteria` carries the JSON.stringify of the criteria object that the
// expenses-list WHERE-builder consumes; the table doesn't shred individual
// criteria axes into columns because this is a single-user app and there's
// no cross-row analytics over filter contents. The partial index on
// `updated_at DESC WHERE deleted_at IS NULL` keeps the "recent saved filters"
// surface cheap. `deleted_at` is reserved for the future Recycle Bin (the
// hard-DELETE path in savedFilters.repo is the v1 contract).
const V21_SQL = `
CREATE TABLE IF NOT EXISTS saved_filters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  criteria    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_saved_filters_updated
  ON saved_filters(updated_at DESC) WHERE deleted_at IS NULL;
`;

// v20 — recent searches surfaced on the profile row (5.2). Stored as a JSON
// array of up to MAX_RECENT_SEARCHES strings, newest-first. NULL = empty list.
// Lives on `profile` (a singleton row, id=1) so no new table is needed; the
// column reads/writes are O(1). Cleared by the Profile screen "Clear search
// history" row.
const V20_SQL = `
ALTER TABLE profile ADD COLUMN recent_searches TEXT;
`;

// v19 — pharmacy item metadata (4.23). batch_no, expiry_date and mfg_date
// land on receipt_items as nullable TEXT. Stored ISO YYYY-MM-DD for both
// dates so they sort/compare with `expense_date`. When OCR yields only
// month/year, expiry synthesises day = last-of-month and mfg synthesises
// day = first-of-month — best honest approximation of "the receipt printed
// month-precision". Index: none (no query plans on these yet; future expiry-
// reminder feature can add an index in its own migration).
const V19_SQL = `
ALTER TABLE receipt_items ADD COLUMN batch_no    TEXT;
ALTER TABLE receipt_items ADD COLUMN expiry_date TEXT;
ALTER TABLE receipt_items ADD COLUMN mfg_date    TEXT;
`;

// v23 — income table (5.5). Mirrors expenses' shape (soft-delete + month_key
// generated column + DESC index) so analytics queries can compose across the
// two without learning a second pattern. `category_id` deliberately absent —
// income is not bucketed into category pots in v1. `received_date` defaults
// to today; an EditIncome screen lives outside 5.5's scope (deferred).
// No rollup table this round — 5.6's denominator is `SELECT SUM(amount) FROM
// income WHERE month_key=?` which is bounded (single-user app, one row per
// salary/freelance/dividend event). A monthly_income_summary rollup can land
// later if 6.x analytics needs incremental maintenance.
const V23_SQL = `
CREATE TABLE IF NOT EXISTS income (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source        TEXT NOT NULL,
  amount        REAL NOT NULL,
  recurring     INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  received_date TEXT NOT NULL DEFAULT (date('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT,
  month_key     TEXT GENERATED ALWAYS AS (substr(received_date,1,7)) VIRTUAL
);
CREATE INDEX IF NOT EXISTS idx_income_month ON income(month_key);
CREATE INDEX IF NOT EXISTS idx_income_date  ON income(received_date DESC);
`;

// v22 — payment_method column on expenses (5.4). Bounded enum stored as TEXT
// so SQLite's CHECK constraint enforces validity at write time. NULL is the
// "unknown" state — legacy expenses created before this migration retain it.
// No index this round: 5 distinct values × tens of thousands of rows = a scan
// is cheap; the filter axis composes with stricter predicates via buildWhere.
const V22_SQL = `
ALTER TABLE expenses ADD COLUMN payment_method TEXT
  CHECK (payment_method IS NULL
      OR payment_method IN ('cash','upi','card','wallet','other'));
`;

// v24 — merchant_aliases (5.10). Two-source learning table:
//   source='bundle' rows are seeded lazily from merchantMap.json the first time
//   that key is looked up (no DB write at install time — saves a backfill).
//   source='user'   rows are written when the user saves an expense in Add.js;
//                   they always win over bundle on lookup.
// alias_key is the lightNormMerchant() canonical form (lowercased, suffix-
// stripped) so a user's "Swiggy Pvt Ltd" hits the same row as "swiggy".
// merchant_id is nullable because bundle seeds don't know the local merchants.id
// (the user's merchants table is populated organically by Scan + Add).
// (alias_key, source) is unique so user-source can co-exist with bundle-source
// for the same key — lookup picks user first.
// v25 — trips soft-delete (2.D.09). Every other mutable user-owned table got
// `deleted_at TEXT` in v2 (or in its create migration); trips was created in
// v1 and missed the v2 sweep. Add the column + a partial index covering live
// rows so the active-trip lookup stays cheap. Pure ALTER + index; no data
// rewrite.
const V25_SQL = `
ALTER TABLE trips ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_trips_alive ON trips(id) WHERE deleted_at IS NULL;
`;

const V24_SQL = `
CREATE TABLE IF NOT EXISTS merchant_aliases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_key     TEXT NOT NULL,
  merchant_id   INTEGER REFERENCES merchants(id)  ON DELETE SET NULL,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  source        TEXT NOT NULL CHECK (source IN ('user','bundle')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_aliases_key
  ON merchant_aliases(alias_key, source)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_merchant_aliases_merchant
  ON merchant_aliases(merchant_id)
  WHERE deleted_at IS NULL;
`;

// v18 — per-merchant learned templates (4.22).
// One row per merchant; activated for apply at sample_count >= 3 so a single
// bad scan can't poison future parses. Holds the learned format, the column
// x-ranges (as JSON), header/footer fractions, and item-section keywords.
// Future-flexibility: outlier_count is bookkeeping for the soft outlier guard
// (templates.repo.js writes it on out-of-band samples). Updated_at lets a
// future cleanup task evict stale templates (e.g. > 1 year unused) without
// needing a separate "last_used_at" column.
const V18_SQL = `
CREATE TABLE IF NOT EXISTS receipt_templates (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id        INTEGER NOT NULL UNIQUE
                       REFERENCES merchants(id) ON DELETE CASCADE,
  format             TEXT NOT NULL,
  column_map         TEXT,
  header_frac        REAL NOT NULL DEFAULT 0.15,
  footer_frac        REAL NOT NULL DEFAULT 0.20,
  item_start_keyword TEXT,
  item_end_keyword   TEXT,
  sample_count       INTEGER NOT NULL DEFAULT 0,
  outlier_count      INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const migrations = [
  {
    version: 1,
    name: 'initial-schema',
    up: async (db) => {
      await db.execAsync(V1_SQL);
    },
  },
  {
    version: 2,
    name: 'soft-delete-columns',
    up: async (db) => { await db.execAsync(V2_SQL); },
  },
  {
    version: 3,
    name: 'month-key-generated',
    up: async (db) => { await db.execAsync(V3_SQL); },
  },
  {
    version: 4,
    name: 'merchants-lookup',
    up: async (db) => { await db.execAsync(V4_SQL); },
  },
  {
    version: 5,
    name: 'products-lookup-and-fts',
    up: async (db) => { await db.execAsync(V5_SQL); },
  },
  {
    version: 6,
    name: 'expense-context-fks',
    up: async (db) => { await db.execAsync(V6_SQL); },
  },
  {
    version: 7,
    name: 'receipt-metadata',
    up: async (db) => { await db.execAsync(V7_SQL); },
  },
  {
    version: 8,
    name: 'account-transactions',
    up: async (db) => { await db.execAsync(V8_SQL); },
  },
  {
    version: 9,
    name: 'goal-contributions',
    up: async (db) => { await db.execAsync(V9_SQL); },
  },
  {
    version: 10,
    name: 'subscriptions-rebuild-check',
    transactionless: true,
    up: v10Up,
  },
  {
    version: 11,
    name: 'categories-budget-period',
    up: async (db) => { await db.execAsync(V11_SQL); },
  },
  {
    version: 12,
    name: 'rollups-and-triggers',
    up: async (db) => { await db.execAsync(V12_SQL); },
  },
  {
    version: 13,
    name: 'expense-fts',
    up: async (db) => { await db.execAsync(V13_SQL); },
  },
  {
    version: 14,
    name: 'item-fts',
    up: async (db) => { await db.execAsync(V14_SQL); },
  },
  {
    version: 15,
    name: 'rollups-and-fts-backfill',
    up: async (db) => { await db.execAsync(V15_SQL); },
  },
  {
    version: 16,
    name: 'tax-invoice-fields',
    up: async (db) => { await db.execAsync(V16_SQL); },
  },
  {
    version: 17,
    name: 'item-gst-rates',
    up: async (db) => { await db.execAsync(V17_SQL); },
  },
  {
    version: 18,
    name: 'receipt-templates',
    up: async (db) => { await db.execAsync(V18_SQL); },
  },
  {
    version: 19,
    name: 'pharmacy-item-metadata',
    up: async (db) => { await db.execAsync(V19_SQL); },
  },
  {
    version: 20,
    name: 'recent-searches-on-profile',
    up: async (db) => { await db.execAsync(V20_SQL); },
  },
  {
    version: 21,
    name: 'saved-filters',
    up: async (db) => { await db.execAsync(V21_SQL); },
  },
  {
    version: 22,
    name: 'expenses-payment-method',
    up: async (db) => { await db.execAsync(V22_SQL); },
  },
  {
    version: 23,
    name: 'income-table',
    up: async (db) => { await db.execAsync(V23_SQL); },
  },
  {
    version: 24,
    name: 'merchant-aliases',
    up: async (db) => { await db.execAsync(V24_SQL); },
  },
  {
    version: 25,
    name: 'trips-soft-delete',
    up: async (db) => { await db.execAsync(V25_SQL); },
  },
];

// Tables present after v1 — used by the legacy-stamp detection in runMigrations()
// and by resetAll() for the wipe path. Order matters for resetAll: children first
// so FK cascades stay valid even though we're deleting rows, not the tables.
// New tables landing in v2..v11 are appended below with children-first ordering.
export const TABLES = [
  // Rollups first — wiping them before the base tables means the AD triggers
  // that fire when expenses/receipt_items are deleted target empty rollups (no-op).
  // FTS5 virtual tables are not listed here: their AD triggers handle eviction.
  'monthly_summary', 'item_summary',
  'account_transactions', 'goal_contributions',
  'receipt_items', 'expenses', 'income', 'categories',
  'subscriptions', 'goals',
  // 4.22 — receipt_templates is a child of merchants (FK ON DELETE CASCADE),
  // so it must be wiped BEFORE merchants in the resetAll() ordering.
  'receipt_templates',
  // 5.10 — merchant_aliases is a child of both merchants and categories
  // (both FKs ON DELETE SET NULL). Sit it ahead of both parents so the
  // children-first contract holds.
  'merchant_aliases',
  'merchants', 'products',
  'trip_categories', 'trips',
  // 5.3 — saved_filters has no FK; ordering only matters for human readability.
  // Place it next to the other user-facing customisation tables.
  'saved_filters',
  'accounts', 'settings', 'profile',
];

// Subset that must ALL exist for the legacy stamp to fire. If a legacy install is
// missing any of these (partial install), we let v1.up run instead — its
// IF NOT EXISTS guards make it safe to apply over a partial table set.
// IMPORTANT: keep this list frozen at v1's tables — adding new tables here
// would break legacy-stamp detection on installs created before they existed.
export const V1_REQUIRED_TABLES = [
  'profile', 'settings', 'categories',
  'expenses', 'receipt_items',
  'subscriptions', 'goals', 'accounts',
  'trips', 'trip_categories',
];

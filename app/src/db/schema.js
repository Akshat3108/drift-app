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

// v26 — Day-0 orientation flag on settings (2.D.15). One-shot boolean: 0 until
// the user finishes (or skips) the orientation screen, then 1 forever. Default
// 0 so existing rows correctly trigger orientation on the *next* launch after
// the upgrade — a one-time visual nag is acceptable; persistent suppression
// requires the column to exist first.
const V26_SQL = `
ALTER TABLE settings ADD COLUMN orientation_seen INTEGER NOT NULL DEFAULT 0;
`;

// v27 — analytics_cache (6.1). Lazy materialisation store for Phase 3 analytics
// functions. Each row is one cached compute result, keyed by a deterministic
// string the caller chooses (e.g. `spend:velocity:2026-05-20` or `items:
// inflation:v1`). TTL is rendered as an absolute `expires_at` (ISO) so eviction
// is a pure comparison — no clock-arithmetic at read time. `scope` is a coarse
// tag (one of: 'spend','items','subscriptions','forecast','seasonal',
// 'lifestyle','anomaly','patterns') so a future invalidate(scope[]) can wipe
// related entries without enumerating keys. created_at is bookkeeping for
// future TTL-tuning telemetry — not read by getCached().
// Index covers the only non-PK access pattern (evict-by-scope-or-expired).
// Not added to V1_REQUIRED_TABLES — that constant is frozen at v1's tables.
const V27_SQL = `
CREATE TABLE IF NOT EXISTS analytics_cache (
  key        TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  value      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ac_scope_expires
  ON analytics_cache(scope, expires_at);
`;

// v30 — Phase 4 / 7.5 EMI tracking.
// `emi_loans` carries the loan terms (principal, rate, tenure, start_date).
// The amortization schedule is derived in JS — no per-installment storage —
// so a re-run of `buildSchedule()` is the source of truth at any time.
// `emi_override` lets the user pin their bank's actual EMI when reducing-
// balance rounding drifts (risk register line 842). `bill_day` capped at 28
// to dodge Feb-30 edge cases. Soft-delete via deleted_at + partial index on
// live rows for the listLive() query.
//
// `expenses.emi_loan_id` is added with ON DELETE SET NULL so removing the
// loan doesn't orphan-delete the payment expenses (same convention as
// category_id / account_id / trip_id). Partial index covers the per-loan
// `linkedExpenses(loanId)` lookup without paying the index cost on
// non-EMI rows (most expenses).
const V30_SQL = `
CREATE TABLE IF NOT EXISTS emi_loans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  lender            TEXT,
  principal         REAL NOT NULL,
  annual_rate_pct   REAL NOT NULL,
  tenure_months     INTEGER NOT NULL,
  start_date        TEXT NOT NULL,
  installments_paid INTEGER NOT NULL DEFAULT 0,
  emi_override      REAL,
  bill_day          INTEGER NOT NULL DEFAULT 1
                       CHECK (bill_day BETWEEN 1 AND 28),
  notes             TEXT,
  icon              TEXT NOT NULL DEFAULT '🏦',
  color             TEXT NOT NULL DEFAULT '#888',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_emi_loans_live
  ON emi_loans(created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE expenses
  ADD COLUMN emi_loan_id INTEGER
    REFERENCES emi_loans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_emi
  ON expenses(emi_loan_id) WHERE emi_loan_id IS NOT NULL;
`;

// v31 — Phase 4 / 7.6 Fuel & vehicle tracking.
// `vehicles` holds the user's tracked vehicles (car/bike/scooter/other), each
// with a default fuel_type the picker pre-selects. `fuel_fillups` is a child
// of both `vehicles` (CASCADE on delete — wiping a vehicle wipes its fuel
// history) and `expenses` (UNIQUE + CASCADE — one fill-up rides on one
// expense; deleting the expense wipes the fill-up). The UNIQUE on expense_id
// enforces the 1-to-1 model decided at plan time: a fuel receipt produces
// exactly one fill-up row, edits go through that pair atomically.
//
// `amount` on fuel_fillups is denormalised — equal to expenses.amount but
// stored locally so the per-vehicle this-month-spend hero card avoids a JOIN
// to expenses for what is otherwise a cheap scan. The application writes
// both rows inside the same transaction so they cannot drift.
//
// fuel_type on the fill-up is NULL by convention "use vehicle default";
// non-null overrides per-fill-up (covers Petrol/CNG bi-fuel cars). CHECK on
// both columns mirrors the OCR detector's enum + Electric.
//
// bill_day-style edge cases don't apply here — fill_date is captured from
// the receipt or the picker as a YYYY-MM-DD string.
const V31_SQL = `
CREATE TABLE IF NOT EXISTS vehicles (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'car'
                       CHECK (type IN ('car','bike','scooter','other')),
  fuel_type           TEXT NOT NULL DEFAULT 'Petrol'
                       CHECK (fuel_type IN ('Petrol','Diesel','CNG','Electric')),
  registration_number TEXT,
  notes               TEXT,
  icon                TEXT NOT NULL DEFAULT '🚗',
  color               TEXT NOT NULL DEFAULT '#888',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_vehicles_live
  ON vehicles(created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS fuel_fillups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id    INTEGER NOT NULL
                  REFERENCES vehicles(id) ON DELETE CASCADE,
  expense_id    INTEGER NOT NULL UNIQUE
                  REFERENCES expenses(id) ON DELETE CASCADE,
  fill_date     TEXT NOT NULL,
  liters        REAL NOT NULL,
  rate_per_l    REAL,
  amount        REAL NOT NULL,
  odometer_km   REAL,
  is_full_tank  INTEGER NOT NULL DEFAULT 1 CHECK (is_full_tank IN (0,1)),
  fuel_type     TEXT CHECK (fuel_type IS NULL OR
                            fuel_type IN ('Petrol','Diesel','CNG','Electric')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_fillups_vehicle_date
  ON fuel_fillups(vehicle_id, fill_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fillups_expense
  ON fuel_fillups(expense_id);
`;

// v32 — Phase 4 / 7.7 Pantry inventory.
// `pantry_items` is a thin user-owned inventory table keyed by `normalized_name`
// (the same canonical key receipt_items and item_summary already use). Each
// row tracks what the user owns of a single canonical item, in the
// `canonical_unit` already established by item_summary (g/ml/pcs/kg/L).
//
// Auto-populate happens JS-side from `expRepo.createWithItems`: a scanned
// receipt item with `points_count >= 2` (i.e. the second purchase of this
// item) either increments the matching live pantry row's current_qty or
// creates a new one. Single-shot purchases don't pollute. Users can also
// add rows manually from the Pantry screen.
//
// `reorder_threshold` and `target_qty` are NULL by default — the low-stock
// checker SKIPS rows with NULL threshold (no false fires until the user
// opts in explicitly via EditPantryItem). The partial `idx_pantry_low_stock`
// covers exactly the shopping-list/notification query path.
//
// UNIQUE partial index on `normalized_name WHERE deleted_at IS NULL` enforces
// "one live pantry entry per canonical item" while leaving soft-deleted
// rows intact as history — a re-scan after soft-delete creates a fresh row.
const V32_SQL = `
CREATE TABLE IF NOT EXISTS pantry_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name   TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  kind              TEXT NOT NULL DEFAULT 'other',
  canonical_unit    TEXT NOT NULL DEFAULT 'pcs',
  current_qty       REAL NOT NULL DEFAULT 0,
  reorder_threshold REAL,
  target_qty        REAL,
  last_topped_up_at TEXT,
  notes             TEXT,
  icon              TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pantry_normalized_name_live
  ON pantry_items(normalized_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pantry_low_stock
  ON pantry_items(current_qty)
  WHERE deleted_at IS NULL AND reorder_threshold IS NOT NULL;
`;

// v33 — Phase 4 / 7.8 Item price alerts.
// `price_alerts` is a thin user-owned watchlist keyed by `normalized_name`
// (same canonical key receipt_items + item_summary + pantry_items use). A
// row may set `ceiling_price` (absolute trigger) and/or `jump_pct` (percent
// jump vs. `baseline_price`). Both NULL with `enabled=1` is allowed by the
// schema — the checker just silently skips such rows — so the UI is free
// to create a row first, ask for thresholds second.
//
// `baseline_price` is stamped at create time from `item_summary.last_unit_price`
// so a fresh alert has a meaningful anchor. The checker updates it (via
// `markFired`) after a fire so subsequent jumps are measured from the new peak.
// NULL baseline_price means "no anchor yet" — the jump branch is skipped.
//
// Soft-deleted rows are preserved as history. Partial UNIQUE on
// `normalized_name WHERE deleted_at IS NULL` enforces one live alert per
// canonical item while leaving deleted rows intact for audit.
const V33_SQL = `
CREATE TABLE IF NOT EXISTS price_alerts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name   TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  ceiling_price     REAL,
  jump_pct          REAL,
  baseline_price    REAL,
  enabled           INTEGER NOT NULL DEFAULT 1,
  last_fired_at     TEXT,
  last_fired_price  REAL,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_alerts_name_live
  ON price_alerts(normalized_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_active
  ON price_alerts(normalized_name, enabled) WHERE deleted_at IS NULL;
`;

// v34 — Phase 4 / 7.9 Split expenses.
// `people` is a small reference table (one row per friend / flatmate / colleague
// the user splits expenses with). NOCASE-collated UNIQUE-when-live mirrors the
// 7.3 tags pattern — soft-deleting a person frees the name for re-use.
//
// `expense_splits` is the M:N join — when the user pays for a shared expense,
// one row per (expense, person) records how much of the total that person owes
// back. CASCADE both ways: hard-deleting an expense (resetAll path today)
// removes its splits; soft-deleting a person via the people screen orphans the
// splits but the unsoftdeleted-people-only balances query filters them out.
// Hard-delete of a person via resetAll cascades through to splits.
//
// Composite UNIQUE on (expense_id, person_id) prevents accidental double-rows
// for the same person on the same expense. The reverse-direction index covers
// the balances-per-person rollup query.
const V34_SQL = `
CREATE TABLE IF NOT EXISTS people (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL COLLATE NOCASE,
  emoji       TEXT NOT NULL DEFAULT '👤',
  color       TEXT NOT NULL DEFAULT '#888',
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_name_live
  ON people(name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expense_splits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people(id)   ON DELETE CASCADE,
  amount      REAL NOT NULL CHECK (amount > 0),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_split_expense_person
  ON expense_splits(expense_id, person_id);
CREATE INDEX IF NOT EXISTS idx_splits_person
  ON expense_splits(person_id);
`;

// v35 — Phase 4 / 7.10 Rollover budgets.
// Per-category opt-in carryover. `categories.rollover_enabled` is the toggle
// that EditPot exposes; rows default to 0 so this migration is a no-op on
// every existing install.
//
// `budget_rollover` is the per-(category, month) carryover state. Computed
// lazily by `rolloverRepo.ensureRolloverForMonth(monthKey)` which the pots
// read path invokes before the SELECT. The compute rule:
//   rollover_in(M) = (budget + rollover_in(M-1)) - spend(M-1)
// Skipped when prev month has no monthly_summary row AND no budget_rollover
// row (avoids gifting a full extra budget to fresh installs / brand-new
// categories). INSERT OR REPLACE keeps the recompute idempotent and gives
// retroactive edits to prior-month expenses a path to flow forward — every
// pots() call re-derives the current row from the freshest prev-month state.
//
// FK CASCADE on category_id ensures resetAll wipes carryover rows alongside
// their parent category. The month_key index covers the resetAll wipe and
// any future "show me all rollovers this month" rollup.
const V35_SQL = `
CREATE TABLE IF NOT EXISTS budget_rollover (
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month_key   TEXT NOT NULL,
  rollover_in REAL NOT NULL DEFAULT 0,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (category_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_rollover_month ON budget_rollover(month_key);

ALTER TABLE categories ADD COLUMN rollover_enabled INTEGER NOT NULL DEFAULT 0;
`;

// v36 — Phase 4 / 7.12 Utility bill tracking.
// Two related tables:
//   - utility_accounts: one row per recurring utility the user pays
//     (electricity / gas / water / internet / mobile / dth / other). Like
//     vehicles in 7.6, the kind is enum-CHECK'd at write time. billing_day
//     is the anchor day used for projecting next-bill dates; capped 1..28
//     to dodge Feb edge cases (same convention as emi_loans.bill_day).
//   - utility_bills: per-billing-period row with consumption + rate trend
//     columns (all NULL-able since not every provider exposes them) plus
//     `total` REAL NOT NULL for the actual amount paid. `expense_id` is a
//     UNIQUE FK to expenses — one bill ↔ one expense — and the atomic
//     dual-write `billsRepo.addBill` mirrors 7.6's fuelfillups pattern so
//     the two rows can't drift.
//
// Partial idx `idx_utility_bills_account_period` covers the per-account
// trend query path (ORDER BY period_end DESC for the bills history list +
// the consumption chart series). Reverse-index on expense_id covers the
// "is this expense linked to a bill?" lookup the EditExpense surface
// might want later.
const V36_SQL = `
CREATE TABLE IF NOT EXISTS utility_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('electricity','gas','water','internet','mobile','dth','other')),
  provider        TEXT,
  account_number  TEXT,
  icon            TEXT NOT NULL DEFAULT '💡',
  color           TEXT NOT NULL DEFAULT '#888',
  billing_day     INTEGER CHECK (billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 28)),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_utility_accounts_live
  ON utility_accounts(kind) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS utility_bills (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  utility_account_id  INTEGER NOT NULL REFERENCES utility_accounts(id) ON DELETE CASCADE,
  period_start        TEXT NOT NULL,
  period_end          TEXT NOT NULL,
  units_consumed      REAL,
  rate_per_unit       REAL,
  base_charge         REAL,
  taxes               REAL,
  total               REAL NOT NULL,
  due_date            TEXT,
  expense_id          INTEGER UNIQUE REFERENCES expenses(id) ON DELETE CASCADE,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_utility_bills_account_period
  ON utility_bills(utility_account_id, period_end DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_utility_bills_expense
  ON utility_bills(expense_id);
`;

// v37 — Phase 4 / 7.13 Net-worth snapshots.
// One row per local day. `ensureTodaySnapshot()` is called by AccountsProvider
// on boot + after every account mutation; it computes
//   total_assets      = SUM(balance) WHERE kind='asset' AND deleted_at IS NULL
//   total_liabilities = SUM(balance) WHERE kind='liability' AND deleted_at IS NULL
//   net               = total_assets - total_liabilities
// and INSERT OR REPLACEs on `snapshot_date`. Idempotent — multiple computes
// the same day overwrite; later edits land cleanly. The chart query orders
// by snapshot_date ASC and the descending index covers a "last N days"
// LIMIT path.
const V37_SQL = `
CREATE TABLE IF NOT EXISTS account_snapshots (
  snapshot_date     TEXT PRIMARY KEY,
  total_assets      REAL NOT NULL DEFAULT 0,
  total_liabilities REAL NOT NULL DEFAULT 0,
  net               REAL NOT NULL DEFAULT 0,
  computed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_snapshots_date_desc
  ON account_snapshots(snapshot_date DESC);
`;

// v38 — Phase 4 / 7.15 CSV import audit log.
// One row per CSV import attempt. `total_rows` counts parsed rows, irrespective
// of whether the user kept them; `imported_rows` counts the rows that landed
// in expenses (excludes user-skipped + dedupe-flagged-and-skipped); `skipped_rows`
// counts the rest. `format` enumerates 'hdfc' / 'sbi' / 'icici_cc' / 'unknown'.
// `filename` is best-effort — expo-document-picker exposes a name but not a path.
const V38_SQL = `
CREATE TABLE IF NOT EXISTS csv_imports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  format          TEXT NOT NULL,
  filename        TEXT,
  imported_at     TEXT NOT NULL DEFAULT (datetime('now')),
  total_rows      INTEGER NOT NULL DEFAULT 0,
  imported_rows   INTEGER NOT NULL DEFAULT 0,
  skipped_rows    INTEGER NOT NULL DEFAULT 0,
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS idx_csv_imports_date
  ON csv_imports(imported_at DESC);
`;

// v39 — Phase 5 / 8.6 receipt image pipeline. `receipt_image_hash` carries the
// SHA-1 (hex) of the WebP full-size bytes, distinct from `receipt_hash` (the
// parser-side fingerprint used by 4.14 dedup — text/content-derived). Partial
// index because rows pre-dating 8.6 (and the legacy receipt_uri-only rows that
// haven't lazy-migrated yet) carry NULL here; 8.7's maintenance job can
// backfill later. No UNIQUE: two scans of the same paper bill that produce
// identical bytes are deliberately allowed to coexist (per 8.6 dedup-policy
// decision: store-only, no save-time block).
const V39_SQL = `
ALTER TABLE expenses ADD COLUMN receipt_image_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_exp_receipt_img_hash
  ON expenses(receipt_image_hash) WHERE receipt_image_hash IS NOT NULL;
`;

// v40 — Phase 5 / 8.7 maintenance job timestamp. Single TEXT (ISO-8601)
// column on settings carries the last-successful-run wall-clock. The 24h
// rate-limit gate in maintenance/index.js compares Date.parse(this column)
// against Date.now(). NULL = never run; first bg→fg fires it.
const V40_SQL = `
ALTER TABLE settings ADD COLUMN last_maintenance_at TEXT;
`;

// v41 — Phase 5 / 8.11 biometric app lock toggle. Single boolean column on
// settings; gate logic + native auth live in app/src/features/lock/. Default
// 0 so existing installs see no behaviour change until the user opts in via
// the Security row in Profile. Re-lock policy is fixed (cold start + every
// bg→fg) per the 8.11 scoping decision, so no second column.
const V41_SQL = `
ALTER TABLE settings ADD COLUMN app_lock_enabled INTEGER NOT NULL DEFAULT 0;
`;

// v42 — Phase 5 / 8.10 perf observability. Two tables:
//   db_stats     — aggregate per-label counters (call_count, total_ms,
//                  max_ms, slow_count, last_run_at). Cheap upsert per query;
//                  always-on in dev AND release builds so the Diagnostics
//                  screen has data when tap-debugging a production install.
//   db_slow_log  — per-call SQL + duration for queries above the slow
//                  threshold (50 ms). Dev-only writes — release builds skip
//                  the row insert to avoid persisting user SQL (which may
//                  include merchant names) on disk in plaintext.
// The maintenance job trims db_slow_log to the last 500 rows daily.
const V42_SQL = `
CREATE TABLE IF NOT EXISTS db_stats (
  label        TEXT PRIMARY KEY,
  call_count   INTEGER NOT NULL DEFAULT 0,
  total_ms     INTEGER NOT NULL DEFAULT 0,
  max_ms       INTEGER NOT NULL DEFAULT 0,
  slow_count   INTEGER NOT NULL DEFAULT 0,
  last_run_at  TEXT
);

CREATE TABLE IF NOT EXISTS db_slow_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL,
  sql          TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  occurred_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_db_slow_log_at ON db_slow_log(occurred_at DESC);
`;

// v43 — Phase 5 / 5.F.01 archive mode (year-10+ contingency).
// Two cold-storage tables that mirror `expenses` and `receipt_items` column-for-column
// as of v42. Populated by the yearly `archiveOldRows` maintenance task; never written
// to from any user-facing repo. Read by the AllExpenses "View archive" toggle through
// expenses.listArchive().
//
// Design notes:
// - id is a plain INTEGER PRIMARY KEY (no AUTOINCREMENT). We always supply the original
//   expenses.id / receipt_items.id so historical PKs survive the move — preserves
//   future linkability to settled rows in account_transactions/goal_contributions whose
//   expense_id was SET NULL on delete.
// - No FK constraints on these tables. archive_receipt_items.expense_id is a plain
//   INTEGER pointing at archive_expenses.id by convention (not enforced) — binding a
//   second FK against the same id space would force two delete behaviours on the live
//   row and complicate the move op.
// - month_key stays a VIRTUAL generated column so archive queries can use the same
//   indexing pattern as live.
// - Indexes are minimal (date + month_key on archive_expenses, expense_id join on
//   archive_receipt_items). Archive is read-rarely; we don't pay for indexes that
//   active queries pay for.
// - settings.last_archive_at is the 365-day gate for archiveOldRows. NULL on existing
//   installs = treat as never-run; first bg→fg after this migration fires the task,
//   which then stamps the column.
//
// MAINTENANCE WARNING: any future ALTER TABLE that adds a column to `expenses` or
// `receipt_items` MUST also ALTER the corresponding archive_* table (same column,
// same type, no NOT NULL unless backfillable) AND update the INSERT column lists
// in maintenance/tasks/archiveOldRows.js. The validation harness (drift_5f01_validate.mjs
// when re-run) asserts column count parity.
const V43_SQL = `
CREATE TABLE IF NOT EXISTS archive_expenses (
  id                   INTEGER PRIMARY KEY,
  category_id          INTEGER,
  merchant             TEXT NOT NULL,
  amount               REAL NOT NULL,
  mood                 TEXT,
  carbon               REAL NOT NULL DEFAULT 0,
  recurring            INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  receipt_uri          TEXT,
  expense_date         TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  deleted_at           TEXT,
  month_key            TEXT GENERATED ALWAYS AS (substr(expense_date, 1, 7)) VIRTUAL,
  merchant_id          INTEGER,
  account_id           INTEGER,
  trip_id              INTEGER,
  subscription_id      INTEGER,
  currency             TEXT,
  amount_home          REAL,
  fx_rate              REAL,
  receipt_path         TEXT,
  receipt_thumb        TEXT,
  receipt_bytes        INTEGER,
  receipt_hash         TEXT,
  receipt_soft_hash    TEXT,
  gstin                TEXT,
  invoice_number       TEXT,
  cgst                 REAL,
  sgst                 REAL,
  igst                 REAL,
  payment_method       TEXT,
  emi_loan_id          INTEGER,
  receipt_image_hash   TEXT
);
CREATE INDEX IF NOT EXISTS idx_arc_exp_date  ON archive_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_arc_exp_month ON archive_expenses(month_key);

CREATE TABLE IF NOT EXISTS archive_receipt_items (
  id              INTEGER PRIMARY KEY,
  expense_id      INTEGER NOT NULL,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind            TEXT NOT NULL,
  qty             REAL NOT NULL,
  unit            TEXT NOT NULL,
  canonical_qty   REAL NOT NULL,
  canonical_unit  TEXT NOT NULL,
  unit_price      REAL NOT NULL,
  price           REAL NOT NULL,
  purchase_date   TEXT NOT NULL,
  deleted_at      TEXT,
  month_key       TEXT GENERATED ALWAYS AS (substr(purchase_date, 1, 7)) VIRTUAL,
  product_id      INTEGER,
  hsn             TEXT,
  cgst_rate       REAL,
  sgst_rate       REAL,
  igst_rate       REAL,
  batch_no        TEXT,
  expiry_date     TEXT,
  mfg_date        TEXT
);
CREATE INDEX IF NOT EXISTS idx_arc_items_expense ON archive_receipt_items(expense_id);

ALTER TABLE settings ADD COLUMN last_archive_at TEXT;
`;

// v29 — Phase 4 / 7.3 tags.
// `tags` is a small user-owned reference table with case-insensitive
// uniqueness (NOCASE collation + partial UNIQUE WHERE deleted_at IS NULL),
// so soft-deleting a tag frees the name for re-use. `expense_tags` is the
// M:N join with composite-PK + FK CASCADE both ways so a hard-deleted
// expense (which only happens on resetAll today) carries its joins with
// it. The `idx_expense_tags_tag` index covers the reverse-direction filter
// subquery used by buildWhere() for `WHERE tag_id IN (?)`.
const V29_SQL = `
CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL COLLATE NOCASE,
  color       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_live
  ON tags(name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS expense_tags (
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (expense_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_expense_tags_tag
  ON expense_tags(tag_id);
`;

// v28 — Phase 4 / 7.1 notifications.
// notification_log is a local-only audit + dedupe surface for every notification
// Drift fires. payload_json holds kind-specific context ({category_id, sub_id,
// item_normalized_name, …}) so new kinds can land without re-shaping the table.
// dedupe_key (UNIQUE when non-null) prevents the budget-threshold checker from
// firing twice for the same (month_key, category_id, band) and lets the sub-due
// scheduler replace pending rows when next_bill changes. Settings columns are
// the three knobs that gate the checkers; notifications_enabled defaults to 0
// so this migration is a no-op on existing installs until the user opts in.
const V28_SQL = `
CREATE TABLE IF NOT EXISTS notification_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('budget_threshold','sub_due','price_alert','other')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  payload_json  TEXT,
  scheduled_for TEXT,
  delivered_at  TEXT,
  read_at       TEXT,
  dedupe_key    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notif_dedupe
  ON notification_log(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_kind_created
  ON notification_log(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_unread
  ON notification_log(created_at DESC) WHERE read_at IS NULL;

ALTER TABLE settings ADD COLUMN notifications_enabled  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN notif_budget_threshold REAL    NOT NULL DEFAULT 0.8;
ALTER TABLE settings ADD COLUMN notif_sub_lead_days    INTEGER NOT NULL DEFAULT 3;
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

// v44 — PS-09 Quick-Entry Templates. New `expense_templates` table backs the
// horizontal chip row on the Add screen (1-tap prefill of amount + merchant +
// category + payment method). `default_day_of_month` is reserved for a future
// auto-create-on-day-X scheduler — column ships now so the scheduler task can
// land without an additional migration. payment_method shares the same CHECK
// enum as expenses.payment_method (v22). Soft-delete via `deleted_at` keeps the
// table's lifecycle consistent with every other user-owned mutable table since
// v2; partial index `idx_templates_sort` keeps the chip-row read cheap.
const V44_SQL = `
CREATE TABLE IF NOT EXISTS expense_templates (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  label                 TEXT NOT NULL,
  amount                REAL NOT NULL,
  category_id           INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  payment_method        TEXT
    CHECK (payment_method IS NULL
        OR payment_method IN ('cash','upi','card','wallet','other')),
  default_day_of_month  INTEGER,
  icon                  TEXT NOT NULL DEFAULT '🧷',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  deleted_at            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_templates_sort
  ON expense_templates(sort_order, id) WHERE deleted_at IS NULL;
`;

// v46 — PS-11 Insurance premium tracker. New `insurance_policies` table +
// `expenses.insurance_policy_id` FK so premium payments link back to the
// policy. `kind` covers life | term | health | vehicle | other.
// `premium_frequency` is the billing cadence; `next_due` is the YYYY-MM-DD
// of the upcoming premium and drives a scheduled notification via the 7.1
// scheduler. `sum_assured` is informational; `maturity_date` is optional
// (term/vehicle have none). `account_id` is the linked debit source (the
// asset/liability tracking the premium); SET NULL on account delete keeps
// the policy around. Soft-delete via `deleted_at`.
//
// Adding `expenses.insurance_policy_id` as a nullable FK with SET NULL on
// policy delete (same convention as expenses.emi_loan_id from 7.5).
// Partial indexes keep the live-list read on policies and the per-policy
// linked-expenses count cheap.

// v45 — PS-10 Investment holdings. Manual-entry portfolio (no online price
// fetch — Rule 5 keeps Drift offline-first). One row per holding; `kind`
// covers mf | equity | gold | fd | rd | nps | ppf | other. `units` is in the
// natural unit for the kind (MF/equity = units/shares, gold = grams, FD/RD
// = 1 with unit_cost = principal, NPS/PPF = 1 with unit_cost = corpus).
// `unit_cost` is the average buy price (cost basis); `current_nav` is the
// last user-entered market value per unit. `last_updated` is the YYYY-MM-DD
// the user last refreshed the NAV — drives the monthly NAV-update reminder
// in features/notifications. `account_id` is the linking account (e.g.
// "Zerodha Demat" as an asset account); SET NULL on account delete keeps
// the holding around. Soft-delete via `deleted_at`. Partial index keeps
// the live list read cheap.
const V45_SQL = `
CREATE TABLE IF NOT EXISTS holdings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL
    CHECK (kind IN ('mf','equity','gold','fd','rd','nps','ppf','other')),
  label         TEXT NOT NULL,
  units         REAL NOT NULL DEFAULT 0,
  unit_cost     REAL NOT NULL DEFAULT 0,
  current_nav   REAL NOT NULL DEFAULT 0,
  last_updated  TEXT,
  account_id    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  notes         TEXT,
  icon          TEXT NOT NULL DEFAULT '📈',
  color         TEXT NOT NULL DEFAULT '#6a8d73',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_holdings_live
  ON holdings(sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_holdings_account
  ON holdings(account_id) WHERE deleted_at IS NULL AND account_id IS NOT NULL;
`;

// v49 — PS-21 Privacy mask mode + FLAG_SECURE. Three new boolean settings:
//   - `privacy_block_screenshots`    → toggle for native FLAG_SECURE (read
//                                       by MainActivity.onCreate at app
//                                       start; takes effect after restart).
//   - `privacy_hide_on_minimize`     → PrivacyContext flips amountsHidden
//                                       true when AppState !== 'active'.
//   - `privacy_mask_amounts_always`  → amountsHidden permanently true.
// Defaults 0 so existing installs see no UX change until opted in.
const V49_SQL = `
ALTER TABLE settings ADD COLUMN privacy_block_screenshots   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN privacy_hide_on_minimize    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN privacy_mask_amounts_always INTEGER NOT NULL DEFAULT 0;
`;

// v50 — PS-25 time-of-day capture. Two additive ALTERs:
//   - `expenses.expense_time TEXT NULL`         (HH:MM local; stamped by
//                                                Add.js when the setting is
//                                                ON. Scan + EditExpense leave
//                                                it NULL by Step-2 design.)
//   - `settings.capture_expense_time INTEGER`   (opt-in flag; default 0 so
//                                                no UX change for existing
//                                                installs until toggled).
// First merged column from the post_187_supplement_v2 v50 manifest; the
// remaining columns from that manifest stay deferred until their tasks ship.
const V50_SQL = `
ALTER TABLE expenses ADD COLUMN expense_time TEXT NULL;
ALTER TABLE settings ADD COLUMN capture_expense_time INTEGER NOT NULL DEFAULT 0;
`;

// v51 — post_187_supplement_v2 Wave-1 settings batch. Seven additive ALTERs,
// all on `settings`. Scoped to the three schema-touching Wave-1 tasks:
//   PS-41 — per-channel notification preferences. Five booleans, each gating
//           one checker family in `features/notifications/checkers.js`. The
//           existing `notifications_enabled` master ANDs over these; per-channel
//           flags default 1 so existing installs keep firing every channel:
//             notif_budget_enabled   → evaluateBudgetThresholds
//             notif_sub_enabled      → evaluateSubsDue + evaluateInsuranceRenewals
//             notif_price_enabled    → evaluatePriceAlerts
//             notif_lowstock_enabled → evaluatePantryLowStock
//             notif_health_enabled   → reserved (no health-score notif exists yet)
//           (evaluateHoldingsNavReminder stays master-only — not one of the 5.)
//   PS-49 — `accent_color TEXT NULL`. Named-palette enum or 7-char hex; NULL =
//           the default F.coral accent (no UX change for existing installs).
//   PS-46 — `show_receipt_thumbnails INTEGER` opt-in (default 0) — renders a
//           32px receipt thumbnail in expense rows when ON.
// Remaining columns from the supplement's v50 manifest stay deferred until
// their tasks (PS-27..PS-50, minus this Wave-1 slice) are separately approved.
const V51_SQL = `
ALTER TABLE settings ADD COLUMN notif_budget_enabled   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN notif_sub_enabled      INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN notif_price_enabled    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN notif_lowstock_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN notif_health_enabled   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE settings ADD COLUMN accent_color           TEXT NULL;
ALTER TABLE settings ADD COLUMN show_receipt_thumbnails INTEGER NOT NULL DEFAULT 0;
`;

// v52 — chart-type preferences. One JSON-map column (`chart_prefs`) holds a
// { "<chartId>": "<type>" } dictionary so every analytics chart can remember
// its last-chosen rendering (bar / line / area / dot / donut) per surface.
// A single column instead of one-per-chart keeps the schema flat and lets new
// charts opt in with zero further migrations. Defaults to '{}' so existing
// installs render their charts in each chart's hard-coded default until the
// user picks a different style.
const V52_SQL = `
ALTER TABLE settings ADD COLUMN chart_prefs TEXT NOT NULL DEFAULT '{}';
`;

// v48 — PS-13 FASTag tracking. Each row models one FASTag (tied to a
// vehicle, identified by the tag_id printed on the sticker). `current_balance`
// is the last-known wallet balance from a recharge / CSV import / manual
// edit; `last_synced` stamps when. A FASTag toll transaction lands as an
// `expenses` row with both `vehicle_id` set (matches 7.6's column) AND
// `fastag_account_id` pointing here — the latter lets the FASTag detail
// screen scope its list without forcing a vehicle filter.
const V48_SQL = `
CREATE TABLE IF NOT EXISTS fastag_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  tag_id          TEXT,
  bank            TEXT,
  label           TEXT NOT NULL,
  current_balance REAL NOT NULL DEFAULT 0,
  last_synced     TEXT,
  notes           TEXT,
  icon            TEXT NOT NULL DEFAULT '🛣️',
  color           TEXT NOT NULL DEFAULT '#b09c8a',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  deleted_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fastag_live
  ON fastag_accounts(sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fastag_vehicle
  ON fastag_accounts(vehicle_id) WHERE deleted_at IS NULL AND vehicle_id IS NOT NULL;

ALTER TABLE expenses ADD COLUMN fastag_account_id INTEGER
  REFERENCES fastag_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exp_fastag_account
  ON expenses(fastag_account_id) WHERE fastag_account_id IS NOT NULL;
`;

// v47 — PS-12 EMI tax-benefit metadata. Two new columns on emi_loans:
//   - `kind`: enum (home | car | personal | education). Drives the
//             TaxBenefit screen's 80C/24B applicability logic. Default
//             'other' on legacy rows means the user must explicitly mark
//             their home loan to get the benefit calculation.
//   - `tax_eligible`: explicit boolean override so the user can flag a
//             non-home loan as 80C-eligible (e.g. let-out property) or
//             un-flag a home loan held in a non-eligible structure.
//             NULL = follow the implicit rule (home loan = eligible).
const V47_SQL = `
ALTER TABLE emi_loans ADD COLUMN kind TEXT
  CHECK (kind IS NULL OR kind IN ('home','car','personal','education','other'));
ALTER TABLE emi_loans ADD COLUMN tax_eligible INTEGER;
`;

const V46_SQL = `
CREATE TABLE IF NOT EXISTS insurance_policies (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                TEXT NOT NULL
    CHECK (kind IN ('life','term','health','vehicle','other')),
  label               TEXT NOT NULL,
  provider            TEXT,
  premium_amount      REAL NOT NULL DEFAULT 0,
  premium_frequency   TEXT NOT NULL DEFAULT 'yearly'
    CHECK (premium_frequency IN ('monthly','quarterly','half_yearly','yearly')),
  next_due            TEXT,
  sum_assured         REAL,
  maturity_date       TEXT,
  account_id          INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  policy_number       TEXT,
  notes               TEXT,
  icon                TEXT NOT NULL DEFAULT '🛡️',
  color               TEXT NOT NULL DEFAULT '#a3c7e9',
  sort_order          INTEGER NOT NULL DEFAULT 0,
  deleted_at          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_insurance_live
  ON insurance_policies(sort_order, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_due
  ON insurance_policies(next_due) WHERE deleted_at IS NULL AND next_due IS NOT NULL;

ALTER TABLE expenses ADD COLUMN insurance_policy_id INTEGER
  REFERENCES insurance_policies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_exp_insurance_policy
  ON expenses(insurance_policy_id) WHERE insurance_policy_id IS NOT NULL;
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
  {
    version: 26,
    name: 'settings-orientation-seen',
    up: async (db) => { await db.execAsync(V26_SQL); },
  },
  {
    version: 27,
    name: 'analytics-cache',
    up: async (db) => { await db.execAsync(V27_SQL); },
  },
  {
    version: 28,
    name: 'notification-log',
    up: async (db) => { await db.execAsync(V28_SQL); },
  },
  {
    version: 29,
    name: 'tags',
    up: async (db) => { await db.execAsync(V29_SQL); },
  },
  {
    version: 30,
    name: 'emi-loans',
    up: async (db) => { await db.execAsync(V30_SQL); },
  },
  {
    version: 31,
    name: 'vehicles-and-fuel-fillups',
    up: async (db) => { await db.execAsync(V31_SQL); },
  },
  {
    version: 32,
    name: 'pantry-items',
    up: async (db) => { await db.execAsync(V32_SQL); },
  },
  {
    version: 33,
    name: 'price-alerts',
    up: async (db) => { await db.execAsync(V33_SQL); },
  },
  {
    version: 34,
    name: 'people-and-expense-splits',
    up: async (db) => { await db.execAsync(V34_SQL); },
  },
  {
    version: 35,
    name: 'budget-rollover',
    up: async (db) => { await db.execAsync(V35_SQL); },
  },
  {
    version: 36,
    name: 'utility-accounts-and-bills',
    up: async (db) => { await db.execAsync(V36_SQL); },
  },
  {
    version: 37,
    name: 'account-snapshots',
    up: async (db) => { await db.execAsync(V37_SQL); },
  },
  {
    version: 38,
    name: 'csv-imports',
    up: async (db) => { await db.execAsync(V38_SQL); },
  },
  {
    version: 39,
    name: 'receipt-image-hash',
    up: async (db) => { await db.execAsync(V39_SQL); },
  },
  {
    version: 40,
    name: 'settings-last-maintenance-at',
    up: async (db) => { await db.execAsync(V40_SQL); },
  },
  {
    version: 41,
    name: 'settings-app-lock-enabled',
    up: async (db) => { await db.execAsync(V41_SQL); },
  },
  {
    version: 42,
    name: 'perf-db-stats',
    up: async (db) => { await db.execAsync(V42_SQL); },
  },
  {
    version: 43,
    name: 'archive-expenses-and-items',
    up: async (db) => { await db.execAsync(V43_SQL); },
  },
  {
    version: 44,
    name: 'expense-templates',
    up: async (db) => { await db.execAsync(V44_SQL); },
  },
  {
    version: 45,
    name: 'investment-holdings',
    up: async (db) => { await db.execAsync(V45_SQL); },
  },
  {
    version: 46,
    name: 'insurance-policies',
    up: async (db) => { await db.execAsync(V46_SQL); },
  },
  {
    version: 47,
    name: 'emi-loans-tax-metadata',
    up: async (db) => { await db.execAsync(V47_SQL); },
  },
  {
    version: 48,
    name: 'fastag-accounts',
    up: async (db) => { await db.execAsync(V48_SQL); },
  },
  {
    version: 49,
    name: 'privacy-settings',
    up: async (db) => { await db.execAsync(V49_SQL); },
  },
  {
    version: 50,
    name: 'expense-time',
    up: async (db) => { await db.execAsync(V50_SQL); },
  },
  {
    version: 51,
    name: 'wave1-settings',
    up: async (db) => { await db.execAsync(V51_SQL); },
  },
  {
    version: 52,
    name: 'chart-prefs',
    up: async (db) => { await db.execAsync(V52_SQL); },
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
  // 7.6 — fuel_fillups is a child of BOTH expenses (FK CASCADE) and vehicles
  // (FK CASCADE). Children-first wipe order requires fuel_fillups before
  // both parents.
  'fuel_fillups',
  // 7.10 — budget_rollover is a child of categories (FK CASCADE). Children-first
  // wipe order requires it before categories.
  'budget_rollover',
  // 7.12 — utility_bills is a child of BOTH utility_accounts (FK CASCADE)
  // AND expenses (FK CASCADE via UNIQUE expense_id). Children-first wipe
  // order requires utility_bills before both parents.
  'utility_bills',
  'receipt_items', 'expenses',
  // 5.F.01 — archive_* tables are populated by maintenance/tasks/archiveOldRows.
  // No FK to live tables, but archive_receipt_items references archive_expenses by
  // integer id, so children-first wipe ordering still applies for consistency.
  'archive_receipt_items', 'archive_expenses',
  // PS-09 — expense_templates is a child of categories (FK ON DELETE SET NULL).
  // Children-first wipe order requires it before `categories`, even though
  // SET NULL would tolerate the reverse — keeps the convention consistent
  // with every other category-child table in this list.
  'expense_templates',
  'income', 'categories',
  'subscriptions', 'goals',
  // 7.5 — emi_loans is a parent of expenses (expenses.emi_loan_id → emi_loans.id
  // ON DELETE SET NULL). Wiped after expenses so the FK SET NULL trigger is a no-op
  // (expenses already gone). Soft-delete-aware listLive() uses idx_emi_loans_live.
  'emi_loans',
  // 7.6 — vehicles is the parent of fuel_fillups. Wiped after fuel_fillups
  // (already drained above) so the CASCADE trigger is a no-op.
  'vehicles',
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
  // 6.1 — analytics_cache has no FKs; safe anywhere. Place near other cache-
  // like / customisation tables so resetAll() wipes it alongside saved_filters.
  'analytics_cache',
  // 7.1 — notification_log has no FKs; payload_json carries the soft references
  // (category_id / sub_id / item key). Wiped on resetAll() so a factory reset
  // also clears the audit history.
  'notification_log',
  // 7.3 — expense_tags is a child of both expenses (already wiped above) and
  // tags. Children-first wipe order requires expense_tags before tags.
  'expense_tags', 'tags',
  // 7.7 — pantry_items has no FK (it joins to receipt_items by normalized_name,
  // not by id). Ordering is purely organisational; place next to the other
  // user-customisation tables.
  'pantry_items',
  // 7.8 — price_alerts has no FK (it joins to item_summary by normalized_name).
  // Ordering is purely organisational; place next to the other user-owned
  // reference tables.
  'price_alerts',
  // 7.9 — expense_splits is a child of both expenses (already wiped above)
  // and people. Children-first wipe order requires expense_splits before
  // people.
  'expense_splits', 'people',
  // 7.12 — utility_accounts is the parent of utility_bills (already wiped
  // above). Place near the other user-owned reference tables.
  'utility_accounts',
  // 7.13 — account_snapshots has no FK; place near other audit-style tables.
  'account_snapshots',
  // PS-10 — holdings is a child of accounts (FK ON DELETE SET NULL). Wiped
  // BEFORE accounts so the FK SET NULL on cascade is a no-op (rows already
  // gone). Children-first convention preserved even though SET NULL would
  // tolerate the reverse order.
  'holdings',
  // PS-11 — insurance_policies is a child of accounts (FK ON DELETE SET NULL).
  // It is also a parent of expenses.insurance_policy_id (FK SET NULL), but
  // expenses already drained above, so wiping insurance_policies here is safe.
  'insurance_policies',
  // PS-13 — fastag_accounts is a child of vehicles (FK SET NULL) and a parent
  // of expenses.fastag_account_id (FK SET NULL). Expenses already drained
  // above, so wiping fastag_accounts here is safe.
  'fastag_accounts',
  // 7.15 — csv_imports is a pure audit table, no FKs.
  'csv_imports',
  // 8.10 — perf observability. Pure audit tables, no FKs; wiped on resetAll
  // so a factory reset also clears stale perf history (otherwise the
  // Diagnostics screen would still surface pre-reset slow queries).
  'db_slow_log', 'db_stats',
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

# Future-Proof Schema — Drift

This document proposes a revised schema that supports all targeted use cases:

- Transaction-level tracking
- Item-level tracking
- Product history / price tracking / inflation analysis
- Quantity & consumption tracking
- Merchant analytics
- Subscription tracking (with expense linkage)
- Savings goals with contribution history
- Inventory / pantry tracking
- Multi-year analytics
- Offline-first architecture
- Multi-currency expenses
- Account-linked transactions

---

## Design Principles

1. **Additive migrations only.** Never drop a column in a running app. Use `schema_version` + migration runner.
2. **Derived values are stored.** Canonical quantities, normalized names, and computed totals are stored at write time with a recompute path for bulk corrections.
3. **Audit trails for financial data.** Goals, accounts, and subscriptions get ledger-style append-only tables.
4. **Soft deletes everywhere financial.** `deleted_at` columns replace hard deletes for expenses, items, accounts.
5. **Merchant as an entity.** Normalize merchants to enable analytics.
6. **Full-text search via FTS5.** Virtual table shadowing `expenses.merchant`, `receipt_items.name`.
7. **Offline-first.** All data local. Sync layer (future) can be built on top without schema changes.

---

## Future ER Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  CONFIG LAYER (singletons)                                          │
│  profile(id=1)  ←→  settings(id=1)                                 │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────────┐
│    merchants     │     │      categories       │
│──────────────────│     │──────────────────────│
│ id  PK           │     │ id  PK               │
│ canonical_name   │     │ name                 │
│ display_name     │◄──┐ │ emoji                │
│ category_hint    │   │ │ budget               │
│ logo_emoji       │   │ │ budget_period        │← NEW
│ deleted_at       │   │ │ color                │
└──────────────────┘   │ │ sort_order           │
                        │ │ deleted_at           │← NEW
                        │ └──────────────────────┘
                        │           │
                        │           │ FK category_id
                        │           ▼
                        │ ┌──────────────────────────────────────────┐
                        │ │               expenses                   │
                        │ │──────────────────────────────────────────│
                        └─┤ id           PK                         │
                          │ category_id  FK → categories             │
                          │ merchant_id  FK → merchants              │← NEW
                          │ amount       REAL                        │
                          │ currency     TEXT                        │← NEW
                          │ amount_home  REAL                        │← NEW
                          │ fx_rate      REAL                        │← NEW
                          │ account_id   FK → accounts               │← NEW
                          │ trip_id      FK → trips                  │← NEW
                          │ subscription_id FK → subscriptions       │← NEW
                          │ mood         TEXT                        │
                          │ carbon       REAL                        │
                          │ notes        TEXT                        │
                          │ receipt_uri  TEXT                        │
                          │ expense_date TEXT                        │
                          │ created_at   TEXT                        │
                          │ deleted_at   TEXT                        │← NEW
                          └──────────┬───────────────────────────────┘
                                     │ 1:N
                                     ▼
                          ┌──────────────────────────────────────────┐
                          │            receipt_items                 │
                          │ (unchanged structure + product_id FK)   │
                          │ product_id  FK → products (optional)    │← NEW
                          │ ...existing columns...                  │
                          │ deleted_at  TEXT                        │← NEW
                          └──────────┬───────────────────────────────┘
                                     │ N:1
                                     ▼
                          ┌──────────────────────────────────────────┐
                          │               products                   │← NEW
                          │──────────────────────────────────────────│
                          │ id              PK                       │
                          │ normalized_name TEXT UNIQUE              │
                          │ display_name    TEXT                     │
                          │ kind            TEXT                     │
                          │ canonical_unit  TEXT                     │
                          │ barcode         TEXT                     │← future
                          │ brand           TEXT                     │
                          │ notes           TEXT                     │
                          │ created_at      TEXT                     │
                          └──────────────────────────────────────────┘

┌──────────────────────────────┐    ┌────────────────────────────────┐
│       subscriptions          │    │            accounts             │
│──────────────────────────────│    │────────────────────────────────│
│ id          PK               │    │ id        PK                   │
│ name        TEXT             │    │ kind      TEXT (asset/liability)│
│ amount      REAL             │    │ label     TEXT                 │
│ currency    TEXT             │← N │ emoji     TEXT                 │
│ period      TEXT             │    │ category  TEXT                 │
│ used_freq   TEXT             │    │ currency  TEXT                 │← NEW
│ verdict     TEXT             │    │ balance   REAL (cache, derived)│
│ icon        TEXT             │    │ created_at TEXT                │
│ color       TEXT             │    │ deleted_at TEXT                │← NEW
│ cancelled   INTEGER          │    └──────────────┬─────────────────┘
│ cancelled_at TEXT            │← N               │ 1:N
│ next_bill   TEXT             │    ┌─────────────▼─────────────────┐
│ linked_category_id FK        │← N │     account_transactions      │← NEW
│ created_at  TEXT             │    │────────────────────────────────│
└──────────────────────────────┘    │ id          PK                │
                                    │ account_id  FK → accounts      │
┌──────────────────────────────┐    │ expense_id  FK → expenses (opt)│
│           goals              │    │ amount      REAL               │
│──────────────────────────────│    │ direction   TEXT (in/out)      │
│ id           PK              │    │ note        TEXT               │
│ name         TEXT            │    │ txn_date    TEXT               │
│ emoji        TEXT            │    │ created_at  TEXT               │
│ target_amount REAL           │    └───────────────────────────────┘
│ saved_amount  REAL (cache)   │
│ target_date   TEXT           │← N ┌────────────────────────────────┐
│ source_account_id FK         │← N │      goal_contributions        │← NEW
│ created_at   TEXT            │    │────────────────────────────────│
│ completed_at TEXT            │← N │ id          PK                │
└──────────────────────────────┘    │ goal_id     FK → goals         │
                                    │ expense_id  FK → expenses (opt)│
                                    │ account_id  FK → accounts (opt)│
                                    │ amount      REAL               │
                                    │ note        TEXT               │
                                    │ contributed_at TEXT            │
                                    └───────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│           trips                  trip_expenses (NEW)            │
│─────────────────────────────┐    ┌────────────────────────────  │
│ id         PK               │    │ id         PK               │
│ name       TEXT             │ 1:N│ trip_id    FK → trips        │
│ destination TEXT            │◄───│ expense_id FK → expenses     │
│ start_date TEXT             │    │ dest_amount REAL             │
│ end_date   TEXT             │    │ fx_rate_used REAL            │
│ budget     REAL             │    └────────────────────────────  │
│ home_currency TEXT          │                                   │
│ dest_currency TEXT          │  trip_categories (unchanged)      │
│ created_at TEXT             │  budget sub-allocations per trip  │
└─────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  METADATA / CONFIG                                            │
│  schema_version(id=1) — stores current migration version     │
│  pantry_items(product_id FK, qty, unit, updated_at)         │← NEW
└──────────────────────────────────────────────────────────────┘
```

---

## Full DDL — Future Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Migration version ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_version (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0);

-- ─── Singletons ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  name       TEXT NOT NULL,
  avatar     TEXT NOT NULL DEFAULT 'U',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  currency         TEXT NOT NULL DEFAULT 'INR',
  dark_mode        INTEGER NOT NULL DEFAULT 0,
  carbon_tracking  INTEGER NOT NULL DEFAULT 1,
  default_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
);

-- ─── Merchants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchants (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name   TEXT NOT NULL,
  category_hint  TEXT,
  logo_emoji     TEXT NOT NULL DEFAULT '🏪',
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_merchants_canonical ON merchants(canonical_name);

-- ─── Categories ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  emoji          TEXT NOT NULL DEFAULT '💰',
  budget         REAL NOT NULL DEFAULT 0,
  budget_period  TEXT NOT NULL DEFAULT 'month'
                   CHECK (budget_period IN ('week','fortnight','month','year')),
  color          TEXT NOT NULL DEFAULT 'cream',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);

-- ─── Accounts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('asset','liability')),
  label       TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '💼',
  currency    TEXT NOT NULL DEFAULT 'INR',
  balance     REAL NOT NULL DEFAULT 0,  -- cached; recomputed from account_transactions
  category    TEXT CHECK (category IN
                ('bank','cash','investment','property','vehicle','loan','credit_card','other')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS account_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expense_id  INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  amount      REAL NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  note        TEXT,
  txn_date    TEXT NOT NULL DEFAULT (date('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_acctxn_account_date ON account_transactions(account_id, txn_date DESC);

-- ─── Expenses ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  merchant_id     INTEGER REFERENCES merchants(id) ON DELETE SET NULL,
  account_id      INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  trip_id         INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount          REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  amount_home     REAL NOT NULL,  -- amount converted to home currency at time of entry
  fx_rate         REAL NOT NULL DEFAULT 1,
  mood            TEXT,
  carbon          REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  receipt_uri     TEXT,
  expense_date    TEXT NOT NULL DEFAULT (date('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses(expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_category    ON expenses(category_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_merchant    ON expenses(merchant_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_account     ON expenses(account_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_trip        ON expenses(trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_sub         ON expenses(subscription_id) WHERE subscription_id IS NOT NULL;

-- FTS5 virtual table for merchant search
CREATE VIRTUAL TABLE IF NOT EXISTS expenses_fts USING fts5(
  merchant_text,
  content='expenses',
  content_rowid='id'
);

-- ─── Products ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'other',
  canonical_unit  TEXT NOT NULL DEFAULT 'pcs',
  barcode         TEXT,
  brand           TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(normalized_name);

CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  display_name,
  brand,
  content='products',
  content_rowid='id'
);

-- ─── Receipt Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id      INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'other'
                    CHECK (kind IN ('produce','dairy','meat','bakery','frozen','beverage',
                                    'household','personal_care','pharmacy','electronics','other')),
  qty             REAL NOT NULL DEFAULT 1,
  unit            TEXT NOT NULL DEFAULT 'pcs',
  canonical_qty   REAL NOT NULL DEFAULT 1,
  canonical_unit  TEXT NOT NULL DEFAULT 'pcs',
  unit_price      REAL NOT NULL DEFAULT 0,
  price           REAL NOT NULL DEFAULT 0,
  purchase_date   TEXT NOT NULL DEFAULT (date('now')),
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_name_date   ON receipt_items(normalized_name, purchase_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_items_kind_date   ON receipt_items(kind, purchase_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_items_product     ON receipt_items(product_id, purchase_date DESC) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_expense     ON receipt_items(expense_id);

-- ─── Subscriptions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT NOT NULL,
  amount              REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  period              TEXT NOT NULL DEFAULT 'mo'
                        CHECK (period IN ('wk','mo','yr')),
  used_freq           TEXT,
  verdict             TEXT NOT NULL DEFAULT 'keep'
                        CHECK (verdict IN ('keep','cut','pause')),
  icon                TEXT NOT NULL DEFAULT '📦',
  color               TEXT NOT NULL DEFAULT '#888',
  linked_category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  cancelled           INTEGER NOT NULL DEFAULT 0,
  cancelled_at        TEXT,
  next_bill           TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subs_next_bill ON subscriptions(next_bill) WHERE cancelled = 0;

-- ─── Goals ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  emoji             TEXT NOT NULL DEFAULT '🎯',
  target_amount     REAL NOT NULL,
  saved_amount      REAL NOT NULL DEFAULT 0,  -- cached; sum of goal_contributions
  target_date       TEXT,                      -- YYYY-MM-DD
  source_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goal_contributions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id        INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  expense_id     INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  account_id     INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  amount         REAL NOT NULL,
  note           TEXT,
  contributed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal ON goal_contributions(goal_id, contributed_at DESC);

-- ─── Trips ───────────────────────────────────────────────────────
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
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id  INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  emoji    TEXT NOT NULL DEFAULT '🧳',
  budget   REAL NOT NULL DEFAULT 0  -- allocation (renamed from amount to clarify)
);

-- trip_id FK on expenses handles actual spend; trip_categories.budget is target allocation

-- ─── Pantry / Inventory ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pantry_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty            REAL NOT NULL DEFAULT 0,
  unit           TEXT NOT NULL DEFAULT 'pcs',
  canonical_qty  REAL NOT NULL DEFAULT 0,
  canonical_unit TEXT NOT NULL DEFAULT 'pcs',
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  notes          TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pantry_product ON pantry_items(product_id);

-- ─── Price snapshots (optional: manual price watch) ─────────────
CREATE TABLE IF NOT EXISTS price_snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  merchant_id  INTEGER REFERENCES merchants(id) ON DELETE SET NULL,
  unit_price   REAL NOT NULL,
  canonical_unit TEXT NOT NULL,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  source       TEXT NOT NULL DEFAULT 'receipt'
                 CHECK (source IN ('receipt','manual'))
);
CREATE INDEX IF NOT EXISTS idx_price_snap_product_date ON price_snapshots(product_id, snapshot_date DESC);
```

---

## Missing Entities (Added)

| Entity | Why Needed |
|---|---|
| `merchants` | Canonical merchant entity for analytics, deduplication, and search |
| `products` | Canonical product entity (replaces `normalized_name` string coupling) |
| `account_transactions` | Ledger-style record of every account credit/debit |
| `goal_contributions` | Append-only log of savings contributions |
| `pantry_items` | Inventory tracking: current stock on hand per product |
| `price_snapshots` | Explicit price history (supplements receipt_items for manually-entered prices) |
| `expenses_fts` | FTS5 virtual table for merchant full-text search |
| `products_fts` | FTS5 virtual table for product name search |
| `schema_version` | Single-row migration tracker |

---

## Missing Relationships (Added)

| Relationship | How Resolved |
|---|---|
| `expenses → merchants` | `merchant_id FK` replaces free-text merchant column |
| `expenses → accounts` | `account_id FK` — which account was debited |
| `expenses → trips` | `trip_id FK` — which trip this expense belongs to |
| `expenses → subscriptions` | `subscription_id FK` — which subscription was paid |
| `receipt_items → products` | `product_id FK` — canonical product entity |
| `goal_contributions → goals` | `goal_id FK` in new append-only table |
| `goal_contributions → expenses` | `expense_id FK` — link contribution to a spend event |
| `subscriptions → categories` | `linked_category_id FK` — auto-categorize subscription payments |
| `pantry_items → products` | `product_id FK` — track stock per canonical product |

---

## Migration Strategy

Migrations should be applied sequentially using the `schema_version` table:

```js
const MIGRATIONS = [
  // v1 → v2: add merchant_id to expenses
  `ALTER TABLE expenses ADD COLUMN merchant_id INTEGER REFERENCES merchants(id) ON DELETE SET NULL`,
  // v2 → v3: add deleted_at to expenses
  `ALTER TABLE expenses ADD COLUMN deleted_at TEXT`,
  // ... each future change is one entry
];

async function runMigrations(db) {
  const { version } = await db.getFirstAsync('SELECT version FROM schema_version WHERE id = 1');
  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[i]);
      await db.runAsync('UPDATE schema_version SET version = ? WHERE id = 1', [i + 1]);
    });
  }
}
```

Each migration is a single `ALTER TABLE` statement (SQLite supports `ADD COLUMN` without locking). Column additions are safe and fast regardless of table size on mobile.

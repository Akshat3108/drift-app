export const SCHEMA = `
PRAGMA foreign_keys = ON;

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

export const TABLES = [
  'receipt_items', 'expenses', 'categories',
  'subscriptions', 'goals',
  'trip_categories', 'trips',
  'accounts', 'settings', 'profile',
];

require('dotenv').config();
const pool = require('./pool');

const SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  avatar        TEXT DEFAULT 'U',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- User settings
CREATE TABLE IF NOT EXISTS settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  currency    TEXT DEFAULT 'INR',
  dark_mode   BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Budget categories (pots)
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  emoji       TEXT DEFAULT '💰',
  budget      NUMERIC(12,2) DEFAULT 0,
  color       TEXT DEFAULT 'cream',
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses / transactions
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  merchant     TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  mood         TEXT,
  carbon       NUMERIC(8,3) DEFAULT 0,
  recurring    BOOLEAN DEFAULT FALSE,
  notes        TEXT,
  receipt_url  TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Receipt line items (from OCR scan)
CREATE TABLE IF NOT EXISTS receipt_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id  UUID REFERENCES expenses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  qty         TEXT,
  price       NUMERIC(10,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  period      TEXT DEFAULT 'mo',
  used_freq   TEXT,
  verdict     TEXT DEFAULT 'keep',
  icon        TEXT DEFAULT '📦',
  color       TEXT DEFAULT '#888',
  cancelled   BOOLEAN DEFAULT FALSE,
  next_bill   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Savings goals
CREATE TABLE IF NOT EXISTS goals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  emoji         TEXT DEFAULT '🎯',
  target_amount NUMERIC(12,2) NOT NULL,
  saved_amount  NUMERIC(12,2) DEFAULT 0,
  eta           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_expenses_user_date    ON expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category     ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_categories_user       ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user    ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user            ON goals(user_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(SQL);
    console.log('✅  Migrations applied successfully');
  } catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

# Current Database Schema — Drift

**Database engine:** SQLite via `expo-sqlite` (`drift.db`)  
**Schema file:** `app/src/db/schema.js`  
**DB access layer:** `app/src/db/index.js`  
**Repo layer:** `app/src/db/repo/*.js`

---

## ER Diagram

```
┌─────────────────┐          ┌─────────────────────────────────────────────┐
│    profile      │          │                  expenses                   │
│─────────────────│          │─────────────────────────────────────────────│
│ id (PK, =1)     │          │ id           INTEGER PK AUTOINCREMENT       │
│ name  TEXT      │          │ category_id  INTEGER → categories(id) NULL  │
│ avatar TEXT     │          │ merchant     TEXT NOT NULL                  │
│ created_at TEXT │          │ amount       REAL NOT NULL                  │
└─────────────────┘          │ mood         TEXT                           │
                             │ carbon       REAL DEFAULT 0                 │
┌─────────────────┐          │ recurring    INTEGER DEFAULT 0 (bool)       │
│    settings     │          │ notes        TEXT                           │
│─────────────────│          │ receipt_uri  TEXT                           │
│ id (PK, =1)     │          │ expense_date TEXT (YYYY-MM-DD)              │
│ currency  TEXT  │          │ created_at   TEXT                           │
│ dark_mode INT   │          └──────────────────┬──────────────────────────┘
│ carbon_tracking │                             │ 1:N
└─────────────────┘                             ▼
                             ┌─────────────────────────────────────────────┐
┌─────────────────┐          │               receipt_items                 │
│   categories    │          │─────────────────────────────────────────────│
│─────────────────│          │ id              INTEGER PK AUTOINCREMENT    │
│ id   INTEGER PK │◄─────────│ expense_id      INTEGER → expenses(id) CASCADE│
│ name TEXT       │          │ name            TEXT (raw OCR name)         │
│ emoji TEXT      │          │ normalized_name TEXT (lowercased canonical) │
│ budget REAL     │          │ kind            TEXT DEFAULT 'other'        │
│ color TEXT      │          │ qty             REAL                        │
│ sort_order INT  │          │ unit            TEXT (raw unit)             │
│ created_at TEXT │          │ canonical_qty   REAL (converted to base)   │
└─────────────────┘          │ canonical_unit  TEXT (kg/L/pcs/pack)       │
                             │ unit_price      REAL (price per canon unit) │
                             │ price           REAL (line total)          │
                             │ purchase_date   TEXT (YYYY-MM-DD)          │
                             └─────────────────────────────────────────────┘

┌─────────────────────────────┐     ┌─────────────────────────────────────┐
│        subscriptions        │     │               goals                 │
│─────────────────────────────│     │─────────────────────────────────────│
│ id         INTEGER PK       │     │ id            INTEGER PK            │
│ name       TEXT             │     │ name          TEXT                  │
│ amount     REAL             │     │ emoji         TEXT                  │
│ period     TEXT (mo/yr/wk)  │     │ target_amount REAL                  │
│ used_freq  TEXT             │     │ saved_amount  REAL (mutable sum)    │
│ verdict    TEXT (keep/cut)  │     │ eta           TEXT                  │
│ icon       TEXT             │     │ created_at    TEXT                  │
│ color      TEXT             │     └─────────────────────────────────────┘
│ cancelled  INTEGER (bool)   │
│ next_bill  TEXT             │     ┌─────────────────────────────────────┐
│ created_at TEXT             │     │             accounts                │
└─────────────────────────────┘     │─────────────────────────────────────│
                                    │ id       INTEGER PK                 │
┌─────────────────────────────┐     │ kind     TEXT CHECK IN ('asset',    │
│           trips             │     │          'liability')               │
│─────────────────────────────│ 1:N │ label    TEXT                       │
│ id            INTEGER PK    │◄────│ emoji    TEXT                       │
│ name          TEXT          │     │ balance  REAL (static snapshot)     │
│ destination   TEXT          │     │ category TEXT                       │
│ start_date    TEXT          │     │ created_at TEXT                     │
│ end_date      TEXT          │     └─────────────────────────────────────┘
│ budget        REAL          │
│ home_currency TEXT          │  ┌──────────────────────────────────────────┐
│ dest_currency TEXT          │  │            trip_categories               │
│ dest_rate     REAL          │  │──────────────────────────────────────────│
│ notes         TEXT          │  │ id      INTEGER PK                       │
│ created_at    TEXT          │  │ trip_id INTEGER → trips(id) CASCADE      │
└─────────────────────────────┘  │ label   TEXT                            │
                                 │ emoji   TEXT                            │
                                 │ amount  REAL (manual entry, not derived)│
                                 └──────────────────────────────────────────┘
```

---

## Tables

### `profile`
Singleton row (enforced by `CHECK (id = 1)`). Holds the user's display name and avatar letter.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Always 1 |
| name | TEXT NOT NULL | Display name |
| avatar | TEXT NOT NULL | Single character/emoji |
| created_at | TEXT | ISO datetime |

### `settings`
Singleton row (enforced by `CHECK (id = 1)`). App-wide preferences. Uses `INSERT OR REPLACE` pattern.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Always 1 |
| currency | TEXT | ISO code, default `INR` |
| dark_mode | INTEGER | 0/1 boolean |
| carbon_tracking | INTEGER | 0/1 boolean |

### `categories`
Expense categories (called "pots" in UI). Each has an optional monthly budget.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| emoji | TEXT NOT NULL | |
| budget | REAL NOT NULL | Monthly budget; 0 = unbudgeted |
| color | TEXT NOT NULL | Theme key (cream/mint/sky/etc.) |
| sort_order | INTEGER NOT NULL | User-controlled display order |
| created_at | TEXT | ISO datetime |

### `expenses`
Core transaction table. One row per purchase event.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| category_id | INTEGER FK → categories | NULL allowed (ON DELETE SET NULL) |
| merchant | TEXT NOT NULL | Free-text; no normalization |
| amount | REAL NOT NULL | Total spend in user currency |
| mood | TEXT | Emoji tag for emotional context |
| carbon | REAL NOT NULL | CO₂ estimate, default 0 |
| recurring | INTEGER NOT NULL | 0/1; not linked to subscriptions |
| notes | TEXT | |
| receipt_uri | TEXT | Local file URI of receipt image |
| expense_date | TEXT NOT NULL | YYYY-MM-DD |
| created_at | TEXT NOT NULL | ISO datetime |

**Indexes:**
- `idx_expenses_date`: `(expense_date DESC)` — primary sort/filter
- `idx_expenses_category`: `(category_id)` — JOIN optimization

### `receipt_items`
Line items extracted from scanned receipts. One row per product line per receipt.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| expense_id | INTEGER FK → expenses | ON DELETE CASCADE |
| name | TEXT NOT NULL | Raw OCR name |
| normalized_name | TEXT NOT NULL | Lowercase canonical name for grouping |
| kind | TEXT NOT NULL | Product category (produce/dairy/etc.) |
| qty | REAL NOT NULL | Raw quantity as purchased |
| unit | TEXT NOT NULL | Raw unit (kg/pcs/L/etc.) |
| canonical_qty | REAL NOT NULL | Quantity in base unit (always kg/L/pcs) |
| canonical_unit | TEXT NOT NULL | Base unit class |
| unit_price | REAL NOT NULL | Price per canonical unit |
| price | REAL NOT NULL | Line item total |
| purchase_date | TEXT NOT NULL | Copied from parent expense date |

**Indexes:**
- `idx_items_name_date`: `(normalized_name, purchase_date)` — price history queries
- `idx_items_kind_date`: `(kind, purchase_date)` — category browsing

### `subscriptions`
Recurring payment tracking. Standalone table, not linked to `expenses`.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| amount | REAL NOT NULL | Billing amount |
| period | TEXT NOT NULL | `mo` / `yr` / `wk` |
| used_freq | TEXT | How often user uses this sub |
| verdict | TEXT NOT NULL | `keep` / `cut` / `pause` |
| icon | TEXT NOT NULL | Emoji |
| color | TEXT NOT NULL | Hex color |
| cancelled | INTEGER NOT NULL | 0/1 flag; no cancel_at date |
| next_bill | TEXT | Next billing date YYYY-MM-DD |
| created_at | TEXT | ISO datetime |

### `goals`
Savings goal tracking. `saved_amount` is a mutable accumulator with no transaction log.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| emoji | TEXT NOT NULL | |
| target_amount | REAL NOT NULL | Goal target |
| saved_amount | REAL NOT NULL | Running total; updated in-place |
| eta | TEXT | Free-text ETA (no format enforcement) |
| created_at | TEXT | ISO datetime |

### `accounts`
Net worth snapshot. Balances are manually entered, not derived from expense records.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| kind | TEXT NOT NULL | `asset` or `liability` (CHECK constraint) |
| label | TEXT NOT NULL | Account name |
| emoji | TEXT NOT NULL | |
| balance | REAL NOT NULL | Current snapshot value |
| category | TEXT | Grouping label (bank/investment/etc.) |
| created_at | TEXT | ISO datetime |

### `trips`
Travel budget management. Exchange rate is a single static value.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| destination | TEXT | |
| start_date | TEXT | YYYY-MM-DD or NULL |
| end_date | TEXT | YYYY-MM-DD or NULL |
| budget | REAL NOT NULL | Total trip budget |
| home_currency | TEXT NOT NULL | Default `INR` |
| dest_currency | TEXT NOT NULL | Default `USD` |
| dest_rate | REAL NOT NULL | Single static exchange rate |
| notes | TEXT | |
| created_at | TEXT | ISO datetime |

### `trip_categories`
Sub-category budget allocation within a trip. Amounts are manually entered, not derived.

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| trip_id | INTEGER FK → trips | ON DELETE CASCADE |
| label | TEXT NOT NULL | Category name |
| emoji | TEXT NOT NULL | |
| amount | REAL NOT NULL | Manually entered amount spent |

---

## Indexes Summary

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `idx_expenses_date` | expenses | `expense_date DESC` | Timeline sort, month filter |
| `idx_expenses_category` | expenses | `category_id` | JOIN to categories |
| `idx_items_name_date` | receipt_items | `normalized_name, purchase_date` | Price history per product |
| `idx_items_kind_date` | receipt_items | `kind, purchase_date` | Browse by food category |

---

## Data Access Layer

```
app/src/db/index.js          — SQLite singleton, getDB(), exec(), all(), one()
app/src/db/repo/
  accounts.js    — CRUD + netWorth() aggregate
  categories.js  — CRUD + auto sort_order
  expenses.js    — CRUD + summaryByCategory(), monthlyTrend(), streakDays(), createWithItems()
  goals.js       — CRUD + contribute()
  items.js       — trackedItems(), priceHistory(), consumption(), stats(), sameQtyHistory(), suggest()
  profile.js     — get/create/update (singleton)
  settings.js    — get/set (upsert pattern)
  subs.js        — CRUD + cancel/reinstate
  trips.js       — CRUD + listWithCategories(), next()
```

State management: `useAppState.js` provides a React Context. On every mutation it re-fetches up to 500 expense rows and all other tables into memory.

---

## Technology Stack

| Component | Technology |
|---|---|
| Database | SQLite (expo-sqlite v14+) |
| Platform | React Native (Expo) |
| Schema migration | None — `CREATE TABLE IF NOT EXISTS` only |
| Backup | None implemented |
| Full-text search | None — LIKE prefix only |
| Encryption | None |

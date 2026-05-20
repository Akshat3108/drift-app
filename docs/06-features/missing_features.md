# Missing Features — Drift Expense Intelligence System

> Baseline audit date: 2026-05-17
> Codebase: React Native / Expo / expo-sqlite / ML Kit OCR

---

## What the App Currently Has

| Domain | Current State |
|--------|--------------|
| Expense logging | Quick (amount+merchant) + Detailed (itemised rows) |
| Receipt scanning | On-device ML Kit OCR, 10 bill formats, confidence scoring |
| Budgets | Monthly per-category ("pots"), progress bar only |
| Item tracking | Price + consumption history per normalized item name |
| Subscriptions | Manual entry: name, amount, period, verdict, next_bill |
| Goals | Savings goal with manual contributions |
| Net worth | Manual asset/liability balance entries |
| Travel | Trip plan with currency rate + category breakdown |
| Analytics | 6-month spend trend, category breakdown, item price spark charts |
| Filtering | AllExpenses: category-only pill filter |
| Settings | Currency (5), dark mode, carbon toggle (broken) |

---

## CATEGORY 1 — CRITICAL

Features whose absence directly limits core usability for any user.

---

### F-01 · Full-Text Search

**What's missing**: There is no search capability anywhere in the app. Users cannot find an expense by merchant name, note, or item. Every screen is browse-only.

**Why it matters**: Once a user has >100 expenses, discovery without search is unusable. "Did I already pay that bill?" requires scrolling through hundreds of entries.

**Technical complexity**: Low–Medium
- SQLite FTS5 virtual table on `expenses(merchant, notes)` and `receipt_items(name, normalized_name)`
- New `SearchScreen` with live debounced query
- Backend: `ILIKE` or pg `tsvector` index

**Storage impact**: FTS5 index adds ~15% overhead on the `expenses` table (typically < 1 MB for 5,000 rows)

**Performance impact**: FTS5 queries < 5 ms on 10,000 rows with proper index

**Schema additions**:
```sql
CREATE VIRTUAL TABLE expenses_fts USING fts5(
  merchant, notes, content='expenses', content_rowid='id'
);
CREATE VIRTUAL TABLE items_fts USING fts5(
  name, normalized_name, content='receipt_items', content_rowid='id'
);
```

**Dependencies**: None

**Suggested order**: Sprint 1 — highest return for lowest cost

---

### F-02 · Advanced Multi-Dimension Filters

**What's missing**: `AllExpenses` only filters by category. No date range, amount range, merchant filter, mood filter, recurring toggle, payment method, or tag filter. No saved/named filter sets.

**Why it matters**: All meaningful expense analysis requires slicing along multiple axes simultaneously (e.g., "all Swiggy expenses > ₹500 in the last 3 months").

**Technical complexity**: Medium
- Filter state object with date range, amount range, category, merchant substring, mood, payment method, recurring flag
- FilterSheet bottom-drawer component
- SQL WHERE clause builder
- Optional: persist saved filters in a `saved_filters` table

**Storage impact**: Negligible (filter presets stored as JSON blobs)

**Performance impact**: Date + amount range queries already indexed. Combined filter adds one OR per dimension.

**Schema additions**:
```sql
CREATE TABLE saved_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: F-09 (payment method) needed for payment-method filter to be meaningful

**Suggested order**: Sprint 1

---

### F-03 · Payment Method Tracking

**What's missing**: Expenses have no `payment_method` field. Users cannot record whether a transaction was cash, UPI (GPay/PhonePe/Paytm), credit card, debit card, or wallet. Zero payment analytics.

**Why it matters**: Credit card statement reconciliation, cashback tracking, and "how much is on my card this month" are impossible without it. Essential for any Indian user with UPI + card + cash split.

**Technical complexity**: Low
- Add `payment_method TEXT` column to `expenses` (migration required)
- Payment method picker on Add/EditExpense screens
- Payment method breakdown in Trends

**Storage impact**: ~20 bytes per expense (TEXT column)

**Performance impact**: None

**Schema additions**:
```sql
ALTER TABLE expenses ADD COLUMN payment_method TEXT;
-- enum: 'cash' | 'upi' | 'credit_card' | 'debit_card' | 'wallet' | 'emi' | 'other'
```

**Dependencies**: F-17 (Schema migrations) needed to safely add this column

**Suggested order**: Sprint 1 — required for F-09 (UPI import), F-15 (statement import)

---

### F-04 · Income Tracking

**What's missing**: The app is expenses-only. There is no income entry mechanism, no income table, and no income vs. expense comparison. `totalSpend` is calculated but there is no `totalIncome` to compare it against. "Savings rate" is impossible to compute.

**Why it matters**: The most fundamental personal finance question — "how much did I save this month?" — cannot be answered. Budget surplus/deficit requires income as the reference point. Net worth change tracking requires knowing inflows.

**Technical complexity**: Medium
- New `income` table (source, amount, date, category, recurrence)
- Income entry screen (or extend Add screen with income/expense toggle)
- Income repo
- Cash flow view: income − expenses = net
- Monthly savings rate widget on Home

**Storage impact**: ~same as expenses table, likely smaller

**Performance impact**: Negligible (monthly aggregate)

**Schema additions**:
```sql
CREATE TABLE income (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  amount       REAL NOT NULL,
  income_date  TEXT NOT NULL DEFAULT (date('now')),
  category     TEXT,
  recurring    INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_income_date ON income(income_date DESC);
```

**Dependencies**: None

**Suggested order**: Sprint 2

---

### F-05 · Push Notifications & Budget Alerts

**What's missing**: Zero notification infrastructure. Users are not alerted when:
- They hit 80% of a category budget
- A subscription bill is due tomorrow
- A recurring expense hasn't been logged
- Their weekly spend exceeds a threshold
- A tracked item's price spikes

**Why it matters**: A finance app that requires active checking provides no passive safety net. Budget overruns go unnoticed.

**Technical complexity**: Medium
- `expo-notifications` for local notifications (works offline)
- `BackgroundFetch` or `TaskManager` for periodic background checks
- Notification preference settings per alert type
- Alert thresholds configurable per category budget

**Storage impact**: Negligible (notification log < 1KB)

**Performance impact**: Background task runs every 30–60 min, executes < 5 SQL queries

**Schema additions**:
```sql
CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ref_id INTEGER,
  fired_at TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: F-03 (payment method) for payment reminder context; expo-notifications SDK

**Suggested order**: Sprint 3

---

## CATEGORY 2 — HIGH ROI

High user value relative to implementation effort. The features most users in India will ask for first.

---

### F-06 · UPI / Bank SMS Auto-Import

**What's missing**: No SMS reading. Indian users receive real-time transaction SMS from banks (e.g., "INR 450.00 debited from A/c XX1234 at AMAZON on 17-05-26"). The app cannot read these to auto-create expense drafts.

**Why it matters**: Manual entry is the #1 reason finance apps are abandoned. Auto-importing from SMS eliminates >80% of manual data entry for UPI and card transactions in India. Every competing Indian app (Walnut, Money Manager, ETMONEY) does this.

**Technical complexity**: High
- `expo-sms` does not provide inbox access
- Requires `react-native-sms-retriever` or custom native module with `READ_SMS` permission
- Parser for 30+ Indian bank SMS templates (HDFC, SBI, ICICI, Axis, Kotak, YES, IDFC, IndusInd, RBL, AU, etc.)
- Amount, merchant, account last-4, debit/credit, date extraction from regex templates
- Auto-categorization from merchant name using a merchant→category mapping table
- Draft review UI (confirm or discard auto-imported transactions)
- Duplicate detection (same amount + date + merchant already exists)

**Storage impact**: SMS template cache ~50 KB; parsed draft queue ~5 KB

**Performance impact**: SMS parsing is CPU-bound but runs < 50 ms per message

**Schema additions**:
```sql
CREATE TABLE sms_import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_hash    TEXT UNIQUE,         -- prevent reimport
  parsed_json TEXT,
  expense_id  INTEGER REFERENCES expenses(id),
  status      TEXT DEFAULT 'pending', -- pending | accepted | rejected
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE merchant_category_map (
  merchant_pattern TEXT NOT NULL,
  category_id      INTEGER REFERENCES categories(id),
  payment_method   TEXT
);
```

**Dependencies**: F-03 (payment method), Android READ_SMS permission, native module

**Suggested order**: Sprint 3 — high value, requires Android native module

---

### F-07 · Data Export (CSV / PDF / JSON)

**What's missing**: No export capability. Users cannot get their data out of the app. No CSV, no PDF, no JSON dump, no backup file.

**Why it matters**: Data portability is a trust feature. Users who see no export option won't commit their financial data. Tax filing, accountant sharing, and spreadsheet analysis all require export.

**Technical complexity**: Medium
- `expo-file-system` + `expo-sharing` — available, no native module needed
- CSV: serialize expenses (with category, merchant, amount, date, payment method, mood, notes) to CSV string
- PDF: use `react-native-html-to-pdf` or render to a styled HTML string and convert
- JSON: full schema dump including receipt_items (backup/restore)
- Tax-year report (April–March for India): filtered export with category subtotals

**Storage impact**: Transient (file written to temp dir, shared, then deleted)

**Performance impact**: 5,000 expenses → CSV generation < 200 ms

**Schema additions**: None

**Dependencies**: `expo-sharing`, `expo-file-system` (already in package.json)

**Suggested order**: Sprint 2 — low risk, high trust signal

---

### F-08 · Batch Operations on Expenses

**What's missing**: No multi-select mode in `AllExpenses`. Users cannot bulk delete, bulk re-categorize, or bulk export a selection of expenses.

**Why it matters**: Fixing mis-categorized import batches (e.g., 30 Swiggy orders all in "Miscellaneous") requires 30 individual taps without batch ops.

**Technical complexity**: Low–Medium
- Long-press to enter multi-select mode (selected array in local state)
- Floating action bar with: Categorize, Delete, Export selection
- Categorize: show category picker bottom sheet applied to all selected
- Delete: confirm dialog with count

**Storage impact**: None

**Performance impact**: None

**Schema additions**: None

**Dependencies**: F-02 (filters) — batch after filter is the key use case

**Suggested order**: Sprint 2

---

### F-09 · Merchant Analytics

**What's missing**: No per-merchant analytics. Users cannot see "total spent at Swiggy," "how many times I visited Starbucks," or "my average order size at Amazon." The merchant field is just a free-text label.

**Why it matters**: Merchant-level insight answers "where is my money actually going?" at a finer grain than category. Discovering that one merchant accounts for 30% of a category is actionable.

**Technical complexity**: Medium
- Merchant normalization/deduplication (trim, lowercase, alias mapping)
- `MerchantDetailScreen` — total spend, visit count, avg transaction, monthly trend
- `merchants` analytics query in expenses repo (GROUP BY merchant, no new table needed)
- Merchant autocomplete/autofill on expense entry (suggest from past merchants)
- Top merchants widget on Home or Trends

**Storage impact**: Optional `merchant_aliases` table ~5 KB

**Performance impact**: GROUP BY merchant on indexed expense_date < 20 ms for 5,000 rows

**Schema additions**:
```sql
CREATE TABLE merchant_aliases (
  pattern     TEXT NOT NULL,  -- lowercase match
  canonical   TEXT NOT NULL,  -- display name
  category_id INTEGER REFERENCES categories(id)
);
```

**Dependencies**: None (query-only approach works without schema changes)

**Suggested order**: Sprint 2

---

### F-10 · Subscription Billing Calendar + Smart Alerts

**What's missing**: Subscriptions have a `next_bill` field that is never prominently displayed and never used for notifications. There is no calendar view of upcoming bills, no alert when a bill is due in 3 days, and no annual cost projection beyond simple `amount × 12`.

**Why it matters**: Subscriptions are the easiest place to leak money unconsciously. The `next_bill` field was built but left inert — making it actionable costs very little.

**Technical complexity**: Low–Medium
- `SubscriptionCalendarScreen`: monthly calendar view with bill markers
- `next_bill` based local push notification (fire 3 days before)
- `renewalCostAnalysis()`: actual annual cost considering cancellations + reinstatements
- Price increase detection: compare last saved `amount` with new user input on edit
- Upcoming bills widget on Home

**Storage impact**: None (next_bill already stored)

**Performance impact**: Calendar view: filter subscriptions by month — O(n) on small list

**Schema additions**:
```sql
-- Extend subscriptions table
ALTER TABLE subscriptions ADD COLUMN price_history_json TEXT; -- JSON array of {date, amount}
ALTER TABLE subscriptions ADD COLUMN annual_cost_override REAL;
```

**Dependencies**: F-05 (notifications)

**Suggested order**: Sprint 2

---

### F-11 · Recurring Expense Auto-Detection & Schedule

**What's missing**: Expenses have a `recurring` boolean flag but it's orphaned — no schedule, no prediction, no "upcoming recurring expenses" view. There is no detection of expenses that appear monthly without being flagged as recurring.

**Why it matters**: Fixed monthly costs (rent, EMIs, insurance premiums) are predictable and should surface automatically. Users should see "expected spend this month: ₹28,400" including known recurrers.

**Technical complexity**: Medium
- Recurring expense repo: query expenses WHERE recurring=1 GROUP BY merchant to find expected monthly amount
- Pattern detection: identify non-flagged expenses that appear monthly ± 3 days at similar amounts
- `RecurringScreen` or section on Subs screen: upcoming expected recurrers this month
- "Expected fixed costs" widget on Home

**Storage impact**: None

**Performance impact**: Pattern detection runs on startup over 500-expense window — < 50 ms

**Schema additions**: None (uses existing `recurring` flag + query)

**Dependencies**: F-03 (payment method helps distinguish bill payments from purchases)

**Suggested order**: Sprint 3

---

### F-12 · Tags / Custom Labels

**What's missing**: No tagging system. Users can only organize by category. There is no way to mark expenses as "work", "reimbursable", "tax-deductible", "joint", or "travel" orthogonally to category.

**Why it matters**: Tags are orthogonal to category. A Zomato order can be both "Food" (category) and "Client dinner" (tag) and "Reimbursable" (tag). Without tags, users create too many categories to compensate.

**Technical complexity**: Low–Medium
- `tags` table + `expense_tags` junction table
- Tag picker on Add/EditExpense (multi-select chips)
- Tag filter in AllExpenses/search
- Tag-based report (e.g., "all expenses tagged 'reimbursable' this quarter")

**Storage impact**: ~50 bytes per tag association; 20 tags × 1,000 expenses = 1 MB max

**Performance impact**: JOIN on junction table, but expenses per tag < 1,000

**Schema additions**:
```sql
CREATE TABLE tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#888'
);
CREATE TABLE expense_tags (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (expense_id, tag_id)
);
CREATE INDEX idx_expense_tags_tag ON expense_tags(tag_id);
```

**Dependencies**: None

**Suggested order**: Sprint 3

---

### F-13 · GST Invoice Structured Handling

**What's missing**: The OCR pipeline already extracts GSTIN, CGST, SGST, IGST, and tax amounts into the parse result — but none of this is persisted. The `expenses` table has no GST fields. Users cannot filter by GSTIN, generate input tax credit reports, or export GST-compliant invoices.

**Why it matters**: GST is mandatory metadata for every Indian business purchase. Freelancers, small business owners, and anyone filing ITR-3 needs to track GST amounts and GSTINs separately from the expense amount.

**Technical complexity**: Medium
- Persist `gstin`, `cgst`, `sgst`, `igst`, `hsn_code`, `invoice_number` from OCR parse result
- Show GST breakdown on Detail screen
- GST report export: by period, by GSTIN, with total tax claimable

**Storage impact**: ~60 bytes per expense (6 optional text/real fields)

**Performance impact**: Negligible

**Schema additions**:
```sql
ALTER TABLE expenses ADD COLUMN payment_method TEXT;
ALTER TABLE expenses ADD COLUMN gstin          TEXT;
ALTER TABLE expenses ADD COLUMN invoice_number TEXT;
ALTER TABLE expenses ADD COLUMN cgst           REAL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN sgst           REAL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN igst           REAL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN hsn_code       TEXT;
```

**Dependencies**: F-17 (schema migrations)

**Suggested order**: Sprint 3 — OCR already parses these; persistence is the only gap

---

## CATEGORY 3 — POWER USER

Significant value for users who actively manage their finances.

---

### F-14 · EMI Tracking

**What's missing**: No EMI schema, no schedule, no remaining balance, no interest calculation, no pre-closure cost. The `accounts` table has liabilities but no amortization.

**Why it matters**: Most Indian consumers have at least one active EMI (phone, appliance, two-wheeler, home loan). The total of all EMI installments is often >30% of monthly expenses. Managing them manually in a notes field is error-prone.

**Technical complexity**: Medium–High
- `emi_loans` table with principal, interest_rate, tenure_months, start_date, emi_amount
- Auto-compute amortization schedule in JS (monthly interest = outstanding × rate/12)
- Remaining balance and total interest paid running totals
- "EMI calendar" view — which EMIs are due this month
- Link EMI payments to expenses via `emi_loan_id` on expenses table
- Pre-closure calculator: remaining principal + foreclosure charges

**Storage impact**: ~200 bytes per loan + 12 bytes per installment row; 10 loans × 120 months = 120 KB max

**Performance impact**: Amortization is computed in JS, not stored; sub-millisecond

**Schema additions**:
```sql
CREATE TABLE emi_loans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  principal         REAL NOT NULL,
  interest_rate     REAL NOT NULL,  -- annual %
  tenure_months     INTEGER NOT NULL,
  start_date        TEXT NOT NULL,
  emi_amount        REAL NOT NULL,
  lender            TEXT,
  account_id        INTEGER REFERENCES accounts(id),
  status            TEXT DEFAULT 'active', -- active | closed | foreclosed
  created_at        TEXT DEFAULT (datetime('now'))
);
ALTER TABLE expenses ADD COLUMN emi_loan_id INTEGER REFERENCES emi_loans(id);
```

**Dependencies**: F-03 (payment method), F-05 (due date reminders)

**Suggested order**: Sprint 4

---

### F-15 · Credit Card Statement Import (CSV / PDF)

**What's missing**: No statement import. Users with HDFC/ICICI/SBI/Axis credit cards receive monthly PDF or CSV statements. There is no way to import them.

**Why it matters**: Power users want to reconcile statement data against manually logged expenses. Business users who put all company expenses on a card need bulk import at month-end.

**Technical complexity**: High
- PDF parsing: `react-native-pdf-lib` or send to backend Gemini endpoint for text extraction
- CSV parsing: bank-specific column mapping (each bank has different CSV format)
- Statement reconciliation: fuzzy-match imported rows against existing expenses by date + amount + merchant
- Conflict resolution UI: "already logged" vs "new" vs "duplicate"
- Statement import history log

**Storage impact**: Transient during import; imported rows become regular expenses

**Performance impact**: PDF text extraction can be slow (2–5 s per statement page); should run async

**Schema additions**:
```sql
CREATE TABLE import_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,    -- 'csv_hdfc' | 'pdf_sbi' | 'gemini'
  filename     TEXT,
  status       TEXT DEFAULT 'pending',
  rows_total   INTEGER DEFAULT 0,
  rows_imported INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);
ALTER TABLE expenses ADD COLUMN import_session_id INTEGER REFERENCES import_sessions(id);
```

**Dependencies**: F-03 (payment method), F-17 (migrations), Gemini API key for PDF extraction

**Suggested order**: Sprint 5 — high complexity, phased (CSV first, PDF later)

---

### F-16 · Fuel & Vehicle Tracking

**What's missing**: No vehicle profiles, no odometer readings, no fuel efficiency (km/L), no cost-per-km calculation, no fill-up history. The OCR recognizes fuel receipts (totals-only format) but there is no fuel-specific feature.

**Why it matters**: Fuel is a significant recurring expense for most Indian households. Fuel efficiency tracking reveals vehicle health issues and driving behavior changes.

**Technical complexity**: Medium
- `vehicles` table (name, make, model, fuel_type, purchase_date)
- Fuel fill-up log linked to vehicle: liters, amount, odometer, station, price/liter
- Efficiency calculator: (odometer_new − odometer_old) / liters_filled
- Fuel price trend chart (overlaps with item price tracking)
- Link fill-up to expenses via expense_id

**Storage impact**: ~100 bytes per fill-up; 1 fill-up/week = 5 KB/year

**Performance impact**: Negligible

**Schema additions**:
```sql
CREATE TABLE vehicles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  fuel_type    TEXT DEFAULT 'petrol', -- petrol | diesel | cng | ev
  make         TEXT,
  model        TEXT,
  year         INTEGER,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE TABLE fuel_fillups (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id),
  expense_id   INTEGER REFERENCES expenses(id),
  liters       REAL NOT NULL,
  amount       REAL NOT NULL,
  odometer     REAL,
  station      TEXT,
  fill_date    TEXT NOT NULL DEFAULT (date('now')),
  created_at   TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: None

**Suggested order**: Sprint 4

---

### F-17 · Schema Migration System

**What's missing**: The current DDL uses `CREATE TABLE IF NOT EXISTS` with no versioning. New columns added to existing tables will **never be applied** to existing installations. This blocks all other features that require schema additions.

**Why it matters**: Every feature in Category 1–4 adds columns or tables. Without migrations, shipping F-03 (payment_method column) would silently leave existing users with no payment_method column.

**Technical complexity**: Low
- `_meta` table with `schema_version INTEGER`
- `MIGRATIONS` array with `{ version, up: sql }` entries
- Run pending migrations on `getDB()` call
- Transaction-wrapped per migration

**Storage impact**: `_meta` table = ~50 bytes

**Performance impact**: Negligible at startup (only runs new migrations)

**Schema additions**:
```sql
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

**Dependencies**: None — must be first

**Suggested order**: Sprint 1 — unblocks all other schema-dependent features

---

### F-18 · Pantry / Household Inventory Tracking

**What's missing**: Items are tracked by purchase history but there is no "current stock" concept. The app knows you bought 1 kg tomatoes on Monday but doesn't know if you still have them.

**Why it matters**: Pantry tracking closes the loop between purchase and consumption. Combined with consumption rates (already tracked), the app can predict "you'll run out of rice in ~4 days" and generate shopping lists.

**Technical complexity**: High
- `pantry_items` table: item, quantity, unit, bought_date, expiry_date, source_expense_id
- Pantry entry screen (manual) + auto-create from scanned receipt items
- Stock depletion: user marks "used X amount" or auto-deplete by consumption rate
- Low-stock alerts (push notification when pantry item drops below reorder threshold)
- Shopping list generation: items below reorder point, sorted by urgency

**Storage impact**: ~150 bytes per pantry item; 100 active items = 15 KB

**Performance impact**: Low-stock check runs on app foreground — O(n) on pantry items

**Schema additions**:
```sql
CREATE TABLE pantry_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name  TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  qty              REAL NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT 'pcs',
  canonical_qty    REAL NOT NULL DEFAULT 0,
  canonical_unit   TEXT NOT NULL DEFAULT 'pcs',
  reorder_qty      REAL DEFAULT 0,
  expiry_date      TEXT,
  source_expense_id INTEGER REFERENCES expenses(id),
  updated_at       TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: F-05 (notifications for low-stock), items repo (normalized_name linkage)

**Suggested order**: Sprint 5

---

### F-19 · Item Price Alerts

**What's missing**: No way to set a price alert on any tracked item. Users cannot say "alert me if tomatoes cost more than ₹100/kg at my next purchase."

**Why it matters**: With inflation tracking already built, price alerts are the actionable layer on top. They turn passive data into active guidance.

**Technical complexity**: Low–Medium
- `price_alerts` table: normalized_name, threshold_price, canonical_unit, direction (above/below), enabled
- Check on each new item scan: if any price alert fires, push local notification
- Alert management UI accessible from ItemTrend screen

**Storage impact**: ~80 bytes per alert; 20 alerts = 1.6 KB

**Performance impact**: Checked per scan (< 5 ms SQL query)

**Schema additions**:
```sql
CREATE TABLE price_alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL,
  threshold_price REAL NOT NULL,
  canonical_unit  TEXT NOT NULL,
  direction       TEXT DEFAULT 'above', -- above | below
  enabled         INTEGER DEFAULT 1,
  last_fired_at   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: F-05 (push notifications)

**Suggested order**: Sprint 4

---

### F-20 · Calendar View of Expenses

**What's missing**: No calendar-based expense view. Users cannot see "how much did I spend on specific days this week?" in a visual layout. `AllExpenses` is a flat chronological list.

**Why it matters**: Calendar view is the primary pattern in many successful expense apps (Toshl, Spendee) because it maps naturally to how people think about time and money.

**Technical complexity**: Medium
- Custom calendar grid component (can be built with View + TouchableOpacity — no native dep)
- Day cell = date + total spend amount indicator (dot/bar)
- Tap a day → show day's expense list
- Week view and month view toggle

**Storage impact**: None

**Performance impact**: Month view renders up to 31 day buckets, each a simple aggregate

**Schema additions**: None

**Dependencies**: None

**Suggested order**: Sprint 4

---

### F-21 · Rollover Budgets + Budget Alerts

**What's missing**: Budget is monthly-only, static, no carry-forward. No alerts when approaching limits. No "zero-based" or envelope budgeting mode.

**Why it matters**: Strict monthly resets penalize users for legitimate spending lumpiness. Rollover budgets (unused budget carries to next month) and threshold alerts are standard in Mint/YNAB and expected by serious budget users.

**Technical complexity**: Medium
- `budget_periods` table to store rollover amounts per category per month
- Alert threshold setting per category (e.g., notify at 80%)
- Rollover calculator: end-of-month job
- Optional: weekly budget slice (divide monthly by 4)

**Storage impact**: ~50 bytes per category per month; 10 cats × 24 months = 12 KB

**Performance impact**: End-of-month job is lightweight

**Schema additions**:
```sql
ALTER TABLE categories ADD COLUMN budget_alert_pct REAL DEFAULT 80;
ALTER TABLE categories ADD COLUMN rollover INTEGER DEFAULT 0;

CREATE TABLE budget_rollover (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  month        TEXT NOT NULL,             -- YYYY-MM
  allocated    REAL NOT NULL,
  spent        REAL NOT NULL,
  rolled_over  REAL NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(category_id, month)
);
```

**Dependencies**: F-05 (alert notifications), F-17 (migrations)

**Suggested order**: Sprint 4

---

### F-22 · Split Expenses

**What's missing**: No expense splitting. Users cannot split a dinner bill with friends, track who paid, or record "X owes me ₹500." No settlement tracking.

**Why it matters**: Group expenses (dinners, trips, shared rent) are extremely common. The Travel feature already tracks group trip budgets but has no per-person cost splitting.

**Technical complexity**: High
- `people` table (name, UPI ID optional)
- `expense_splits` junction table (expense_id, person_id, share_amount, settled)
- Settlement tracker: running balance per person
- Settlement via UPI deep link (optional)

**Storage impact**: ~100 bytes per split; 10 splits/week = 5 KB/month

**Performance impact**: Unsettled balance query is a simple aggregate

**Schema additions**:
```sql
CREATE TABLE people (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  upi_id   TEXT,
  emoji    TEXT DEFAULT '👤'
);
CREATE TABLE expense_splits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people(id),
  share_pct   REAL,
  share_amount REAL NOT NULL,
  settled     INTEGER DEFAULT 0,
  settled_at  TEXT,
  notes       TEXT
);
```

**Dependencies**: F-06 (UPI ID useful for settlement)

**Suggested order**: Sprint 5

---

## CATEGORY 4 — ADVANCED

High complexity or lower frequency use cases for dedicated power users.

---

### F-23 · FASTag Transaction Import

**What's missing**: No FASTag wallet tracking, no toll expense auto-import, no highway route tracking.

**Why it matters**: FASTag is mandatory on all Indian national highways. Frequent drivers accumulate significant toll expenses that appear as a single deduction from their FASTag wallet — never individually logged.

**Technical complexity**: High
- FASTag balance tracking (manual or via NHAI API if available)
- Toll transaction import via NHAI portal CSV download
- Route recognition: identify toll plazas from transaction data to determine highway used
- Link to vehicle profile (F-16)

**Schema additions**:
```sql
CREATE TABLE fastag_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id  INTEGER REFERENCES vehicles(id),
  tag_id      TEXT,
  bank        TEXT,
  balance     REAL DEFAULT 0,
  updated_at  TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: F-16 (vehicle profiles), F-07 (export for reconciliation)

**Suggested order**: Sprint 6

---

### F-24 · Utility Bill Unit-Rate Tracking

**What's missing**: No utility account tracking. Users can log electricity bills as expenses, but cannot track kWh consumed, rate per unit, or month-on-month consumption trends.

**Why it matters**: Utility costs are rising. Knowing your kWh consumption trend and per-unit cost trend (as rates are revised) helps identify conservation opportunities and detect billing errors.

**Technical complexity**: Medium
- `utility_accounts` table (type: electricity/water/gas/piped-gas, account number, provider, meter)
- Bill entry: total amount + units consumed + unit rate
- Consumption trend chart (units per month)
- Rate trend chart (per unit cost over time)
- OCR already recognizes utility format — extend to extract meter reading

**Schema additions**:
```sql
CREATE TABLE utility_accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL, -- electricity | water | gas
  provider     TEXT,
  account_no   TEXT,
  meter_no     TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE TABLE utility_bills (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id        INTEGER NOT NULL REFERENCES utility_accounts(id),
  expense_id        INTEGER REFERENCES expenses(id),
  bill_date         TEXT NOT NULL,
  units_consumed    REAL,
  unit_rate         REAL,
  amount            REAL NOT NULL,
  reading_start     REAL,
  reading_end       REAL,
  created_at        TEXT DEFAULT (datetime('now'))
);
```

**Dependencies**: F-17 (migrations), F-13 (OCR persistence)

**Suggested order**: Sprint 5

---

### F-25 · Receipt Image Gallery & Viewer

**What's missing**: `receipt_uri` is stored per expense (local file path) but there is no way to view the receipt image from the Detail screen. No receipt gallery. Images are silently lost if the app is reinstalled or storage is cleared.

**Why it matters**: Receipt images are proof of purchase for warranties, insurance claims, and expense reimbursements. Storing the URI without a viewer makes the feature incomplete.

**Technical complexity**: Low–Medium
- Image viewer modal on Detail screen (if `receipt_uri` is set)
- Receipt gallery screen (all expenses with receipts, paginated)
- Optional: backup images to local document storage (not camera roll) using `expo-file-system` permanent directory

**Storage impact**: Receipt images ~150 KB each; moving to permanent storage uses device space

**Performance impact**: Negligible

**Schema additions**: None

**Dependencies**: `expo-image` or `Image` component

**Suggested order**: Sprint 3 — low effort, closes an embarrassing gap

---

### F-26 · Savings Rate & Cash Flow Statement

**What's missing**: No cash flow view. No savings rate. No "how much did I save vs. earn this month?"

**Why it matters**: The delta between income and expenses — the savings rate — is the single most important personal finance metric.

**Technical complexity**: Low (after F-04 income is implemented)
- Monthly P&L: income − expenses = surplus/deficit
- Savings rate: (income − expenses) / income × 100
- Cash flow screen: monthly inflow + outflow bars

**Storage impact**: None (computed from income + expenses tables)

**Performance impact**: Two SQL aggregates per month < 5 ms

**Schema additions**: Requires F-04 (income table)

**Dependencies**: F-04 (income tracking)

**Suggested order**: Sprint 3 (immediately after F-04)

---

### F-27 · Loan / Mortgage Tracking

**What's missing**: `accounts` has `liability` kind but no amortization. Home loans, car loans, and personal loans require principal + interest breakdown, monthly statements, and foreclosure calculations.

**Why it matters**: Home loans of ₹30–80L are the single largest financial item for most Indian middle-class users. Tracking the outstanding principal and cumulative interest paid is essential.

**Technical complexity**: High — overlaps with EMI (F-14)
- Loan type: home | car | personal | education
- EMI breakdown: principal_component + interest_component per month
- Tax benefit calculation (Section 80C/24B for home loan principal/interest)
- Prepayment impact simulator

**Schema additions**: Builds on `emi_loans` table from F-14

**Dependencies**: F-14 (EMI tracking)

**Suggested order**: Sprint 6

---

## CATEGORY 5 — EXPERIMENTAL

Research-grade, ML-dependent, or high-risk/high-reward features.

---

### F-28 · Offline Predictive Input

**What's missing**: No predictive amount entry. When a user types "Swiggy," the app doesn't suggest the last or typical order amount.

**What it would do**: Auto-fill amount and category when a known merchant is typed. Predict next expected visit date for recurring merchants. Show "last time you spent ₹X here" prompt.

**Technical complexity**: Medium
- Merchant history lookup: last 5 amounts at same merchant
- Moving average suggestion
- Inline suggestion chip in Add screen

**Dependencies**: None (all data already in SQLite)

**Suggested order**: Sprint 4 (quick win after merchant analytics)

---

### F-29 · Anomaly Detection & Spend Alerts

**What's missing**: No anomaly detection. If a user suddenly spends 3× their normal restaurant budget in a week, nothing flags it.

**What it would do**: Identify expenses that are statistical outliers vs. historical mean ± 2σ for the same category/merchant. Alert the user in-app.

**Technical complexity**: High (on-device statistics)
- Rolling mean and standard deviation per category/merchant
- Z-score calculation per new expense
- Alert threshold configuration
- False-positive suppression (salary day, travel weeks)

**Dependencies**: F-05 (notifications), at least 3 months of data

**Suggested order**: Sprint 7+

---

### F-30 · Smart Merchant → Category Auto-Assignment

**What's missing**: No auto-categorization. When "Swiggy" is detected in a bank SMS or entered manually, it's not automatically assigned to "Food & Drink."

**What it would do**: Maintain a `merchant_category_map` with curated entries for 1,000+ Indian merchants. On expense creation, auto-select category and payment method from merchant name.

**Technical complexity**: Medium
- Bundled merchant map JSON (shipped with app, ~50 KB)
- User override persisted to `merchant_aliases` table (F-09)
- Fuzzy match on merchant name (Levenshtein or prefix match)

**Dependencies**: F-09 (merchant aliases table)

**Suggested order**: Sprint 4

---

### F-31 · Item Price Prediction & Shopping Intelligence

**What's missing**: No price forecasting. With 6+ months of item purchase data, seasonal price patterns (mangoes are cheap in June, expensive in December) could be modeled.

**What it would do**: Predict next expected unit price for tracked items. Identify "buy now" vs "wait" for seasonal produce. Suggest quantities to buy based on consumption rate + shelf life.

**Technical complexity**: Very High
- Time-series regression per normalized_name (linear or LOESS)
- Seasonal decomposition (weekly, monthly patterns)
- Confidence intervals on predictions
- Requires 12+ data points per item for meaningful prediction

**Dependencies**: F-18 (pantry for shelf life), 6+ months of item data

**Suggested order**: Sprint 8+

---

### F-32 · Proper Carbon Footprint Tracking

**What's missing**: Carbon is currently always 0.4 kg per expense regardless of type. This is meaningless. A flight should be 200× more carbon than a coffee.

**What it would do**: Category-specific emission factors (food, transport, utilities, clothing). Receipt item–level emission factors (beef vs. lentils vs. vegetables). Integration with item tracking for more accurate grocery emissions.

**Technical complexity**: High
- Emission factor database (UK DEFRA / India-specific)
- Category-level defaults configurable per pot
- Item-level overrides from normalized_name lookup
- Carbon budget per month + trend
- "Carbon saved vs. average" calculation

**Dependencies**: F-18 (item tracking for grocery emissions), emission factor data source

**Suggested order**: Sprint 7

---

## Feature Count Summary

| Category | Count | Features |
|----------|-------|---------|
| Critical | 5 | F-01 to F-05 |
| High ROI | 8 | F-06 to F-13 |
| Power User | 9 | F-14 to F-22 |
| Advanced | 5 | F-23 to F-27 |
| Experimental | 5 | F-28 to F-32 |
| **Total** | **32** | |

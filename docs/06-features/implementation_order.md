# Implementation Order — Drift Feature Roadmap

> Organized into Sprints of approximately 1–2 weeks each.
> Each sprint is self-contained: shippable at the end, no cliff-hanger dependencies.
> Schema migrations are always done first within a sprint.

---

## Sprint 0 — Foundation (must ship before anything else)
**Duration**: 2–3 days  
**Goal**: Unblock all future schema-dependent features + fix the two most impactful architecture bugs.

| Step | Task | Feature | Why First |
|------|------|---------|-----------|
| 0-A | Add `_meta` table + migration runner | F-17 | Every subsequent sprint adds schema; migrations are the prerequisite |
| 0-B | Fix `getDB()` — reset `_opening` on failure | arch | Prevents silent DB freeze on startup failure |
| 0-C | Fix 500-expense hardcoded limit → SQL aggregate for summary | arch | Data correctness bug for any user with >500 expenses |
| 0-D | Add Error Boundaries to all feature screens | arch | Prevents full-app crashes from isolated errors |

**Output**: Migrations run cleanly; existing users unaffected; app does not crash on DB error.

---

## Sprint 1 — Core Discoverability
**Duration**: 5–7 days  
**Goal**: Users can find any past expense in under 3 taps.

### 1-A: Full-Text Search (F-01) — 2 days

**Schema migration (version 1)**:
```sql
CREATE VIRTUAL TABLE expenses_fts USING fts5(
  merchant, notes,
  content='expenses', content_rowid='id'
);
CREATE VIRTUAL TABLE items_fts USING fts5(
  name, normalized_name,
  content='receipt_items', content_rowid='id'
);
-- Triggers to keep FTS in sync
CREATE TRIGGER expenses_fts_insert AFTER INSERT ON expenses BEGIN
  INSERT INTO expenses_fts(rowid, merchant, notes) VALUES (new.id, new.merchant, new.notes);
END;
CREATE TRIGGER expenses_fts_update AFTER UPDATE ON expenses BEGIN
  INSERT INTO expenses_fts(expenses_fts, rowid, merchant, notes) VALUES ('delete', old.id, old.merchant, old.notes);
  INSERT INTO expenses_fts(rowid, merchant, notes) VALUES (new.id, new.merchant, new.notes);
END;
CREATE TRIGGER expenses_fts_delete AFTER DELETE ON expenses BEGIN
  INSERT INTO expenses_fts(expenses_fts, rowid, merchant, notes) VALUES ('delete', old.id, old.merchant, old.notes);
END;
```

**Implementation**:
```
app/src/features/search/
  SearchScreen.js      ← TextInput → debounced FTS query → expense list
  useSearch.js         ← hook: query(text, filters) → results[]
  SearchBar.js         ← reusable search bar component
```

**Add to navigation**: Stack screen `Search` accessible from Home header icon.

**Query**:
```sql
SELECT e.*, c.name AS category_name, c.emoji AS category_emoji
FROM expenses e
LEFT JOIN categories c ON c.id = e.category_id
WHERE e.id IN (
  SELECT rowid FROM expenses_fts WHERE expenses_fts MATCH ?
)
ORDER BY e.expense_date DESC
LIMIT 50
```

---

### 1-B: Payment Method Field (F-03) — 1 day

**Schema migration (version 2)**:
```sql
ALTER TABLE expenses ADD COLUMN payment_method TEXT;
```

**Implementation**:
- Add payment method picker to `Add.js` and `EditExpense.js`
- 6 options: Cash / UPI / Credit Card / Debit Card / Wallet / EMI
- Show payment method badge on Detail screen and AllExpenses list

---

### 1-C: Advanced Filters (F-02) — 2 days

**Implementation**:
```
app/src/components/
  FilterSheet.js    ← bottom-sheet filter panel
  DateRangePicker.js ← simple YYYY-MM-DD range inputs
```

**Filters added to AllExpenses**:
- Date range (from / to)
- Amount range (min / max)
- Payment method (multi-select pills)
- Merchant contains (text input)
- Mood (emoji multi-select)
- Recurring only toggle

---

## Sprint 2 — Data Portability + Batch
**Duration**: 5 days  
**Goal**: Users own their data. Power users can correct import errors in bulk.

### 2-A: Data Export (F-07) — 2 days

**Implementation**:
```
app/src/features/export/
  ExportScreen.js      ← format picker + date range + preview row count
  exportCSV.js         ← serialize expenses to RFC 4180 CSV
  exportJSON.js        ← full schema dump (backup)
  exportPDF.js         ← HTML template → expo-print → PDF
```

**CSV columns**: `id, date, merchant, amount, category, payment_method, mood, recurring, notes, carbon, tags`

**PDF template**: Monthly report with category pie, top merchants table, expense list by category.

**Integration**:
- Export button in Profile screen "More" section
- Share via `expo-sharing` (system share sheet → Files, email, Drive)
- Tax year shortcut (April–March): pre-fills date range

---

### 2-B: Batch Operations (F-08) — 1.5 days

**Implementation**:
- Long-press any expense row in AllExpenses → enters multi-select mode
- Selected items shown with checkboxes
- Floating action bar: `Categorize | Delete | Export`
- Batch categorize: bottom sheet category picker → apply to all selected
- Batch delete: confirmation dialog with count + total amount

---

### 2-C: Receipt Image Viewer (F-25) — 0.5 days

**Implementation**:
- On `Detail.js`, if `e.receipt_uri` is set: show receipt thumbnail button
- Tap → full-screen image modal with pan/zoom (`react-native-gesture-handler`)
- On save (`Add.js`, `Scan.js`): copy receipt image to `expo-file-system` Documents directory to survive cache clears

---

## Sprint 3 — Merchant Intelligence + Income
**Duration**: 7–8 days

### 3-A: Merchant Analytics (F-09) — 2 days

**New SQL queries in expenses repo**:
```sql
-- Top merchants by total spend
SELECT merchant,
       COUNT(*)      AS visit_count,
       SUM(amount)   AS total_spend,
       AVG(amount)   AS avg_spend,
       MAX(expense_date) AS last_visit
FROM expenses
WHERE substr(expense_date,1,7) = ?
GROUP BY merchant
ORDER BY total_spend DESC
LIMIT 20;
```

**New screen**: `MerchantDetailScreen` — total spend, monthly chart, all transactions at this merchant.

**Merchant autocomplete in Add screen**: suggest from `SELECT DISTINCT merchant FROM expenses ORDER BY MAX(created_at) DESC LIMIT 10` as user types.

**Merchant alias table** (migration version 3):
```sql
CREATE TABLE merchant_aliases (
  pattern    TEXT NOT NULL PRIMARY KEY,  -- lowercase
  canonical  TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  payment_method TEXT
);
```

---

### 3-B: Smart Merchant Auto-Category (F-30) — 1 day

**Bundled merchant map** (`app/src/data/merchantMap.json`, ~1,000 entries):
```json
{
  "swiggy":     { "category": "food", "payment_method": "upi" },
  "zomato":     { "category": "food", "payment_method": "upi" },
  "amazon":     { "category": "shopping", "payment_method": "credit_card" },
  "blinkit":    { "category": "groceries", "payment_method": "upi" },
  "hdfc bank":  { "category": "bills", "payment_method": "credit_card" }
}
```

**Logic**: On merchant name change in Add screen, lookup lowercase in map → auto-set category + payment method (user can override).

**User overrides** persist to `merchant_aliases` table, taking priority over bundled map.

---

### 3-C: Income Tracking (F-04) — 2 days

**Schema migration (version 4)**:
```sql
CREATE TABLE income (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL,
  amount       REAL NOT NULL,
  income_date  TEXT NOT NULL DEFAULT (date('now')),
  category     TEXT,  -- salary | freelance | interest | rental | other
  recurring    INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_income_date ON income(income_date DESC);
```

**Implementation**:
- `Add.js`: Income/Expense toggle at top (default: Expense)
- New `income` repo: create, update, remove, listByMonth, monthlyTotal
- Income reflected in AppProvider (or future IncomeContext)
- Income entries appear in AllExpenses with `+` prefix and green color

---

### 3-D: Savings Rate / Cash Flow (F-26) — 0.5 days

**Widget on Home** (after income is tracked):
```
Income this month:   ₹85,000
Expenses this month: ₹42,300
────────────────────────────
Net saved:           ₹42,700  (50.2% savings rate)
```

**New summary query**:
```sql
SELECT
  (SELECT COALESCE(SUM(amount),0) FROM income WHERE substr(income_date,1,7)=?) AS income_total,
  (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE substr(expense_date,1,7)=?) AS expense_total
```

---

### 3-E: GST Invoice Persistence (F-13) — 1.5 days

**Schema migration (version 5)**:
```sql
ALTER TABLE expenses ADD COLUMN gstin          TEXT;
ALTER TABLE expenses ADD COLUMN invoice_number TEXT;
ALTER TABLE expenses ADD COLUMN cgst           REAL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN sgst           REAL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN igst           REAL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN hsn_code       TEXT;
```

**Implementation**:
- `Scan.js`: after parse, populate GST fields from `parsed.gstin`, `parsed.tax`, etc.
- `Detail.js`: show GST breakdown block if any GST field is non-zero
- GST report in export: filter expenses with `gstin IS NOT NULL`, group by GSTIN, sum CGST+SGST+IGST

---

## Sprint 4 — Budget Intelligence + Subscriptions
**Duration**: 7 days

### 4-A: Push Notifications + Budget Alerts (F-05) — 2 days

**Setup**:
```
app/src/notifications/
  notificationService.js  ← register, schedule, cancel via expo-notifications
  budgetAlerts.js         ← check budget % on each expense save
  subscriptionAlerts.js   ← schedule 3-day reminder on next_bill change
```

**Budget alert**: fires when `(spend / budget) >= alert_threshold` (default 80%).
Stored in `notification_log` to prevent re-firing same alert in same month.

**Schema migration (version 6)**:
```sql
ALTER TABLE categories ADD COLUMN budget_alert_pct REAL DEFAULT 80;

CREATE TABLE notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,         -- budget_alert | sub_due | price_spike
  ref_id INTEGER,
  ref_month TEXT,
  fired_at TEXT DEFAULT (datetime('now'))
);
```

---

### 4-B: Subscription Calendar + Alerts (F-10) — 2 days

**New components**:
- `SubscriptionCalendarScreen`: monthly calendar with subscription due date markers
- Upcoming bills section on Subs screen (next 30 days)
- Price change detection: on `updateSub`, if `amount` changed vs. stored → show "price increased by X" badge

**Schema migration (version 7)**:
```sql
ALTER TABLE subscriptions ADD COLUMN price_history_json TEXT; -- [{date, amount}] JSON array
```

**Notification**: Schedule local notification `next_bill - 3 days` on every `addSub`/`updateSub`.

---

### 4-C: Tags (F-12) — 1.5 days

**Schema migration (version 8)**:
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
```

**Implementation**:
- Tag picker on Add/EditExpense (inline chip multi-select)
- Tag filter in F-02 filter sheet
- Tag-based export filter

---

### 4-D: Predictive Amount Input (F-28) — 1 day

**In Add screen**: when `merchant` field has ≥ 3 chars:
```sql
SELECT amount, COUNT(*) AS freq
FROM expenses
WHERE merchant LIKE ? || '%'
GROUP BY amount
ORDER BY MAX(created_at) DESC
LIMIT 1
```
Show inline chip: "Last time: ₹450 — tap to use"

---

### 4-E: Rollover Budgets (F-21) — 1 day

**Schema migration (version 9)**:
```sql
ALTER TABLE categories ADD COLUMN rollover INTEGER DEFAULT 0;

CREATE TABLE budget_rollover (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  month       TEXT NOT NULL,
  allocated   REAL NOT NULL,
  spent       REAL NOT NULL,
  rolled_over REAL NOT NULL DEFAULT 0,
  UNIQUE(category_id, month)
);
```

**Logic**: On first `refresh()` call in a new month, compute previous month's rollover:
`rolled_over = MAX(0, allocated - spent)` → add to current month's budget.

---

## Sprint 5 — Vehicle + EMI + Calendar View
**Duration**: 8 days

### 5-A: Fuel & Vehicle Tracking (F-16) — 3 days

**Schema migration (version 10)**:
```sql
CREATE TABLE vehicles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  fuel_type TEXT DEFAULT 'petrol',
  make      TEXT, model TEXT, year INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE fuel_fillups (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  expense_id INTEGER REFERENCES expenses(id),
  liters     REAL NOT NULL,
  amount     REAL NOT NULL,
  odometer   REAL,
  station    TEXT,
  fill_date  TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT DEFAULT (datetime('now'))
);
```

**New screens**:
- `VehiclesScreen` (list of vehicles + fuel history)
- `FuelFillupScreen` (add fill-up, optionally link to expense)
- `FuelStatsScreen` (efficiency chart, cost/km, price per liter trend)

**OCR integration**: When fuel format is detected by `detectFormat.js`, auto-prompt to log a fill-up from the scanned amount.

---

### 5-B: EMI Tracking (F-14) — 3 days

**Schema migration (version 11)**:
```sql
CREATE TABLE emi_loans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  principal       REAL NOT NULL,
  interest_rate   REAL NOT NULL,
  tenure_months   INTEGER NOT NULL,
  start_date      TEXT NOT NULL,
  emi_amount      REAL NOT NULL,
  lender          TEXT,
  status          TEXT DEFAULT 'active',
  created_at      TEXT DEFAULT (datetime('now'))
);
ALTER TABLE expenses ADD COLUMN emi_loan_id INTEGER REFERENCES emi_loans(id);
```

**New screens**:
- `EMIScreen` (list of active EMIs, total monthly EMI burden)
- `EMIDetailScreen` (amortization table, principal paid, interest paid, remaining balance)
- `EditEMIScreen`

**Amortization JS function** (pure function, no DB storage per row):
```js
function amortize(principal, annualRate, months, startDate) {
  const monthlyRate = annualRate / 100 / 12;
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months)
            / (Math.pow(1 + monthlyRate, months) - 1);
  const schedule = [];
  let balance = principal;
  for (let i = 0; i < months; i++) {
    const interest = balance * monthlyRate;
    const principalPaid = emi - interest;
    balance -= principalPaid;
    schedule.push({ month: addMonths(startDate, i), emi, interest, principalPaid, balance });
  }
  return schedule;
}
```

---

### 5-C: Calendar View (F-20) — 2 days

**New component**:
```
app/src/components/
  CalendarGrid.js  ← pure component: year/month, dates array, dot data
```

**New screen**: `CalendarScreen` — tap a date → day's expense list in bottom sheet.

**Data**: `SELECT expense_date, SUM(amount), COUNT(*) FROM expenses WHERE substr(expense_date,1,7)=? GROUP BY expense_date`

**Navigation**: Add "Calendar" tab or accessible from Home header.

---

## Sprint 6 — Power Import (SMS + Statement)
**Duration**: 10–12 days  
**Note**: These features have highest complexity and must be de-risked with a spike first.

### 6-A: UPI / Bank SMS Import (F-06) — 5 days

**Architecture**:
```
app/src/features/smsImport/
  SmsPermission.js        ← request READ_SMS on first use, explain why
  SmsReader.native.js     ← native module (Java/Kotlin) to read inbox
  SmsParser.js            ← regex templates per bank
  SmsDraftReview.js       ← list of parsed drafts, accept/reject each
  smsPatterns.js          ← 30+ bank templates
```

**Bank SMS templates to implement**:
- HDFC: "INR \d+ debited from A/c \*\*(\d{4}) on (\d{2}-\d{2}-\d{2}) at (.+)\."
- SBI: "Your a/c .+ is debited by Rs\.(\d+\.?\d*) on (\d{2}/\d{2}/\d{4})"
- ICICI: "ICICI Bank Acct XX(\d{4}) debited by INR (\d+\.?\d*) on (\d{2}-\d{2}-\d{4})"
- Axis, Kotak, YES, IDFC, IndusInd, RBL, AU, Federal (6 more)
- UPI: "You have successfully paid (\d+\.?\d*) to (.+) using"

**Schema migration (version 12)**:
```sql
CREATE TABLE sms_import_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_hash    TEXT UNIQUE,
  parsed_json TEXT,
  expense_id  INTEGER REFERENCES expenses(id),
  status      TEXT DEFAULT 'pending',
  created_at  TEXT DEFAULT (datetime('now'))
);
```

**Duplicate check**: compute hash of (amount + date + last4) — if exists in `sms_import_log`, skip.

---

### 6-B: Credit Card Statement Import — CSV (F-15, phase 1) — 3 days

**Supported formats** (CSV only, phase 1):
- HDFC Credit Card: `Date, Narration, Debit, Credit, Chq./Ref.No.`
- SBI Credit Card: `Txn Date, Details, Amount (in Rs.)`
- ICICI Credit Card: `Date, Details, Amount (INR), Type`

**Implementation**:
```
app/src/features/statementImport/
  ImportScreen.js        ← file picker + format auto-detect
  CsvParser.js           ← bank-specific column mapping
  ReconciliationScreen.js ← side-by-side: imported vs. already-logged
  ImportService.js       ← orchestrates parse → reconcile → bulk insert
```

**Reconciliation logic**: For each imported row, query:
```sql
SELECT id FROM expenses
WHERE ABS(amount - ?) < 0.01
  AND expense_date = ?
  AND payment_method IN ('credit_card', 'debit_card')
LIMIT 1
```
If match found: mark as "already logged". Otherwise: show as new draft.

---

## Sprint 7 — Pantry + Price Alerts
**Duration**: 7 days

### 7-A: Pantry / Inventory (F-18) — 4 days

**Schema migration (version 13)**:
```sql
CREATE TABLE pantry_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name  TEXT NOT NULL UNIQUE,
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

**Auto-populate**: After a scanned receipt is saved → offer "Add items to pantry?" for each receipt item.

**Depletion UX**: Long-press a pantry item → "Used some / all" → subtract quantity.

**Shopping list**: `SELECT * FROM pantry_items WHERE canonical_qty <= reorder_qty ORDER BY (canonical_qty / NULLIF(reorder_qty,0)) ASC`

**Low-stock notification**: Check on app foreground; fire if any item crosses below reorder threshold.

---

### 7-B: Item Price Alerts (F-19) — 1.5 days

**Schema migration (version 14)**:
```sql
CREATE TABLE price_alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_name TEXT NOT NULL,
  threshold_price REAL NOT NULL,
  canonical_unit  TEXT NOT NULL,
  direction       TEXT DEFAULT 'above',
  enabled         INTEGER DEFAULT 1,
  last_fired_at   TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);
```

**Alert check in `Scan.js`** after receipt is parsed (before user review):
```js
for (const item of parsedItems) {
  const alerts = await priceAlertRepo.activeFor(item.normalized_name);
  for (const alert of alerts) {
    if (alert.direction === 'above' && item.unit_price > alert.threshold_price) {
      scheduleLocalNotification(`${item.display_name} is now ₹${item.unit_price}/...`);
    }
  }
}
```

---

### 7-C: Split Expenses (F-22) — 1.5 days

**Schema migration (version 15)**:
```sql
CREATE TABLE people (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,
  upi_id TEXT,
  emoji TEXT DEFAULT '👤'
);
CREATE TABLE expense_splits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id   INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  person_id    INTEGER NOT NULL REFERENCES people(id),
  share_amount REAL NOT NULL,
  settled      INTEGER DEFAULT 0,
  settled_at   TEXT,
  PRIMARY KEY (expense_id, person_id)
);
```

**New screen**: `SplitScreen` — select people, enter shares (equal or custom), see "you owe"/"they owe" running total.

---

## Sprint 8 — Advanced Analytics + Utility
**Duration**: 8 days

### 8-A: Utility Bill Tracking (F-24) — 3 days
**Schema migration (version 16)**: utility_accounts + utility_bills tables (as defined in F-24)
**OCR integration**: extend utility format handler to extract meter reading + units consumed

### 8-B: Recurring Expense Detection (F-11) — 2 days
Pattern detection query:
```sql
SELECT merchant, COUNT(*) AS months, AVG(amount) AS avg_amount
FROM (
  SELECT merchant, amount, substr(expense_date,1,7) AS mo
  FROM expenses
  WHERE date(expense_date) >= date('now', '-6 months')
  GROUP BY merchant, substr(expense_date,1,7)
)
GROUP BY merchant
HAVING months >= 3 AND (MAX(avg_amount) - MIN(avg_amount)) / AVG(avg_amount) < 0.1
```
Suggest flagging un-marked recurring expenses as recurring. Show "Expected this month" widget.

### 8-C: Anomaly Detection (F-29) — 3 days
Per-category rolling stats:
```sql
SELECT
  category_id,
  AVG(amount) AS mean_spend,
  (SUM(amount*amount) / COUNT(*) - AVG(amount)*AVG(amount)) AS variance
FROM expenses
WHERE date(expense_date) >= date('now','-90 days')
GROUP BY category_id
```
Flag expenses where `amount > mean + 2 * sqrt(variance)` for same category.

---

## Sprint 9 — FASTag + Loan + Carbon
**Duration**: 7 days  
**Lower priority; can defer to post-MVP.**

### 9-A: FASTag (F-23) — 3 days
**Requires**: NHAI portal CSV export format + vehicle profiles (Sprint 5)
Manual balance entry + CSV import of toll transactions.

### 9-B: Loan / Mortgage Tracking (F-27) — 2 days
**Extends EMI tracking (Sprint 5)** with:
- Home loan Section 80C + 24B tax deduction tracker
- Prepayment impact simulator

### 9-C: Proper Carbon Footprint (F-32) — 2 days
**Emission factor map** (~50 KB JSON):
```json
{
  "food":       0.3,
  "groceries":  0.5,
  "transport":  2.1,
  "fuel":       2.8,
  "flights":    90.0,
  "utilities":  0.8
}
```
Calculate per expense, show monthly carbon total, trend vs. India average (1,500 kg/month).

---

## Sprint 10+ — Experimental / ML
**Only after sufficient data and user base.**

- F-28 (predictive amounts) → Already coded in Sprint 4 as merchant suggestion
- F-30 (auto-category) → Already coded in Sprint 3 via bundled merchant map
- F-31 (price prediction) → Requires 12+ months item data per user; build in Sprint 10
- F-29 (anomaly detection) → Moved to Sprint 8 for simpler Z-score version

---

## Summary Roadmap

```
Sprint 0  ──▶  Architecture fixes (migrations, error handling)
Sprint 1  ──▶  Search + Filters + Payment Method               [SHIP v1.1]
Sprint 2  ──▶  Export + Batch + Receipt Viewer                 [SHIP v1.2]
Sprint 3  ──▶  Merchant Intel + Income + GST                   [SHIP v1.3]
Sprint 4  ──▶  Notifications + Sub Calendar + Tags + Rollover  [SHIP v1.4]
Sprint 5  ──▶  Vehicle/Fuel + EMI + Calendar                   [SHIP v1.5]
Sprint 6  ──▶  SMS Import + Statement Import (CSV)             [SHIP v1.6]
Sprint 7  ──▶  Pantry + Price Alerts + Splits                  [SHIP v1.7]
Sprint 8  ──▶  Utility + Recurring Detection + Anomalies       [SHIP v1.8]
Sprint 9  ──▶  FASTag + Loan + Carbon                          [SHIP v1.9]
Sprint 10 ──▶  Price Prediction + Advanced ML                  [SHIP v2.0]
```

---

## Total Feature Count by Sprint

| Sprint | New Features | Cumulative Features |
|--------|-------------|---------------------|
| 0 | arch fixes | 0 |
| 1 | F-01, F-02, F-03 | 3 |
| 2 | F-07, F-08, F-25 | 6 |
| 3 | F-04, F-09, F-13, F-26, F-30 | 11 |
| 4 | F-05, F-10, F-12, F-21, F-28 | 16 |
| 5 | F-14, F-16, F-20 | 19 |
| 6 | F-06, F-15 | 21 |
| 7 | F-18, F-19, F-22 | 24 |
| 8 | F-11, F-24, F-29 | 27 |
| 9 | F-23, F-27, F-32 | 30 |
| 10+ | F-31, F-17 (already done) | 32 |

---

## Critical Path (Cannot Proceed Without)

```
F-17 (migrations) → ALL other schema features
F-05 (notifications) → F-10, F-19, F-21, F-18 (low-stock)
F-04 (income) → F-26 (cash flow)
F-16 (vehicles) → F-23 (FASTag)
F-14 (EMI) → F-27 (loan)
F-09 (merchant) → F-15 (reconciliation), F-30 (auto-category)
```

**Non-blocking features** (can ship in any order after Sprint 0):
F-01, F-02, F-03, F-07, F-08, F-12, F-13, F-20, F-25, F-26 (after F-04)

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| SMS `READ_SMS` permission rejected by users | High | High | Make it opt-in, explain value clearly, work without it |
| PDF statement formats vary per bank version | High | Medium | Start with CSV only; add PDF in phase 2 |
| FTS5 not available on all SQLite builds | Low | Medium | Fall back to LIKE query if FTS5 unavailable |
| expo-notifications background delivery unreliable on battery-restricted devices | Medium | Medium | Use foreground check as backup; document limitations |
| Pantry manual depletion gets ignored | High | Low | Depletion is optional; app still provides value without it |
| OCR accuracy too low for GST field extraction | Medium | Medium | Allow manual GST entry; mark OCR-filled fields as "unverified" |

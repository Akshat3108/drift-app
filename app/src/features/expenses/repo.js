import { exec, all, one, getDB } from '../../db';
import { NOT_DELETED, NOT_DELETED_C, NOT_DELETED_E } from '../../db/predicates';
import { merchants } from './merchants.repo';
import { sanitizeFtsQuery } from './search';
import { buildWhere } from './filters';
import { pantryRepo } from '@features/pantry/repo';

// 5.3 — translate the legacy { categoryId, month } args into a `criteria`
// object so the two list-call paths share one WHERE-builder. `month` here is
// a YYYY-MM string; the criteria.dateRange.preset machinery covers calendar
// presets, but a bare month_key is the simpler representation for the legacy
// call site.
// PS-38 — shared predicate for the OCR review queue. A scanned expense lands
// here when EITHER the parser's overall confidence came in below 0.6, OR the
// row has a receipt attached but zero live items (a scan that saved without
// any extracted line items). Manual expenses (no receipt, NULL confidence)
// never match — `NULL < 0.6` is NULL/false and the empty-items clause requires
// a receipt. Legacy scans (pre-v53, no stored confidence) surface only via the
// empty-items clause. Defined once so reviewQueue() and reviewQueueCount()
// can't drift. Both callers alias the expenses table as `e`.
const REVIEW_QUEUE_WHERE = `${NOT_DELETED_E}
  AND (
    e.ocr_confidence < 0.6
    OR (
      (e.receipt_path IS NOT NULL OR e.receipt_uri IS NOT NULL)
      AND (SELECT COUNT(*) FROM receipt_items ri
             WHERE ri.expense_id = e.id AND ri.deleted_at IS NULL) = 0
    )
  )`;

function legacyArgsToCriteria(legacy) {
  if (!legacy) return null;
  const out = {};
  if (legacy.categoryId != null) out.categoryIds = [legacy.categoryId];
  if (legacy.month) {
    // synthesise a month-range so buildWhere prefers the indexed month_key.
    const [y, m] = legacy.month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    out.dateRange = { from: `${legacy.month}-01`, to: `${legacy.month}-${String(last).padStart(2, '0')}` };
  }
  return out;
}

export const expenses = {
  async list({ limit = 200, offset = 0, categoryId, month, criteria } = {}) {
    const effective = criteria ?? legacyArgsToCriteria({ categoryId, month });
    const { whereSql, params } = buildWhere(effective);
    return all(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE ${whereSql}
       ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
  },

  // 5.3 — match-count for the FilterSheet "Apply (N)" chip. Same WHERE as
  // list() so the two stay in lockstep automatically.
  async count({ criteria } = {}) {
    const { whereSql, params } = buildWhere(criteria);
    const row = await one(
      `SELECT COUNT(*) AS n FROM expenses e WHERE ${whereSql}`,
      params
    );
    return row?.n ?? 0;
  },

  // 5.F.01 — Archive-mode reads. Powers the AllExpenses "View archive" toggle.
  // archive_expenses has no triggers, no FTS shadow, and (deliberately) no FK
  // to live tables — so category_name/emoji/color join falls back gracefully
  // to NULL when the live category has since been hard-deleted. Filter and
  // selection-mode actions are intentionally unsupported in archive mode; the
  // UI exposes a flat paged list only.
  async listArchive({ limit = 200, offset = 0 } = {}) {
    return all(
      `SELECT a.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
         FROM archive_expenses a
         LEFT JOIN categories c ON c.id = a.category_id
        ORDER BY a.expense_date DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  },

  async archiveCount() {
    const row = await one(`SELECT COUNT(*) AS n FROM archive_expenses`);
    return row?.n ?? 0;
  },

  async get(id) {
    return one(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.id = ?`,
      [id]
    );
  },

  async create({ category_id, merchant, amount, mood, carbon = 0, recurring = false, notes, receipt_uri, expense_date, payment_method, merchant_id, emi_loan_id, insurance_policy_id, fastag_account_id, expense_time, refund_of_expense_id }) {
    // 5.9 — manual Add path now resolves the merchant text to merchants.id so
    // MerchantDetail + topMerchants can include quick-spend rows. Caller may
    // pass an explicit `merchant_id` (autocomplete picked a known merchant);
    // otherwise we fall back to the same Jaro-Winkler resolve the Scan path
    // uses. Both paths agree on canonicalisation so a free-typed "swiggy"
    // ends up linked to the same row as a Scan-captured "Swiggy Pvt Ltd".
    const resolvedId = merchant_id != null
      ? merchant_id
      : await merchants.resolve(merchant);
    const res = await exec(
      `INSERT INTO expenses (category_id, merchant, merchant_id, amount, mood, carbon, recurring, notes, receipt_uri, expense_date, payment_method, emi_loan_id, insurance_policy_id, fastag_account_id, expense_time, refund_of_expense_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?)`,
      [
        category_id ?? null,
        merchant,
        resolvedId ?? null,
        amount,
        mood ?? null,
        carbon ?? 0,
        recurring ? 1 : 0,
        notes ?? null,
        receipt_uri ?? null,
        expense_date ?? null,
        payment_method ?? null,
        emi_loan_id ?? null,
        insurance_policy_id ?? null,
        fastag_account_id ?? null,
        expense_time ?? null,
        // PS-37 — when set, this row is a refund/return of another expense.
        // Stored with a NEGATIVE amount by the caller (Add's refund mode) so
        // monthly_summary nets it out automatically.
        refund_of_expense_id ?? null,
      ]
    );
    return this.get(res.lastInsertRowId);
  },

  async update(id, patch) {
    const cur = await this.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    // 5.9 — when the merchant text changes, re-resolve merchant_id so the
    // edited row points at the correct merchants row. Otherwise EditExpense
    // would leave a stale FK that breaks MerchantDetail rollups.
    const nextMerchantId = patch.merchant_id != null
      ? patch.merchant_id
      : (cur.merchant === next.merchant ? cur.merchant_id : await merchants.resolve(next.merchant));
    await exec(
      `UPDATE expenses SET
        category_id = ?, merchant = ?, merchant_id = ?, amount = ?, mood = ?,
        carbon = ?, recurring = ?, notes = ?, receipt_uri = ?, expense_date = ?,
        payment_method = ?, emi_loan_id = ?, insurance_policy_id = ?, fastag_account_id = ?
       WHERE id = ?`,
      [
        next.category_id ?? null,
        next.merchant,
        nextMerchantId ?? null,
        next.amount,
        next.mood ?? null,
        next.carbon ?? 0,
        next.recurring ? 1 : 0,
        next.notes ?? null,
        next.receipt_uri ?? null,
        next.expense_date,
        next.payment_method ?? null,
        next.emi_loan_id ?? null,
        next.insurance_policy_id ?? null,
        next.fastag_account_id ?? null,
        id,
      ]
    );
    return this.get(id);
  },

  // 2.D.09 — soft-delete cascades to receipt_items so item_summary stays
  // consistent with the parent's visibility. The FK ON DELETE CASCADE only
  // fires on real DELETE; soft-delete needs an app-level cascade.
  async remove(id) {
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE expenses SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
        [id]
      );
      await db.runAsync(
        `UPDATE receipt_items SET deleted_at = datetime('now')
          WHERE expense_id = ? AND deleted_at IS NULL`,
        [id]
      );
    });
  },

  async restore(id) {
    const db = await getDB();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE expenses SET deleted_at = NULL WHERE id = ?', [id]);
      await db.runAsync(
        `UPDATE receipt_items SET deleted_at = NULL WHERE expense_id = ?`,
        [id]
      );
    });
  },

  // 5.15 — stamp the permanent receipt path columns onto an existing row.
  // Called by the lazy-migrate path in ReceiptViewer after persistReceipt
  // succeeds on a row that still has only the legacy receipt_uri. Keep
  // receipt_uri intact: that's the safety net if persistReceipt happens to
  // be writing to a different documentDirectory across a future expo
  // upgrade.
  async attachReceiptStorage(id, { path, thumb, bytes, imageHash }) {
    if (id == null || !path) return;
    // 8.6 — receipt_image_hash is optional. Lazy-migrate calls that pre-date
    // the hash pipeline pass it through as null; future maintenance-job
    // backfill (8.7) can fill in NULLs without re-running persistReceipt.
    await exec(
      `UPDATE expenses
          SET receipt_path       = ?,
              receipt_thumb      = ?,
              receipt_bytes      = ?,
              receipt_image_hash = COALESCE(?, receipt_image_hash)
        WHERE id = ?`,
      [path, thumb ?? null, bytes ?? null, imageHash ?? null, id]
    );
  },

  // 5.8 — batch hard-delete. Chunked to stay under SQLite's default
  // SQLITE_MAX_VARIABLE_NUMBER (999) and run inside one transaction so
  // either the whole selection is removed or none of it is. The triggers
  // on `expenses` (v12) keep monthly_summary/expense_fts/item_fts in sync
  // per-row; doing all rows in one txn batches the WAL flush.
  async bulkRemove(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const db = await getDB();
    const clean = ids.filter((x) => Number.isFinite(x));
    if (!clean.length) return 0;
    const CHUNK = 500;
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < clean.length; i += CHUNK) {
        const slice = clean.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE expenses SET deleted_at = datetime('now')
            WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          slice
        );
        await db.runAsync(
          `UPDATE receipt_items SET deleted_at = datetime('now')
            WHERE expense_id IN (${placeholders}) AND deleted_at IS NULL`,
          slice
        );
      }
    });
    return clean.length;
  },

  async bulkRestore(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const db = await getDB();
    const clean = ids.filter((x) => Number.isFinite(x));
    if (!clean.length) return 0;
    const CHUNK = 500;
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < clean.length; i += CHUNK) {
        const slice = clean.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE expenses SET deleted_at = NULL
            WHERE id IN (${placeholders})`,
          slice
        );
        await db.runAsync(
          `UPDATE receipt_items SET deleted_at = NULL
            WHERE expense_id IN (${placeholders})`,
          slice
        );
      }
    });
    return clean.length;
  },

  // PS-07 — batch trip-tag. Same transactional + chunking discipline as
  // bulkUpdateCategory. A null trip_id is allowed (clears the tag).
  async bulkUpdateTrip(ids, trip_id) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const db = await getDB();
    const clean = ids.filter((x) => Number.isFinite(x));
    if (!clean.length) return 0;
    const CHUNK = 500;
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < clean.length; i += CHUNK) {
        const slice = clean.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE expenses SET trip_id = ? WHERE id IN (${placeholders})`,
          [trip_id ?? null, ...slice]
        );
      }
    });
    return clean.length;
  },

  // 5.8 — batch recategorize. Same transactional + chunking discipline as
  // bulkRemove. A null category_id is allowed (clears the category).
  async bulkUpdateCategory(ids, category_id) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const db = await getDB();
    const clean = ids.filter((x) => Number.isFinite(x));
    if (!clean.length) return 0;
    const CHUNK = 500;
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < clean.length; i += CHUNK) {
        const slice = clean.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE expenses SET category_id = ? WHERE id IN (${placeholders})`,
          [category_id ?? null, ...slice]
        );
      }
    });
    return clean.length;
  },

  // 4.14 — pre-save dedup check. `hash` matches an exact prior scan;
  // `softHash` matches a near-duplicate within ±1 day of `date`. Returns
  // the first hit (preferring exact) or null. Soft-match window is wider
  // because OCR jitter can shift the total by a paisa and the date by a
  // single day across re-scans of the same receipt. The hash-column
  // indexes were not declared at migration time so this query is a small
  // scan over the user's recent history — acceptable: 100k expenses and
  // we still match in a few ms because the predicates are highly selective.
  async findDuplicate({ hash, softHash, date }) {
    if (hash) {
      const exact = await one(
        `SELECT id, merchant, amount, expense_date
           FROM expenses
          WHERE receipt_hash = ? AND ${NOT_DELETED}
          ORDER BY id DESC
          LIMIT 1`,
        [hash]
      );
      if (exact) return { kind: 'exact', expense: exact };
    }
    if (softHash && date) {
      const soft = await one(
        `SELECT id, merchant, amount, expense_date
           FROM expenses
          WHERE receipt_soft_hash = ?
            AND ${NOT_DELETED}
            AND date(expense_date) BETWEEN date(?, '-1 day') AND date(?, '+1 day')
          ORDER BY id DESC
          LIMIT 1`,
        [softHash, date, date]
      );
      if (soft) return { kind: 'soft', expense: soft };
    }
    return null;
  },

  async createWithItems({ expense, items }) {
    const db = await getDB();
    let createdId = null;
    await db.withTransactionAsync(async () => {
      // 4.15 — resolve the OCR'd merchant string to merchants.id via
      // Jaro-Winkler (≥ 0.92) against existing rows; insert if no match.
      // Lives inside the transaction so the SELECT+INSERT race window stays
      // bounded by the same write txn as the expenses INSERT.
      // 4.14 — persist receipt fingerprints so future scans can dedup.
      // 4.22 — when the Scan flow has already resolved the merchant during
      // template lookup (`expense.merchant_id` set), reuse that id rather
      // than re-running the JW match. Idempotent — the resolve at scan
      // time created/picked the same row this transaction would have.
      const merchantId = expense.merchant_id != null
        ? expense.merchant_id
        : await merchants.resolve(expense.merchant);
      const res = await db.runAsync(
        `INSERT INTO expenses (category_id, merchant, merchant_id, amount, mood, carbon, recurring, notes, receipt_uri, expense_date,
                               gstin, invoice_number, cgst, sgst, igst,
                               receipt_hash, receipt_soft_hash, payment_method,
                               receipt_path, receipt_thumb, receipt_bytes, receipt_image_hash, emi_loan_id,
                               ocr_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expense.category_id ?? null,
          expense.merchant,
          merchantId,
          expense.amount,
          expense.mood ?? null,
          expense.carbon ?? 0,
          expense.recurring ? 1 : 0,
          expense.notes ?? null,
          expense.receipt_uri ?? null,
          expense.expense_date ?? null,
          expense.gstin ?? null,
          expense.invoice_number ?? null,
          expense.cgst ?? null,
          expense.sgst ?? null,
          expense.igst ?? null,
          expense.receipt_hash ?? null,
          expense.receipt_soft_hash ?? null,
          expense.payment_method ?? null,
          expense.receipt_path ?? null,
          expense.receipt_thumb ?? null,
          expense.receipt_bytes ?? null,
          expense.receipt_image_hash ?? null,
          expense.emi_loan_id ?? null,
          // PS-38 — overall OCR confidence (0..1) from ScanService. NULL on
          // manual saves; populated only on the scan path so the review queue
          // can surface low-confidence extractions.
          expense.ocr_confidence ?? null,
        ]
      );
      createdId = res.lastInsertRowId;
      const dateStr = expense.expense_date || new Date().toISOString().slice(0, 10);
      for (const it of items) {
        await db.runAsync(
          `INSERT INTO receipt_items
             (expense_id, name, normalized_name, kind, qty, unit,
              canonical_qty, canonical_unit, unit_price, price, purchase_date,
              hsn, cgst_rate, sgst_rate, igst_rate,
              batch_no, expiry_date, mfg_date, return_by_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            createdId,
            it.name,
            it.normalized_name,
            it.kind || 'other',
            it.qty,
            it.unit,
            it.canonical_qty,
            it.canonical_unit,
            it.unit_price,
            it.price,
            dateStr,
            it.hsn ?? null,
            it.cgst_rate ?? null,
            it.sgst_rate ?? null,
            it.igst_rate ?? null,
            it.batch_no ?? null,
            it.expiry_date ?? null,
            it.mfg_date ?? null,
            // PS-39 — return-window deadline stamped from the merchant policy.
            it.return_by_date ?? null,
          ]
        );
      }
    });
    // 7.7 — auto-populate the pantry from the just-inserted items. Runs AFTER
    // the createWithItems transaction commits so the v12 AI trigger on
    // receipt_items has already updated item_summary.points_count — that's
    // the gating signal autoPopulateFromItems reads. Best-effort: a write
    // error here must not unwind the expense save.
    if (Array.isArray(items) && items.length > 0) {
      try { await pantryRepo.autoPopulateFromItems(items); }
      catch { /* non-fatal — pantry tracking is opt-in observability */ }
    }
    return this.get(createdId);
  },

  // 5.2 — FTS5 search over expense_fts (merchant + notes). Returns rows in
  // the same shape as list() so the Search screen can reuse list row UI.
  // soft-delete-aware via NOT_DELETED_E AND the existing AI/AU/AD triggers on
  // expense_fts already gate on deleted_at, so a deleted row is invisible at
  // both the FTS layer and the SQL layer (belt-and-suspenders, cheap).
  //
  // 5.3 — optional `criteria` composes search ∧ filter; the WHERE-builder
  // produces the predicate fragment so the same axes work in both surfaces.
  async search({ query, criteria, limit = 100 } = {}) {
    const q = sanitizeFtsQuery(query);
    if (!q) return [];
    const { whereSql, params } = buildWhere(criteria);
    return all(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
       FROM expense_fts f
       JOIN expenses e ON e.id = f.rowid
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE expense_fts MATCH ?
         AND ${whereSql}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT ?`,
      [q, ...params, limit]
    );
  },

  async summaryByCategory(month) {
    const m = month || new Date().toISOString().slice(0, 7);
    // Reads from monthly_summary rollup (3.19). The rollup is maintained
    // soft-delete-aware by triggers in v12, so no deleted_at predicate is
    // needed on the rollup side. The categories side still filters live rows.
    // 7.10 — LEFT JOIN budget_rollover so `rollover_in` is surfaced on each
    // pot row. NULL when no carryover row exists for the (category, month).
    return all(
      `SELECT c.id, c.name, c.emoji, c.color, c.budget, c.sort_order,
              c.rollover_enabled,
              COALESCE(ms.total, 0) AS spent,
              COALESCE(br.rollover_in, 0) AS rollover_in
       FROM categories c
       LEFT JOIN monthly_summary ms
              ON ms.category_id = c.id
             AND ms.month_key   = ?
       LEFT JOIN budget_rollover br
              ON br.category_id = c.id
             AND br.month_key   = ?
       WHERE ${NOT_DELETED_C}
       ORDER BY c.sort_order, c.id`,
      [m, m]
    );
  },

  async monthlyTrend(months = 6) {
    // Reads from monthly_summary rollup (3.19). Cutoff month_key computed in
    // SQL via strftime so behaviour matches the previous `date(expense_date)
    // >= date('now', '-N months')` semantics.
    return all(
      `SELECT month_key,
              SUM(total) AS total
       FROM monthly_summary
       WHERE month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
       GROUP BY month_key
       ORDER BY month_key`,
      [months]
    );
  },

  // 5.9 — merchant intelligence queries. These power MerchantDetail + the
  // top-merchants leaderboard and the Profile entry-point pill.

  // Top merchants ranked by spend within the last N months (windowed via the
  // indexed month_key column). Excludes uncategorised (merchant_id NULL),
  // which is the legacy free-text path. Returns one row per merchant.
  async topMerchants({ months = 6, limit = 20 } = {}) {
    return all(
      `SELECT m.id AS id, m.name, m.canonical_name,
              COUNT(*)        AS txn_count,
              SUM(e.amount)   AS total,
              MAX(e.expense_date) AS last_seen
         FROM expenses e
         JOIN merchants m ON m.id = e.merchant_id
        WHERE ${NOT_DELETED_E}
          AND e.merchant_id IS NOT NULL
          AND e.month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
        GROUP BY e.merchant_id
        ORDER BY total DESC, txn_count DESC, last_seen DESC
        LIMIT ?`,
      [months, limit]
    );
  },

  // Header card for MerchantDetail. All-time + last-N-months at one shot.
  async merchantSummary({ merchantId, months = 6 }) {
    if (merchantId == null) return null;
    return one(
      `SELECT m.id AS id, m.name, m.canonical_name, m.created_at AS first_logged,
              COALESCE(SUM(e.amount), 0)         AS total_all,
              COALESCE(SUM(CASE WHEN e.month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
                                THEN e.amount ELSE 0 END), 0) AS total_window,
              COUNT(e.id)                        AS txn_count_all,
              COALESCE(AVG(e.amount), 0)         AS avg_amount,
              -- PS-37 — how many of this merchant's spends are refund rows.
              COALESCE(SUM(CASE WHEN e.refund_of_expense_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS refund_txn,
              MIN(e.expense_date)                AS first_seen,
              MAX(e.expense_date)                AS last_seen
         FROM merchants m
    LEFT JOIN expenses e ON e.merchant_id = m.id AND ${NOT_DELETED_E}
        WHERE m.id = ?
        GROUP BY m.id`,
      [months, merchantId]
    );
  },

  // 12-month spend trend per merchant. Mirrors the shape of monthlyTrend(),
  // joined directly against expenses since monthly_summary buckets by
  // category, not merchant.
  async merchantMonthlyTrend({ merchantId, months = 12 }) {
    if (merchantId == null) return [];
    return all(
      `SELECT e.month_key   AS month_key,
              SUM(e.amount) AS total,
              COUNT(*)      AS txn_count
         FROM expenses e
        WHERE ${NOT_DELETED_E}
          AND e.merchant_id = ?
          AND e.month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
        GROUP BY e.month_key
        ORDER BY e.month_key`,
      [merchantId, months]
    );
  },

  // Per-category breakdown for the merchant — which pots has the user
  // assigned past spends at this merchant to? Used by the "which kind?" strip
  // in MerchantDetail.
  async merchantCategoryBreakdown({ merchantId, months = 12 }) {
    if (merchantId == null) return [];
    return all(
      `SELECT c.id           AS id,
              c.name         AS name,
              c.emoji        AS emoji,
              c.color        AS color,
              SUM(e.amount)  AS total,
              COUNT(*)       AS txn_count
         FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
        WHERE ${NOT_DELETED_E}
          AND e.merchant_id = ?
          AND e.month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
        GROUP BY c.id
        ORDER BY total DESC, txn_count DESC`,
      [merchantId, months]
    );
  },

  // 6.20 — distinct purchase dates at this merchant within the window. Used
  // by MerchantDetail to compute the visit cadence (avg days between visits).
  // Ordered ASC so a simple JS loop can compute consecutive intervals.
  async merchantPurchaseDates({ merchantId, months = 12 }) {
    if (merchantId == null) return [];
    return all(
      `SELECT DISTINCT e.expense_date AS expense_date
         FROM expenses e
        WHERE ${NOT_DELETED_E}
          AND e.merchant_id = ?
          AND e.month_key >= strftime('%Y-%m', 'now', '-' || ? || ' months')
        ORDER BY e.expense_date ASC`,
      [merchantId, months]
    );
  },

  // Recent spends at this merchant for the bottom-of-screen list.
  async merchantRecents({ merchantId, limit = 30 } = {}) {
    if (merchantId == null) return [];
    return all(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color
         FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
        WHERE ${NOT_DELETED_E}
          AND e.merchant_id = ?
        ORDER BY e.expense_date DESC, e.id DESC
        LIMIT ?`,
      [merchantId, limit]
    );
  },

  // 7.4 — day-level aggregation for the SpendCalendar month grid. One row
  // per distinct expense_date within the month. Uses the v3 month_key virtual
  // column + idx_exp_month index so the lookup is O(log n) followed by a
  // sequential scan over only the month's rows (~300 typical). Soft-deleted
  // rows filtered via NOT_DELETED.
  async spendByDay(monthKey) {
    if (!monthKey) return [];
    return all(
      `SELECT expense_date AS date,
              SUM(amount)   AS total,
              COUNT(*)      AS txn_count
         FROM expenses
        WHERE ${NOT_DELETED}
          AND month_key = ?
        GROUP BY expense_date
        ORDER BY expense_date ASC`,
      [monthKey]
    );
  },

  // 7.4 — per-day expense list for the SpendCalendar selection callout.
  // Returns the live expenses on a single day with the category join so the
  // callout row can render emoji/colour inline (mirrors the list() shape).
  async listByDate(date) {
    if (!date) return [];
    return all(
      `SELECT e.id, e.merchant, e.amount, e.expense_date,
              e.category_id, e.mood, e.payment_method,
              c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
         FROM expenses e
         LEFT JOIN categories c ON c.id = e.category_id AND c.deleted_at IS NULL
        WHERE e.deleted_at IS NULL
          AND e.expense_date = ?
        ORDER BY e.created_at DESC, e.id DESC`,
      [date]
    );
  },

  // 5.9 — predictive amount source. `expenses.lastAtMerchant` is queried by
  // Add.js once the user picks (or types-then-blurs) a recognised merchant —
  // surface a "Last time: ₹X" chip. Returns the single most-recent live row.
  async lastAtMerchant(merchantId) {
    if (merchantId == null) return null;
    return one(
      `SELECT id, amount, expense_date, category_id
         FROM expenses
        WHERE ${NOT_DELETED} AND merchant_id = ?
        ORDER BY expense_date DESC, id DESC
        LIMIT 1`,
      [merchantId]
    );
  },

  // PS-37 — refunds linked to a given expense. Powers Detail's "Refunded on …"
  // badge (this expense was refunded) and lets the original surface its return
  // events. Live rows only; ordered newest-first.
  async refundsFor(expenseId) {
    if (expenseId == null) return [];
    return all(
      `SELECT id, merchant, amount, expense_date
         FROM expenses
        WHERE refund_of_expense_id = ? AND ${NOT_DELETED}
        ORDER BY expense_date DESC, id DESC`,
      [expenseId]
    );
  },

  // PS-38 — OCR review queue. Returns the flagged scans newest-worst-first:
  // lowest confidence first (NULL scores sorted last via the `IS NULL` key, so
  // we don't depend on SQLite's NULLS LAST syntax), then most recent. The
  // joined category columns + item_count let ReviewQueue render each row inline.
  async reviewQueue({ limit = 100 } = {}) {
    return all(
      `SELECT e.*, c.name AS category_name, c.emoji AS category_emoji,
              c.color AS category_color,
              (SELECT COUNT(*) FROM receipt_items ri
                 WHERE ri.expense_id = e.id AND ri.deleted_at IS NULL) AS item_count
         FROM expenses e
         LEFT JOIN categories c ON c.id = e.category_id
        WHERE ${REVIEW_QUEUE_WHERE}
        ORDER BY (e.ocr_confidence IS NULL), e.ocr_confidence ASC,
                 e.expense_date DESC, e.id DESC
        LIMIT ?`,
      [limit]
    );
  },

  // PS-38 — count for the Hub "N scans need review" report row + badge gating.
  async reviewQueueCount() {
    const row = await one(
      `SELECT COUNT(*) AS n FROM expenses e WHERE ${REVIEW_QUEUE_WHERE}`
    );
    return row?.n ?? 0;
  },

  // PS-23 — delegates to the canonical streak tracker in
  // `analytics/streaks.js`. Kept as a repo passthrough so existing callers
  // (`useHomeDashboard`, expenses context action) don't need to rewire.
  async streakDays() {
    const { currentStreak } = require('../../analytics/streaks');
    const { streak } = await currentStreak({ mode: 'in_budget' });
    return streak;
  },
};

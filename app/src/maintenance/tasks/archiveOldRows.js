// 5.F.01 — Maintenance task: yearly archive of pre-2-year expenses.
//
// Drift's hot path (Home, AllExpenses default feed, current-month Trends) reads
// `expenses` only. As the dataset grows past year 5+, the active table itself
// becomes a perf liability — every monthly_summary upsert scans more index
// pages, every backup hauls more rows. Archive mode moves cold rows to
// archive_expenses + archive_receipt_items (v43) so the hot path stays bounded.
//
// Gate: runs at most once per 365 days, keyed by settings.last_archive_at. The
// timestamp is stamped ONLY when the queue drains in a single run (eligible
// count < per-run cap). If we hit the cap, the timestamp stays as-is so the
// next bg→fg picks up the rest the next day. Net effect: heavy first-time
// backlog drains across N days, then re-quiesces to one cheap no-op run per
// year.
//
// Cutoff: expense_date < date('now', '-2 years'). Matches long_term_strategy
// §6.4 + master_roadmap line 860. Keeps YoY comparisons (Trends, anomaly
// baseline) on the live side.
//
// Eligibility: an expense is moved iff it ALSO has no rows in any of the four
// CASCADE-FK child tables — expense_splits, expense_tags, fuel_fillups,
// utility_bills. Archiving the parent would CASCADE-delete those rows; we
// scope this task to leaf expenses only so split/tag/fuel/utility records
// stay intact. Edge: account_transactions and goal_contributions FK to
// expenses with ON DELETE SET NULL, so they survive the parent delete with
// the link nulled — acceptable, no eligibility check needed.
//
// Op order (inside one withTransactionAsync):
//   1) INSERT INTO archive_receipt_items SELECT … WHERE expense_id IN eligible
//   2) INSERT INTO archive_expenses      SELECT … WHERE id          IN eligible
//   3) DELETE FROM expenses              WHERE id IN eligible
//      → cascades to receipt_items → fires trg_items_ad + trg_item_fts_ad
//      → fires trg_exp_ad + trg_expense_fts_ad on expenses themselves
//      → monthly_summary and both FTS tables shed the archived rows cleanly
//
// Per-run cap (PER_RUN_CAP) caps the bg→fg latency on the first-ever run for
// a heavy install. 10k expenses + their items + the trigger cascade comfortably
// finishes inside a few seconds on a Pixel-6a-class device.
//
// MAINTENANCE WARNING: the EXPENSE_COLS and ITEM_COLS lists must stay in
// lockstep with the live `expenses` / `receipt_items` schemas. If a future
// migration adds a column to either table, it must also (a) add the same
// column to the corresponding archive_* table (see v43 in schema.js) and
// (b) extend the matching list below.

import { logError } from '@core/utils/log';

const RATE_LIMIT_MS = 365 * 24 * 60 * 60 * 1000;
const CUTOFF_SQL    = `date('now', '-2 years')`;
const PER_RUN_CAP   = 10000;

// Non-generated columns of `expenses` at v42 (excludes month_key, which is
// VIRTUAL on both source and destination). Order doesn't have to match the
// CREATE statement — only the SELECT and INSERT lists must agree.
const EXPENSE_COLS = [
  'id', 'category_id', 'merchant', 'amount', 'mood', 'carbon', 'recurring',
  'notes', 'receipt_uri', 'expense_date', 'created_at', 'deleted_at',
  'merchant_id', 'account_id', 'trip_id', 'subscription_id',
  'currency', 'amount_home', 'fx_rate',
  'receipt_path', 'receipt_thumb', 'receipt_bytes', 'receipt_hash', 'receipt_soft_hash',
  'gstin', 'invoice_number', 'cgst', 'sgst', 'igst',
  'payment_method', 'emi_loan_id', 'receipt_image_hash',
];

const ITEM_COLS = [
  'id', 'expense_id', 'name', 'normalized_name', 'kind',
  'qty', 'unit', 'canonical_qty', 'canonical_unit',
  'unit_price', 'price', 'purchase_date', 'deleted_at',
  'product_id',
  'hsn', 'cgst_rate', 'sgst_rate', 'igst_rate',
  'batch_no', 'expiry_date', 'mfg_date',
];

export function isDue(lastRunAt, nowMs) {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return true;
  if (last > nowMs) return false;                  // future timestamp (clock skew) — wait it out
  return (nowMs - last) >= RATE_LIMIT_MS;
}

export default {
  name: 'archiveOldRows',
  async run({ db }) {
    let lastRunAt = null;
    try {
      const row = await db.getFirstAsync(`SELECT last_archive_at FROM settings WHERE id = 1`);
      lastRunAt = row?.last_archive_at ?? null;
    } catch (e) {
      // Pre-v43 install — treat as never-run.
      logError('archiveOldRows:read-last-run', e);
    }

    if (!isDue(lastRunAt, Date.now())) {
      return { skipped: 'gate' };
    }

    // Eligibility selection. Leaf expenses only (see header). LIMIT caps the
    // per-run cost; the gate-stamping logic below decides whether this is the
    // last batch (drain) or whether we need to come back tomorrow.
    const eligible = await db.getAllAsync(
      `SELECT id FROM expenses
        WHERE expense_date < ${CUTOFF_SQL}
          AND id NOT IN (SELECT expense_id FROM expense_splits)
          AND id NOT IN (SELECT expense_id FROM expense_tags)
          AND id NOT IN (SELECT expense_id FROM fuel_fillups)
          AND id NOT IN (SELECT expense_id FROM utility_bills)
        ORDER BY id
        LIMIT ?`,
      [PER_RUN_CAP]
    );

    if (eligible.length === 0) {
      // Nothing to archive this cycle but we DID pass the gate, so stamp it
      // to push the next run a full year out. Otherwise we'd re-evaluate
      // eligibility every bg→fg until something becomes eligible — wasted work.
      await db.runAsync(
        `UPDATE settings SET last_archive_at = ? WHERE id = 1`,
        [new Date().toISOString()]
      );
      return { archivedExpenses: 0, archivedItems: 0, drained: true };
    }

    const ids = eligible.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');

    const expenseCols = EXPENSE_COLS.join(', ');
    const itemCols    = ITEM_COLS.join(', ');

    let archivedItems = 0;
    let archivedExpenses = 0;

    await db.withTransactionAsync(async () => {
      // Items first. The live receipt_items rows survive past this INSERT
      // because they're only deleted via the CASCADE from expenses below.
      const itemsRes = await db.runAsync(
        `INSERT INTO archive_receipt_items (${itemCols})
         SELECT ${itemCols} FROM receipt_items
          WHERE expense_id IN (${placeholders})`,
        ids
      );
      archivedItems = itemsRes?.changes ?? 0;

      const expRes = await db.runAsync(
        `INSERT INTO archive_expenses (${expenseCols})
         SELECT ${expenseCols} FROM expenses
          WHERE id IN (${placeholders})`,
        ids
      );
      archivedExpenses = expRes?.changes ?? 0;

      // Now the live delete. CASCADE on receipt_items.expense_id → DELETE
      // receipt_items → fires trg_items_ad + trg_item_fts_ad. The expense
      // DELETE itself fires trg_exp_ad + trg_expense_fts_ad. Both triggers
      // gate on `WHEN OLD.deleted_at IS NULL`, so soft-deleted rows
      // (which weren't contributing to rollups) are also a no-op in the
      // triggers — exactly right.
      await db.runAsync(
        `DELETE FROM expenses WHERE id IN (${placeholders})`,
        ids
      );
    });

    const drained = eligible.length < PER_RUN_CAP;

    // Only stamp last_archive_at when the queue is drained — otherwise the
    // next bg→fg should pick up the remainder tomorrow rather than waiting
    // a full year.
    if (drained) {
      await db.runAsync(
        `UPDATE settings SET last_archive_at = ? WHERE id = 1`,
        [new Date().toISOString()]
      );
    }

    return { archivedExpenses, archivedItems, drained };
  },
};

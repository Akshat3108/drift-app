// PS-30 — opt-in store for recurring auto-create. recurringCandidates() keys
// patterns by merchant (no DB id), so a rule is keyed by the normalized
// merchant (lightNormMerchant). `enabled` toggles the rule without losing its
// last_created_month dedupe stamp; the unique partial index on merchant_key
// (live rows) keeps one rule per merchant.

import { exec, all, one } from '../../db';
import { lightNormMerchant } from '@core/utils/strings';

export const autocreateRepo = {
  keyFor(merchant) { return lightNormMerchant(merchant); },

  // Enabled rules — consumed by the maintenance task.
  async listEnabled() {
    return all(`SELECT * FROM recurring_autocreate WHERE deleted_at IS NULL AND enabled = 1`);
  },

  // Set of merchant_keys with an enabled rule — drives the toggle state in
  // ExpectedThisMonth without N per-row queries.
  async enabledKeys() {
    const rows = await all(
      `SELECT merchant_key FROM recurring_autocreate WHERE deleted_at IS NULL AND enabled = 1`
    );
    return new Set(rows.map((r) => r.merchant_key));
  },

  // Turn a pattern's auto-create on, snapshotting its projected day/amount/
  // category. Idempotent: re-enables + refreshes an existing (possibly
  // disabled) rule rather than inserting a duplicate.
  async enable({ merchant, expected_day, expected_amount, category_id }) {
    const key = lightNormMerchant(merchant);
    if (!key) return;
    const existing = await one(
      `SELECT id FROM recurring_autocreate WHERE merchant_key = ? AND deleted_at IS NULL`,
      [key]
    );
    if (existing) {
      await exec(
        `UPDATE recurring_autocreate
            SET enabled = 1, merchant = ?, expected_day = ?, expected_amount = ?, category_id = ?
          WHERE id = ?`,
        [merchant, expected_day ?? null, expected_amount ?? null, category_id ?? null, existing.id]
      );
    } else {
      await exec(
        `INSERT INTO recurring_autocreate
           (merchant, merchant_key, expected_day, expected_amount, category_id, enabled)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [merchant, key, expected_day ?? null, expected_amount ?? null, category_id ?? null]
      );
    }
  },

  async disable(merchant) {
    const key = lightNormMerchant(merchant);
    if (!key) return;
    await exec(
      `UPDATE recurring_autocreate SET enabled = 0 WHERE merchant_key = ? AND deleted_at IS NULL`,
      [key]
    );
  },

  // Stamp the month a pending row was created so a pattern fires at most once
  // per month (survives the user dismissing that month's pending row).
  async markCreated(merchantKey, monthKey) {
    await exec(
      `UPDATE recurring_autocreate SET last_created_month = ? WHERE merchant_key = ? AND deleted_at IS NULL`,
      [monthKey, merchantKey]
    );
  },
};

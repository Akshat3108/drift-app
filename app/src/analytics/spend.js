// 6.3 — spendingVelocity()
//
// Rolling 14-day window split into two halves (current 7d vs prior 7d).
// One SQL pass using a CASE-based bucketing so we hit `idx_exp_month` once
// and avoid two round-trips. Soft-deleted expenses are excluded.
//
// Classifier thresholds (±15%) chosen so noise from a single grocery run
// (~₹500-1500 on a ~₹10k weekly base) doesn't flip the label. The
// `insufficient` bucket fires when both windows are zero — without it the
// classifier would report "steady" for a brand-new install which is wrong.

import { one } from '../db';

const VELOCITY_THRESHOLD = 0.15; // 15% PoP swing flips accelerating/slowing

export async function spendingVelocity() {
  const row = await one(`
    SELECT
      COALESCE(SUM(CASE WHEN expense_date >= date('now','-6 day')
                         AND expense_date <= date('now')
                       THEN amount END), 0) AS current7d,
      COALESCE(SUM(CASE WHEN expense_date >= date('now','-13 day')
                         AND expense_date <  date('now','-6 day')
                       THEN amount END), 0) AS prior7d
    FROM expenses
    WHERE deleted_at IS NULL
      AND expense_date >= date('now','-13 day')
  `);

  const current7d = row?.current7d ?? 0;
  const prior7d   = row?.prior7d   ?? 0;
  const slope     = current7d - prior7d;

  let pctChange = null;
  if (prior7d > 0) pctChange = slope / prior7d;

  let classifier;
  if (current7d === 0 && prior7d === 0) {
    classifier = 'insufficient';
  } else if (prior7d === 0) {
    // No baseline — any spend this week reads as acceleration off zero.
    classifier = current7d > 0 ? 'accelerating' : 'insufficient';
  } else if (pctChange >= VELOCITY_THRESHOLD) {
    classifier = 'accelerating';
  } else if (pctChange <= -VELOCITY_THRESHOLD) {
    classifier = 'slowing';
  } else {
    classifier = 'steady';
  }

  const direction = slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat';

  return { current7d, prior7d, slope, pctChange, direction, classifier };
}

// PS-29 — subscription price-change detection.
//
// A recurring expense linked to a subscription via expenses.subscription_id
// (3.5) can be charged differently from the subscription's set `amount` — e.g.
// Netflix quietly raising the plan. This flags subscriptions whose last N
// linked charges average more than `thresholdPct` away from their set price.
//
// Pure read over `expenses` (NOT deleted, NOT pending) joined to subscriptions.
// Surfaces as a pill on the Subs screen and, via the notifications provider,
// a one-per-change price-channel notification.

import { all } from '../db';

export const DRIFT_THRESHOLD = 0.05; // >5% off the set price
const LOOKBACK_N = 3;                 // average the last N linked charges
const MIN_OBS = 2;                    // need ≥2 to call it a trend (not a one-off)

export async function subscriptionDrift({ thresholdPct = DRIFT_THRESHOLD } = {}) {
  const rows = await all(
    `SELECT s.id AS sub_id, s.name, s.icon, s.amount AS expected, s.last_alert_at,
            AVG(x.amount) AS actual_avg, COUNT(*) AS observations
       FROM subscriptions s
       JOIN (
         SELECT subscription_id, amount,
                ROW_NUMBER() OVER (
                  PARTITION BY subscription_id
                  ORDER BY expense_date DESC, id DESC) AS rn
           FROM expenses
          WHERE subscription_id IS NOT NULL
            AND deleted_at IS NULL
            AND is_pending = 0
       ) x ON x.subscription_id = s.id AND x.rn <= ?
      WHERE s.deleted_at IS NULL AND s.cancelled = 0 AND s.amount > 0
      GROUP BY s.id
      HAVING COUNT(*) >= ?`,
    [LOOKBACK_N, MIN_OBS]
  );

  const out = [];
  for (const r of rows) {
    const expected = Number(r.expected) || 0;
    const actual = Number(r.actual_avg) || 0;
    if (expected <= 0) continue;
    const delta_pct = (actual - expected) / expected;
    if (Math.abs(delta_pct) <= thresholdPct) continue;
    out.push({
      sub_id: r.sub_id,
      name: r.name,
      icon: r.icon,
      expected,
      actual_avg: actual,
      delta_pct,                       // signed fraction (e.g. +0.18)
      delta_amount: actual - expected, // signed rupees
      observations: r.observations,
      last_alert_at: r.last_alert_at || null,
    });
  }
  return out;
}

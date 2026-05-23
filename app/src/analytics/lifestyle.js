// 6.7 — lifestyleInflation()
//
// Detects QoQ category drift in spending mix. "Share-of-spend" drift was
// chosen over absolute-rupee drift because the user typing this app's
// spec wants to surface mix shifts ("food rising at the expense of bills"),
// not magnitude changes. Absolute deltas are still returned so 6.15's UI
// can show ₹ jumps alongside.
//
// Quarter boundaries:
//   this_q = [today − 2mo, today]  (three calendar months ending today)
//   prev_q = [today − 5mo, today − 3mo]
// Uses monthly_summary rolled up by category — soft-delete-aware via v12.
//
// Classifier flags a category when:
//   |share_drift| >= DRIFT_THRESHOLD_PP   AND   prev_share >= MIN_PREV_SHARE
// Threshold = 5pp prevents tiny categories from flapping. The "AND prev_share
// >= 5%" gate stops a new spend bucket showing up at 0%→4% from being flagged.

import { all, one } from '../db';

const DRIFT_THRESHOLD_PP = 0.05; // 5 percentage points
const MIN_PREV_SHARE     = 0.05; // category must have been 5%+ of prior quarter

export async function lifestyleInflation() {
  // Resolve quarter date ranges in SQLite so DST / month-length math stays
  // consistent with the rest of the codebase's date('now') usage.
  const ranges = await one(`
    SELECT
      strftime('%Y-%m', date('now','-2 month'))            AS this_q_start,
      strftime('%Y-%m', date('now'))                       AS this_q_end,
      strftime('%Y-%m', date('now','-5 month'))            AS prev_q_start,
      strftime('%Y-%m', date('now','-3 month'))            AS prev_q_end
  `);

  const thisRows = await all(
    `SELECT ms.category_id, COALESCE(c.name, 'Uncategorised') AS category_name,
            SUM(ms.total) AS spend
       FROM monthly_summary ms
       LEFT JOIN categories c ON c.id = ms.category_id AND c.deleted_at IS NULL
      WHERE ms.month_key BETWEEN ? AND ?
      GROUP BY ms.category_id`,
    [ranges.this_q_start, ranges.this_q_end]
  );
  const prevRows = await all(
    `SELECT ms.category_id, COALESCE(c.name, 'Uncategorised') AS category_name,
            SUM(ms.total) AS spend
       FROM monthly_summary ms
       LEFT JOIN categories c ON c.id = ms.category_id AND c.deleted_at IS NULL
      WHERE ms.month_key BETWEEN ? AND ?
      GROUP BY ms.category_id`,
    [ranges.prev_q_start, ranges.prev_q_end]
  );

  const totalThis = thisRows.reduce((s, r) => s + r.spend, 0);
  const totalPrev = prevRows.reduce((s, r) => s + r.spend, 0);

  if (totalPrev === 0) {
    return { ready: false, reason: 'no_prior_quarter',
             this_q: ranges.this_q_start, prev_q: ranges.prev_q_start };
  }

  // Merge by category_id; an absent side contributes 0 share.
  const byCat = new Map();
  for (const r of prevRows) {
    byCat.set(r.category_id, {
      category_id: r.category_id,
      category_name: r.category_name,
      prev_spend: r.spend,
      this_spend: 0,
    });
  }
  for (const r of thisRows) {
    const cur = byCat.get(r.category_id) || {
      category_id: r.category_id,
      category_name: r.category_name,
      prev_spend: 0,
      this_spend: 0,
    };
    cur.this_spend = r.spend;
    cur.category_name = cur.category_name || r.category_name;
    byCat.set(r.category_id, cur);
  }

  const categories = [...byCat.values()].map((c) => {
    const prev_share  = totalPrev > 0 ? c.prev_spend / totalPrev : 0;
    const this_share  = totalThis > 0 ? c.this_spend / totalThis : 0;
    const share_drift = this_share - prev_share;
    const abs_growth  = c.prev_spend > 0 ? (c.this_spend - c.prev_spend) / c.prev_spend : null;
    const flagged =
      Math.abs(share_drift) >= DRIFT_THRESHOLD_PP &&
      prev_share >= MIN_PREV_SHARE;
    return {
      ...c,
      prev_share,
      this_share,
      share_drift,
      abs_growth,
      flagged,
    };
  });

  // Drift descending — biggest mix-shift categories surface first.
  categories.sort((a, b) => Math.abs(b.share_drift) - Math.abs(a.share_drift));

  return {
    ready: true,
    this_q: ranges.this_q_start,   // first month of the current quarter window
    prev_q: ranges.prev_q_start,   // first month of the prior quarter window
    total_this: totalThis,
    total_prev: totalPrev,
    drift_threshold_pp: DRIFT_THRESHOLD_PP,
    categories,
  };
}

// 6.8 — subscriptionLeakage()
//
// Ratio of the user's monthly committed subscription spend to their total
// monthly outflow. Live subs only (cancelled = 0 AND deleted_at IS NULL).
//
// `subscriptions.period` is free-form TEXT (v10's CHECK only constrains
// `verdict`, not `period`), so each sub's amount is converted to a monthly
// equivalent via periodToMonthly() — a defensive regex map with `unknown
// -> 1` (assume monthly, the default). Subs whose period was assumed are
// surfaced in `period_breakdown` so 6.12 UI can show a "we treated X as
// monthly" hint without us having to re-query.
//
// Denominator is monthly_summary's total for the current month — cheap
// rollup lookup; soft-delete-aware via v12 triggers.

import { all, one } from '../db';

// Exported because 6.12 / the Hub may want to render the same conversion
// (e.g. converting a ₹600 yearly sub to its ₹50/mo equivalent in a card).
export function periodToMonthly(period) {
  const p = (period || 'mo').toString().trim().toLowerCase();
  if (/^mo|month/.test(p))     return { factor: 1,        bucket: 'monthly'   };
  if (/^wk|week/.test(p))      return { factor: 4.345,    bucket: 'weekly'    };
  if (/^yr|year|annu/.test(p)) return { factor: 1 / 12,   bucket: 'yearly'    };
  if (/^q(tr)?|quarter/.test(p)) return { factor: 1 / 3,  bucket: 'quarterly' };
  if (/^d(ay)?/.test(p))       return { factor: 30.42,    bucket: 'daily'     };
  return { factor: 1, bucket: 'unknown' }; // assumed-monthly
}

export async function subscriptionLeakage() {
  const subs = await all(`
    SELECT id, name, amount, period
      FROM subscriptions
     WHERE deleted_at IS NULL
       AND cancelled = 0
  `);

  const period_breakdown = {
    monthly: 0, weekly: 0, yearly: 0, quarterly: 0, daily: 0, unknown: 0,
  };

  let monthly_subs_total = 0;
  const enriched = subs.map((s) => {
    const { factor, bucket } = periodToMonthly(s.period);
    const monthly_equiv = s.amount * factor;
    monthly_subs_total += monthly_equiv;
    period_breakdown[bucket] += 1;
    return { id: s.id, name: s.name, amount: s.amount, period: s.period, monthly_equiv };
  });

  const monthRow = await one(`
    SELECT COALESCE(SUM(total), 0) AS total
      FROM monthly_summary
     WHERE month_key = strftime('%Y-%m', 'now')
  `);
  const monthly_spend_total = monthRow?.total ?? 0;

  const leakage_ratio =
    monthly_spend_total > 0 ? monthly_subs_total / monthly_spend_total : null;

  // Top contributors — 3 highest monthly-equivalent subs. Useful for the
  // Hub card without making the caller re-sort.
  const top_subs = [...enriched]
    .sort((a, b) => b.monthly_equiv - a.monthly_equiv)
    .slice(0, 3);

  return {
    month_key: monthlyKeyFromNow(),
    monthly_subs_total,
    monthly_spend_total,
    leakage_ratio,
    subs_count: subs.length,
    period_breakdown,
    top_subs,
  };
}

function monthlyKeyFromNow() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

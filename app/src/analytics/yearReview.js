// PS-24 — Year-in-Review aggregator.
//
// Curated yearly retrospective. One function, one round trip per section.
// Calendar year (Jan–Dec) per Step-2 decision. Every input is on-device.
//
// Returns:
//   {
//     year, year_label,
//     total_spend, total_income, savings_rate_pct, savings_amount,
//     top_categories:  [{ id, name, emoji, total, share_pct, txn_count }],
//     top_merchants:   [{ id, name, total, txn_count }],
//     top_items:       null OR [{ normalized_name, display_name, qty_sum, spend_sum }],
//     biggest_splurge: null OR { id, merchant, amount, expense_date, category_name },
//     longest_streak:  { best, mode },
//     yoy:             null OR { prior_year, prior_total, delta_pct, direction },
//     three_numbers:   [{ label, value }, …]
//   }
//
// Top-items returns `null` when < 5 distinct items exist in the year — keeps
// the screen from rendering 'Top items: 1. Milk' on users who scan rarely
// (per Step-2 decision).

import { all, one } from '../db';
import { NOT_DELETED_C, NOT_DELETED_E } from '../db/predicates';
import { bestStreak } from './streaks';

const TOP_N = 5;
const MIN_ITEMS_FOR_SECTION = 5;

function yearWindow(year) {
  return { start: `${year}-01`, end: `${year}-12` };
}

export async function yearRollup({ year } = {}) {
  const yr = Number.isFinite(year) ? year : new Date().getFullYear();
  const { start, end } = yearWindow(yr);

  // Totals from rollup. monthly_summary already filters soft-deleted via
  // trigger consistency — no extra predicate needed.
  const spendRow = await one(
    `SELECT COALESCE(SUM(total), 0) AS total
       FROM monthly_summary
      WHERE month_key BETWEEN ? AND ?`,
    [start, end]
  );
  const total_spend = Number(spendRow?.total) || 0;

  const incomeRow = await one(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM income
      WHERE deleted_at IS NULL
        AND month_key BETWEEN ? AND ?`,
    [start, end]
  );
  const total_income = Number(incomeRow?.total) || 0;
  const savings_amount = total_income - total_spend;
  const savings_rate_pct = total_income > 0
    ? Math.max(0, Math.min(100, Math.round((savings_amount / total_income) * 100)))
    : 0;

  // Top categories by aggregate spend across the year.
  const top_categories = await all(
    `SELECT c.id AS id, c.name AS name, c.emoji AS emoji,
            SUM(ms.total) AS total,
            SUM(ms.txn_count) AS txn_count
       FROM monthly_summary ms
       JOIN categories c ON c.id = ms.category_id
      WHERE ms.month_key BETWEEN ? AND ?
        AND ${NOT_DELETED_C}
      GROUP BY c.id
      ORDER BY total DESC
      LIMIT ?`,
    [start, end, TOP_N]
  );
  for (const r of top_categories) {
    r.total = Number(r.total) || 0;
    r.txn_count = Number(r.txn_count) || 0;
    r.share_pct = total_spend > 0 ? +(r.total / total_spend * 100).toFixed(1) : 0;
  }

  // Top merchants — only merchant_id-bearing rows count (legacy free-text
  // merchant strings would inflate by spelling drift).
  const top_merchants = await all(
    `SELECT m.id AS id, m.name AS name,
            SUM(e.amount) AS total,
            COUNT(*) AS txn_count
       FROM expenses e
       JOIN merchants m ON m.id = e.merchant_id
      WHERE ${NOT_DELETED_E}
        AND e.month_key BETWEEN ? AND ?
      GROUP BY e.merchant_id
      ORDER BY total DESC
      LIMIT ?`,
    [start, end, TOP_N]
  );
  for (const r of top_merchants) {
    r.total = Number(r.total) || 0;
    r.txn_count = Number(r.txn_count) || 0;
  }

  // Top items — require ≥ 5 distinct normalized_names in the year.
  let top_items = null;
  const distinctItems = await one(
    `SELECT COUNT(DISTINCT i.normalized_name) AS n
       FROM receipt_items i
       JOIN expenses e ON e.id = i.expense_id
      WHERE ${NOT_DELETED_E}
        AND e.month_key BETWEEN ? AND ?
        AND (i.deleted_at IS NULL)`,
    [start, end]
  );
  if ((distinctItems?.n ?? 0) >= MIN_ITEMS_FOR_SECTION) {
    top_items = await all(
      `SELECT i.normalized_name AS normalized_name,
              MIN(i.name) AS display_name,
              SUM(i.canonical_qty) AS qty_sum,
              SUM(i.price) AS spend_sum,
              COUNT(*) AS txn_count
         FROM receipt_items i
         JOIN expenses e ON e.id = i.expense_id
        WHERE ${NOT_DELETED_E}
          AND e.month_key BETWEEN ? AND ?
          AND (i.deleted_at IS NULL)
        GROUP BY i.normalized_name
        ORDER BY spend_sum DESC
        LIMIT ?`,
      [start, end, TOP_N]
    );
    for (const r of top_items) {
      r.qty_sum = Number(r.qty_sum) || 0;
      r.spend_sum = Number(r.spend_sum) || 0;
      r.txn_count = Number(r.txn_count) || 0;
    }
  }

  // Biggest single-expense splurge.
  const splurgeRow = await one(
    `SELECT e.id, e.merchant, e.amount, e.expense_date,
            c.name AS category_name, c.emoji AS category_emoji
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
      WHERE ${NOT_DELETED_E}
        AND e.month_key BETWEEN ? AND ?
      ORDER BY e.amount DESC
      LIMIT 1`,
    [start, end]
  );
  const biggest_splurge = splurgeRow ? {
    id: splurgeRow.id,
    merchant: splurgeRow.merchant,
    amount: Number(splurgeRow.amount) || 0,
    expense_date: splurgeRow.expense_date,
    category_name: splurgeRow.category_name,
    category_emoji: splurgeRow.category_emoji,
  } : null;

  // Longest in-budget streak in the lookback. PS-23 caps at 24-month window;
  // for Year-in-Review we ask for 18 months to comfortably cover the calendar
  // year even when viewed in October. `force` bypasses the streak cache so
  // this is always fresh (Year-in-Review is rarely opened).
  const longest_streak = await bestStreak({ mode: 'in_budget', sinceMonths: 18, force: true });

  // YoY delta.
  const priorYr = yr - 1;
  const priorWindow = yearWindow(priorYr);
  const priorRow = await one(
    `SELECT COALESCE(SUM(total), 0) AS total
       FROM monthly_summary
      WHERE month_key BETWEEN ? AND ?`,
    [priorWindow.start, priorWindow.end]
  );
  const prior_total = Number(priorRow?.total) || 0;
  const yoy = prior_total > 0
    ? {
        prior_year: priorYr,
        prior_total,
        delta_pct: +((total_spend - prior_total) / prior_total * 100).toFixed(1),
        direction: total_spend > prior_total ? 'up' : total_spend < prior_total ? 'down' : 'flat',
      }
    : null;

  // "Your year in 3 numbers" — picked to be self-evidently meaningful even
  // without a chart. Always available; uses what survived above.
  const three_numbers = [
    { label: 'Total spent',     value: total_spend },
    { label: 'Total income',    value: total_income },
    { label: 'Savings rate %',  value: savings_rate_pct },
  ];

  return {
    year: yr,
    year_label: String(yr),
    total_spend,
    total_income,
    savings_amount,
    savings_rate_pct,
    top_categories,
    top_merchants,
    top_items,
    biggest_splurge,
    longest_streak: { best: longest_streak.best, mode: longest_streak.mode },
    yoy,
    three_numbers,
  };
}

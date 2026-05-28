// PS-25 — Time-of-day spend pattern histogram.
//
// Reads `expenses.expense_time` (HH:MM, NULL by default until the user
// flips `settings.capture_expense_time`). Aggregates per-hour totals over
// the requested month — or all-time when `monthKey` is omitted.
//
// `ready` flips true at ≥ 50 timestamped expenses in the requested window.
// Below that, the heat strip renders an empty-state ('keep logging' nudge)
// rather than a misleading sparse pattern.

import { all, one } from '../db';
import { NOT_DELETED_E } from '../db/predicates';

const MIN_SAMPLE = 50;

function emptyBuckets() {
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, count: 0 }));
}

export async function hourOfDayHistogram({ monthKey } = {}) {
  const params = [];
  const monthFilter = monthKey && /^\d{4}-\d{2}$/.test(monthKey)
    ? (params.push(monthKey), 'AND e.month_key = ?')
    : '';

  const sizeRow = await one(
    `SELECT COUNT(*) AS n
       FROM expenses e
      WHERE ${NOT_DELETED_E}
        AND e.expense_time IS NOT NULL
        ${monthFilter}`,
    params
  );
  const sample_size = Number(sizeRow?.n) || 0;
  const ready = sample_size >= MIN_SAMPLE;

  // Empty/sparse path: still return the 24-bucket shape so the UI doesn't
  // branch on undefined.
  if (sample_size === 0) {
    return {
      ready: false,
      sample_size,
      monthKey: monthKey ?? null,
      buckets: emptyBuckets(),
      peak_hour: null,
      total: 0,
    };
  }

  const rows = await all(
    `SELECT CAST(substr(e.expense_time, 1, 2) AS INTEGER) AS hour,
            SUM(e.amount) AS total,
            COUNT(*)      AS count
       FROM expenses e
      WHERE ${NOT_DELETED_E}
        AND e.expense_time IS NOT NULL
        ${monthFilter}
      GROUP BY hour
      ORDER BY hour`,
    params
  );

  const buckets = emptyBuckets();
  let total = 0;
  for (const r of rows) {
    const h = Number(r.hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) continue;
    const t = Number(r.total) || 0;
    buckets[h].total = t;
    buckets[h].count = Number(r.count) || 0;
    total += t;
  }

  let peak_hour = null;
  let peak = -Infinity;
  for (const b of buckets) {
    if (b.total > peak) { peak = b.total; peak_hour = b.hour; }
  }
  if (peak <= 0) peak_hour = null;

  return {
    ready,
    sample_size,
    monthKey: monthKey ?? null,
    buckets,
    peak_hour,
    total,
  };
}

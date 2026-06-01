import { all } from '../db';
import { getCached, SCOPES } from './cache';

// 7.11 — Recurring expense detection.
//
// Definition: a `recurring candidate` is a merchant whose live expenses
// across the last N months satisfy ALL of:
//   - present in ≥ `minStreak` consecutive months counting backwards from
//     the most-recent month that has data
//   - each of those months has at least one expense whose day-of-month
//     falls within ±dayTolerance of the median day-of-month for the
//     candidate
//   - the amounts in those months fall within `(1 ± amountTolerancePct)`
//     of the median amount
//
// Subscriptions are managed separately on their own surface; we still
// surface merchants that happen to look like recurring expenses. The
// `recurring=1` user flag is informational only — detection doesn't depend
// on it.
//
// Returns:
// {
//   ready,
//   asof_month_key,
//   total_expected,
//   candidates: [{
//     merchant, expected_day, expected_amount, expected_category_id,
//     category_name, category_emoji, history,
//     logged_this_month_id, confidence,
//     last_seen_date, projected_date_this_month
//   }]
// }
//
// All numeric arguments are validated and clamped to sensible ranges so
// callers can pass user-config knobs without precondition guards.

const DEFAULTS = {
  lookbackMonths: 6,
  minStreak: 3,
  amountTolerancePct: 0.15,
  dayTolerance: 3,
};

function median(nums) {
  if (!nums || !nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mode(values) {
  if (!values || !values.length) return null;
  const counts = new Map();
  let best = values[0];
  let bestC = 0;
  for (const v of values) {
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c > bestC) { bestC = c; best = v; }
  }
  return best;
}

function clampDoM(day, daysInMonth) {
  if (!Number.isFinite(day)) return 1;
  return Math.min(daysInMonth, Math.max(1, Math.round(day)));
}

function ymd(y, mIdx, d) {
  const mo = String(mIdx + 1).padStart(2, '0');
  const da = String(d).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function monthKeyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function shiftMonthKey(monthKey, delta) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]) + delta;
  while (mo > 12) { mo -= 12; y += 1; }
  while (mo < 1)  { mo += 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, '0')}`;
}

function daysInMonthOf(monthKey) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return 30;
  return new Date(Number(m[1]), Number(m[2]), 0).getDate();
}

// Pure function: walk expenses and emit candidates. Exported so the
// validation harness can exercise it without a live DB.
export function detectRecurringCandidates(expenseRows, asOf, opts = {}) {
  const lookbackMonths     = Math.max(2, Math.min(24, Number(opts.lookbackMonths)    || DEFAULTS.lookbackMonths));
  const minStreak          = Math.max(2, Math.min(12, Number(opts.minStreak)         || DEFAULTS.minStreak));
  const amountTolerancePct = Math.max(0.01, Math.min(1, Number(opts.amountTolerancePct) || DEFAULTS.amountTolerancePct));
  const dayTolerance       = Math.max(0, Math.min(15, Number(opts.dayTolerance)      || DEFAULTS.dayTolerance));
  const now = asOf instanceof Date ? asOf : new Date();
  const asofKey = monthKeyOf(now);

  const buckets = new Map();
  for (const r of expenseRows || []) {
    const key = String(r.merchant || '').trim().toLowerCase();
    if (!key) continue;
    const d = parseISODate(r.expense_date);
    if (!d) continue;
    if (!buckets.has(key)) buckets.set(key, { merchant: r.merchant, rows: [] });
    buckets.get(key).rows.push({ ...r, _date: d });
  }

  const candidates = [];
  for (const [, b] of buckets) {
    const grouped = new Map();
    for (const r of b.rows) {
      const mk = monthKeyOf(r._date);
      if (!grouped.has(mk)) grouped.set(mk, []);
      grouped.get(mk).push(r);
    }
    const sortedKeys = Array.from(grouped.keys()).sort();
    if (!sortedKeys.length) continue;

    // Walk back from the most-recent month-with-data to find longest
    // backwards-consecutive streak.
    let cursor = sortedKeys[sortedKeys.length - 1];
    const streakMonths = [];
    while (grouped.has(cursor)) {
      streakMonths.push(cursor);
      if (streakMonths.length > lookbackMonths) break;
      cursor = shiftMonthKey(cursor, -1);
    }
    if (streakMonths.length < minStreak) continue;

    // Per-month rep: the latest row each month (recurring fires tend to be
    // stable so taking the latest gives the most-recent DoM signal).
    const reps = streakMonths.map((mk) => {
      const arr = grouped.get(mk);
      return arr[arr.length - 1];
    });
    const doms    = reps.map((r) => r._date.getDate());
    const amounts = reps.map((r) => Number(r.amount) || 0);
    const medDoM    = clampDoM(median(doms), 28);
    const medAmount = median(amounts);
    if (medAmount <= 0) continue;

    let confidenceHigh = true;
    let validMonths = 0;
    for (const r of reps) {
      const dom = r._date.getDate();
      const amt = Number(r.amount) || 0;
      const dtOK = Math.abs(dom - medDoM) <= dayTolerance;
      const amtOK = Math.abs(amt - medAmount) / medAmount <= amountTolerancePct;
      if (dtOK && amtOK) validMonths += 1;
      if (!dtOK || !amtOK) confidenceHigh = false;
    }
    if (validMonths < minStreak) continue;

    // logged-this-month detection.
    const thisMonthRows = grouped.get(asofKey) || [];
    let loggedThisMonth = null;
    for (const r of thisMonthRows) {
      const dom = r._date.getDate();
      const amt = Number(r.amount) || 0;
      const dtOK  = Math.abs(dom - medDoM) <= dayTolerance;
      const amtOK = Math.abs(amt - medAmount) / medAmount <= amountTolerancePct;
      if (dtOK && amtOK) { loggedThisMonth = r; break; }
    }

    const catIds = reps.map((r) => r.category_id).filter((v) => v != null);
    const expectedCatId = catIds.length ? mode(catIds) : (reps[reps.length - 1].category_id ?? null);
    const expectedCatRow = reps.find((r) => r.category_id === expectedCatId);

    // reps[0] is the most-recent month rep; reverse history order so callers
    // get oldest→newest, easier to render as a small trend.
    const historyAsc = [...reps].reverse().map((r) => ({
      id: r.id,
      date: r._date.toISOString().slice(0, 10),
      amount: Number(r.amount) || 0,
    }));

    const projectedDate = ymd(
      Number(asofKey.slice(0, 4)),
      Number(asofKey.slice(5, 7)) - 1,
      clampDoM(medDoM, daysInMonthOf(asofKey)),
    );

    candidates.push({
      merchant: b.merchant,
      expected_day: medDoM,
      expected_amount: medAmount,
      expected_category_id: expectedCatId ?? null,
      category_name: expectedCatRow?.category_name || null,
      category_emoji: expectedCatRow?.category_emoji || null,
      history: historyAsc,
      logged_this_month_id: loggedThisMonth ? loggedThisMonth.id : null,
      confidence: confidenceHigh ? 'high' : 'medium',
      last_seen_date: reps[0]._date.toISOString().slice(0, 10),
      projected_date_this_month: projectedDate,
    });
  }

  candidates.sort((a, b) => a.projected_date_this_month.localeCompare(b.projected_date_this_month));
  return {
    ready: true,
    asof_month_key: asofKey,
    candidates,
    total_expected: candidates.reduce((s, c) => s + c.expected_amount, 0),
  };
}

export async function recurringCandidates(opts = {}) {
  const lookbackMonths     = Math.max(2, Math.min(24, Number(opts.lookbackMonths)    || DEFAULTS.lookbackMonths));
  const minStreak          = Math.max(2, Math.min(12, Number(opts.minStreak)         || DEFAULTS.minStreak));
  const amountTolerancePct = Math.max(0.01, Math.min(1, Number(opts.amountTolerancePct) || DEFAULTS.amountTolerancePct));
  const dayTolerance       = Math.max(0, Math.min(15, Number(opts.dayTolerance)      || DEFAULTS.dayTolerance));
  const asOf               = opts.asOf instanceof Date ? opts.asOf : new Date();

  const key = `recurring:${lookbackMonths}:${minStreak}:${amountTolerancePct}:${dayTolerance}:${monthKeyOf(asOf)}`;

  return getCached(key, SCOPES.SPEND, 12 * 60 * 60 * 1000, async () => {
    const asofKey = monthKeyOf(asOf);
    const startKey = shiftMonthKey(asofKey, -(lookbackMonths - 1));
    const rows = await all(
      `SELECT e.id, e.merchant, e.amount, e.expense_date, e.category_id,
              c.name AS category_name, c.emoji AS category_emoji
         FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
        WHERE e.deleted_at IS NULL
          AND e.is_pending = 0
          AND e.month_key >= ?
          AND e.month_key <= ?
     ORDER BY e.expense_date ASC, e.id ASC`,
      [startKey, asofKey]
    );
    return detectRecurringCandidates(rows, asOf, { lookbackMonths, minStreak, amountTolerancePct, dayTolerance });
  });
}

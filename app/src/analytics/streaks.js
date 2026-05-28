// PS-23 — No-spend / in-budget streak tracker.
//
// Behavioural metric. Two modes:
//   * 'no_spend'  — consecutive days with zero outflow.
//   * 'in_budget' — consecutive days where day's spend ≤ (that month's
//                   Σ category budgets) / (daysInThatMonth). Calendar-aware
//                   daily basis so Feb 28s aren't penalised against Jan 31s.
//
// Today is included by design (per PS-23 Step-2 decision): an evening expense
// will downgrade the chip within the 1 h cache window. Streak counts back
// from `today` and stops at the first non-qualifying day.
//
// `bestStreak` walks the same series and tracks the longest run inside the
// window. `noSpendDayMap` exposes a day → true map for SpendCalendar's
// per-cell overlay.
//
// No schema change — every signal lives in `expenses` already. Cached for
// 1 h via `analytics_cache` under SCOPES.STREAKS.

import { all, one } from '../db';
import { NOT_DELETED } from '../db/predicates';
import { getCached, SCOPES } from './cache';

const ONE_HOUR_SEC = 3600;

function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(yyyy, mm /* 1-12 */) {
  return new Date(yyyy, mm, 0).getDate();
}

// Shift `key` (YYYY-MM-DD) by `delta` days. Pure date math via UTC ms.
function shiftDay(key, delta) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return todayKey(d);
}

// Pull the per-day expense totals for the lookback window. Soft-delete-aware
// via NOT_DELETED. Returns Map<YYYY-MM-DD, totalAmount>.
async function dailyTotals({ lookbackDays }) {
  const rows = await all(
    `SELECT expense_date AS d, SUM(amount) AS total
       FROM expenses
      WHERE ${NOT_DELETED}
        AND date(expense_date) >= date('now', ?)
      GROUP BY expense_date`,
    [`-${lookbackDays} days`]
  );
  const map = new Map();
  for (const r of rows) map.set(r.d, Number(r.total) || 0);
  return map;
}

// Month-budget total for `month_key`. Today we have a single `categories`
// table — budgets are not historised — so every past month uses the current
// total. (When historised budgets ship, this is the seam to thread that
// through.) Soft-delete-aware via NOT_DELETED.
async function currentMonthBudgetTotal() {
  const row = await one(
    `SELECT COALESCE(SUM(budget), 0) AS total
       FROM categories
      WHERE ${NOT_DELETED}`
  );
  return Number(row?.total) || 0;
}

function dailyBudgetForKey(dayKey, monthBudget) {
  const [yyyy, mm] = dayKey.split('-').map((s) => parseInt(s, 10));
  const dim = daysInMonth(yyyy, mm);
  return monthBudget / dim;
}

// Walks back from `today` and counts the leading run that satisfies the
// predicate. Stops at first failure. Returns 0 if today fails.
function countLeading(predicate, today, lookbackDays) {
  let streak = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const key = shiftDay(today, -i);
    if (!predicate(key)) return streak;
    streak += 1;
  }
  return streak;
}

// Walks the whole window and returns the longest run that satisfied
// `predicate`. O(n) single pass.
function longestRun(predicate, today, lookbackDays) {
  let best = 0, run = 0;
  for (let i = 0; i < lookbackDays; i++) {
    const key = shiftDay(today, -i);
    if (predicate(key)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function predicateFor(mode, totals, monthBudget) {
  if (mode === 'no_spend') {
    return (key) => (totals.get(key) || 0) === 0;
  }
  if (mode === 'in_budget') {
    if (monthBudget <= 0) return () => false;
    return (key) => (totals.get(key) || 0) <= dailyBudgetForKey(key, monthBudget);
  }
  throw new Error(`streaks: unknown mode "${mode}"`);
}

async function computeCurrentStreak(mode, lookbackDays) {
  const today = todayKey();
  const totals = await dailyTotals({ lookbackDays });
  const monthBudget = mode === 'in_budget' ? await currentMonthBudgetTotal() : 0;
  if (mode === 'in_budget' && monthBudget <= 0) {
    return { streak: 0, mode, lastDay: today, includeToday: true, evaluatedAt: today };
  }
  const predicate = predicateFor(mode, totals, monthBudget);
  return {
    streak: countLeading(predicate, today, lookbackDays),
    mode,
    lastDay: today,
    includeToday: true,
    evaluatedAt: today,
  };
}

async function computeBestStreak(mode, lookbackDays) {
  const today = todayKey();
  const totals = await dailyTotals({ lookbackDays });
  const monthBudget = mode === 'in_budget' ? await currentMonthBudgetTotal() : 0;
  if (mode === 'in_budget' && monthBudget <= 0) {
    return { best: 0, mode, window: { start: shiftDay(today, -(lookbackDays - 1)), end: today } };
  }
  const predicate = predicateFor(mode, totals, monthBudget);
  return {
    best: longestRun(predicate, today, lookbackDays),
    mode,
    window: { start: shiftDay(today, -(lookbackDays - 1)), end: today },
  };
}

export async function currentStreak({ mode = 'in_budget', lookbackDays = 60, force = false } = {}) {
  if (mode !== 'no_spend' && mode !== 'in_budget') {
    throw new Error(`streaks: unknown mode "${mode}"`);
  }
  if (force) return computeCurrentStreak(mode, lookbackDays);
  return getCached(
    `streaks:current:${mode}:${todayKey()}`,
    ONE_HOUR_SEC,
    () => computeCurrentStreak(mode, lookbackDays),
    { scope: SCOPES.STREAKS }
  );
}

export async function bestStreak({ mode = 'in_budget', sinceMonths = 24, force = false } = {}) {
  if (mode !== 'no_spend' && mode !== 'in_budget') {
    throw new Error(`streaks: unknown mode "${mode}"`);
  }
  const lookbackDays = Math.max(1, Math.round(sinceMonths * 30));
  if (force) return computeBestStreak(mode, lookbackDays);
  return getCached(
    `streaks:best:${mode}:${sinceMonths}:${todayKey()}`,
    ONE_HOUR_SEC,
    () => computeBestStreak(mode, lookbackDays),
    { scope: SCOPES.STREAKS }
  );
}

// Used by SpendCalendar to overlay a tiny mark on every no-spend day in the
// visible window. Returned as a plain object so callers can `Object.create(null)`
// equivalent semantics without paying the Map serialisation cost — the cache
// path is intentionally NOT used here (SpendCalendar already paginates).
export async function noSpendDayMap({ sinceDays = 60 } = {}) {
  const totals = await dailyTotals({ lookbackDays: sinceDays });
  const map = {};
  const today = todayKey();
  for (let i = 0; i < sinceDays; i++) {
    const key = shiftDay(today, -i);
    if (!totals.has(key)) map[key] = true;
  }
  return map;
}

export const __testables = {
  shiftDay,
  daysInMonth,
  dailyBudgetForKey,
  countLeading,
  longestRun,
  predicateFor,
  computeCurrentStreak,
  computeBestStreak,
};

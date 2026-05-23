// 7.2 — sub-bill projection helpers.
//
// Pure functions. No React, no DB, no Metro-only imports — safe to load
// from a Node validation harness without any test-double scaffolding.
//
// `periodToMonthly()` (analytics/subscriptions.js) classifies the free-form
// `subscriptions.period` TEXT into one of: mo / wk / yr / q / d / unknown.
// We reuse the same vocabulary here for projection, with `unknown -> monthly`
// (matching the established "assume monthly" fallback decided in 6.8).

import { periodToMonthly } from '../../analytics/subscriptions';

// Hard cap so a pathological `period = 'd'` over a wide horizon can't generate
// 365+ entries per sub. Weekly subs over a full year top out at ~53 — the cap
// is generous enough to never trip on legitimate input.
const MAX_OCCURRENCES = 60;

function parseISODate(str) {
  if (!str || typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function daysInMonth(year, monthIndex) {
  // monthIndex is 0..11. The "day 0" trick returns the last day of the
  // previous month, so passing month+1 gives us this month's length.
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Excel-style EDATE clamp: hold the original anchor day, snap to month-end
// when the target month is shorter. Anchor stays the original day so a
// Jan-31 monthly series reads Jan-31, Feb-28/29, Mar-31, Apr-30, May-31 …
// instead of drifting to Feb-28, Mar-28, Mar-28, ….
function dateAt(year, monthIndex, anchorDay) {
  const last = daysInMonth(year, monthIndex);
  return new Date(year, monthIndex, Math.min(anchorDay, last));
}

function addMonths(year, monthIndex, anchorDay, deltaMonths) {
  const total = monthIndex + deltaMonths;
  const ny = year + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return dateAt(ny, nm, anchorDay);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Generate the list of due-date occurrences for one sub between two Date
 * boundaries (inclusive on both ends).
 *
 *   nextBillStr  YYYY-MM-DD; the canonical "next bill on or after today" anchor
 *   period       free-form text (mo|wk|yr|q|d|…); regex-classified
 *   horizonStart inclusive lower bound
 *   horizonEnd   inclusive upper bound
 *
 * Returns Date[] sorted ascending. Returns [] for:
 *   - null/invalid nextBillStr
 *   - empty horizon (start > end)
 *
 * If nextBillStr is *before* horizonStart, the walker rolls the series
 * forward until the first occurrence falls inside the window — so a user
 * who hasn't updated next_bill in months still sees correct upcoming dates.
 */
export function nextOccurrencesFrom(nextBillStr, period, horizonStart, horizonEnd) {
  const anchor = parseISODate(nextBillStr);
  if (!anchor) return [];
  if (!(horizonStart instanceof Date) || !(horizonEnd instanceof Date)) return [];
  if (horizonStart.getTime() > horizonEnd.getTime()) return [];

  const { bucket } = periodToMonthly(period);
  const out = [];
  const startMs = horizonStart.getTime();
  const endMs = horizonEnd.getTime();

  if (bucket === 'weekly') {
    let d = new Date(anchor.getTime());
    // Catch up to window if anchor is in the past.
    if (d.getTime() < startMs) {
      const diffMs = startMs - d.getTime();
      const weeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
      d = addDays(d, weeks * 7);
    }
    while (d.getTime() <= endMs && out.length < MAX_OCCURRENCES) {
      out.push(d);
      d = addDays(d, 7);
    }
    return out;
  }

  if (bucket === 'daily') {
    let d = new Date(anchor.getTime());
    if (d.getTime() < startMs) {
      const diffMs = startMs - d.getTime();
      const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
      d = addDays(d, days);
    }
    while (d.getTime() <= endMs && out.length < MAX_OCCURRENCES) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }

  // Monthly / quarterly / yearly / unknown(→monthly) all use the anchor-day
  // model with month-end clamping. anchorDay is the original day-of-month;
  // we rebuild each occurrence as (year, month, min(anchorDay, daysInMonth)).
  const anchorYear  = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();
  const anchorDay   = anchor.getDate();
  const monthStep   = bucket === 'yearly' ? 12 : bucket === 'quarterly' ? 3 : 1;

  // Find the smallest k >= 0 such that addMonths(..., k*step) is in window
  // (or >= startMs). We walk forward from k=0; if the anchor itself is past
  // startMs, k=0 is already correct. If anchor is before startMs, advance.
  let k = 0;
  let d = addMonths(anchorYear, anchorMonth, anchorDay, k * monthStep);
  while (d.getTime() < startMs && k < MAX_OCCURRENCES * 5) {
    k += 1;
    d = addMonths(anchorYear, anchorMonth, anchorDay, k * monthStep);
  }
  while (d.getTime() <= endMs && out.length < MAX_OCCURRENCES) {
    out.push(d);
    k += 1;
    d = addMonths(anchorYear, anchorMonth, anchorDay, k * monthStep);
  }
  return out;
}

/**
 * Project every sub into a single month's view. Returns:
 *   subsByDay     Map<day, { sub, date }[]>  keyed by 1..31
 *   dailySubs     subs with period bucket = 'daily' (rendered as footnote)
 *   skippedSubs   subs we couldn't project (next_bill missing)
 *
 * Filters out cancelled + soft-deleted subs upstream — caller passes the
 * already-filtered list (or the raw list; we filter defensively here too).
 *
 *   subs       array of subscription rows (id, name, amount, period, next_bill,
 *              icon, color, cancelled, deleted_at)
 *   monthKey   'YYYY-MM' anchoring the projection window
 */
export function projectSubsForMonth(subs, monthKey) {
  const out = { subsByDay: new Map(), dailySubs: [], skippedSubs: [] };
  if (!Array.isArray(subs) || subs.length === 0) return out;
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey || '');
  if (!m) return out;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const horizonStart = new Date(year, monthIndex, 1);
  const horizonEnd   = new Date(year, monthIndex, daysInMonth(year, monthIndex));

  for (const sub of subs) {
    if (!sub) continue;
    if (sub.cancelled) continue;
    if (sub.deleted_at) continue;
    if (!sub.next_bill) { out.skippedSubs.push(sub); continue; }
    const { bucket } = periodToMonthly(sub.period);
    if (bucket === 'daily') { out.dailySubs.push(sub); continue; }
    const dates = nextOccurrencesFrom(sub.next_bill, sub.period, horizonStart, horizonEnd);
    for (const d of dates) {
      const day = d.getDate();
      let arr = out.subsByDay.get(day);
      if (!arr) { arr = []; out.subsByDay.set(day, arr); }
      arr.push({ sub, date: d });
    }
  }
  return out;
}

/**
 * 6×7 grid cells for a Sun..Sat-aligned month view. Leading + trailing blank
 * cells fill the rows the in-month days don't occupy. Always returns exactly
 * 42 cells so the renderer can lay out a stable grid without conditionals.
 *
 * Returns: { year, monthIndex, daysInMonth, leadingBlanks, cells }
 *   cells: [{ day: number|null, inMonth: boolean }]
 */
export function monthGridCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const leadingBlanks = first.getDay(); // 0=Sun..6=Sat
  const dim = daysInMonth(year, monthIndex);
  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, inMonth: false });
  for (let d = 1; d <= dim; d++) cells.push({ day: d, inMonth: true });
  while (cells.length < 42) cells.push({ day: null, inMonth: false });
  return { year, monthIndex, daysInMonth: dim, leadingBlanks, cells };
}

// Helpers exposed for the screen so it can render headers / shift the pager
// without re-deriving these inline.

export const SUB_CAL_MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export const SUB_CAL_WEEKDAY_HEAD = ['S','M','T','W','T','F','S'];

export function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function shiftMonth(year, monthIndex, deltaMonths) {
  const total = monthIndex + deltaMonths;
  const ny = year + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return { year: ny, monthIndex: nm };
}

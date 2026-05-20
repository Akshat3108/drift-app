// 5.3 — filter criteria layer.
//
// `criteria` is the single object passed between the FilterSheet UI, the
// saved_filters JSON store, and the WHERE builder. Pure JS — no React, no
// DB. The builder allowlists keys so unknown payload fields are silently
// dropped (forward-compat with 5.4 / 5.5 / 7.3 additions to the shape).
//
// Reserved keys without a current column (e.g. paymentMethods → 5.4) appear
// in `CRITERIA_KEYS` so consumers can construct future-shaped objects today,
// but the builder no-ops them until the underlying column lands.

import { NOT_DELETED_E } from '../../db/predicates';

// Keys the criteria object may contain. Anything else is dropped on the
// floor by `normalizeCriteria`.
export const CRITERIA_KEYS = [
  'categoryIds',         // number[]                    — e.categoryId IN (?, ...)
  'merchantIds',         // number[]                    — e.merchant_id IN (?, ...)
  'accountIds',          // number[]   (reserved; not surfaced in v1 UI)
  'tripIds',             // number[]   (reserved; not surfaced in v1 UI)
  'dateRange',           // {from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD'} OR {preset: ...}
  'amountRange',         // {min?: number, max?: number}
  'recurring',           // true | false | undefined
  'hasReceipt',          // true | false | undefined    — COALESCE(receipt_path, receipt_uri) IS NOT NULL
  'moods',               // string[]                    — e.mood IN (?, ...)
  'paymentMethods',      // string[]                    — e.payment_method IN (?, ...)
  'ids',                 // number[]                    — e.id IN (?, ...) — 5.8 batch ops + 5.7 export
];

// Date-range presets resolve to absolute YYYY-MM-DD pairs. Computed against a
// pluggable `today` for testability.
export const DATE_PRESETS = ['thisMonth', 'lastMonth', 'last3', 'ytd', 'all'];

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

export function presetToDateRange(preset, today = new Date()) {
  switch (preset) {
    case 'thisMonth':
      return { from: isoDate(startOfMonth(today)), to: isoDate(endOfMonth(today)) };
    case 'lastMonth': {
      const t = addMonths(today, -1);
      return { from: isoDate(startOfMonth(t)), to: isoDate(endOfMonth(t)) };
    }
    case 'last3': {
      const from = addMonths(today, -2);
      return { from: isoDate(startOfMonth(from)), to: isoDate(endOfMonth(today)) };
    }
    case 'ytd':
      return { from: `${today.getFullYear()}-01-01`, to: isoDate(today) };
    case 'all':
    default:
      return null;
  }
}

// Strip unknown keys; sort array values so two semantically-equal criteria
// produce identical JSON (helps prepared-statement caching).
export function normalizeCriteria(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const k of CRITERIA_KEYS) {
    if (!(k in input)) continue;
    const v = input[k];
    if (v == null) continue;
    if (Array.isArray(v)) {
      const arr = v.filter((x) => x != null);
      if (!arr.length) continue;
      // sort numerically for IDs, lexicographically for strings
      const sorted = arr.slice().sort((a, b) =>
        typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
      out[k] = sorted;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function inPlaceholders(n) { return Array(n).fill('?').join(', '); }

// `tableAlias` is the SQL alias used for the expenses table in the caller.
// Defaults to `e` (matches expenses.repo.list / search).
export function buildWhere(rawCriteria, { tableAlias = 'e' } = {}) {
  const c = normalizeCriteria(rawCriteria);
  const E = tableAlias;
  const frags = [`${E}.deleted_at IS NULL`];
  const params = [];

  if (c.categoryIds && c.categoryIds.length) {
    frags.push(`${E}.category_id IN (${inPlaceholders(c.categoryIds.length)})`);
    params.push(...c.categoryIds);
  }
  if (c.merchantIds && c.merchantIds.length) {
    frags.push(`${E}.merchant_id IN (${inPlaceholders(c.merchantIds.length)})`);
    params.push(...c.merchantIds);
  }
  if (c.accountIds && c.accountIds.length) {
    frags.push(`${E}.account_id IN (${inPlaceholders(c.accountIds.length)})`);
    params.push(...c.accountIds);
  }
  if (c.tripIds && c.tripIds.length) {
    frags.push(`${E}.trip_id IN (${inPlaceholders(c.tripIds.length)})`);
    params.push(...c.tripIds);
  }
  if (c.dateRange) {
    const { from, to, preset } = c.dateRange;
    let lo = from, hi = to;
    if (preset && !from && !to) {
      const resolved = presetToDateRange(preset);
      if (resolved) { lo = resolved.from; hi = resolved.to; }
    }
    // Prefer the indexed month_key when both bounds are month-aligned (1st of
    // month for `from`, last-of-month for `to`); otherwise fall back to
    // expense_date BETWEEN. The cheap test below covers the common preset
    // case without parsing dates twice.
    if (lo && hi && /-01$/.test(lo) && isMonthEnd(hi)) {
      const fromMonth = lo.slice(0, 7);
      const toMonth = hi.slice(0, 7);
      frags.push(`${E}.month_key BETWEEN ? AND ?`);
      params.push(fromMonth, toMonth);
    } else if (lo && hi) {
      frags.push(`${E}.expense_date BETWEEN ? AND ?`);
      params.push(lo, hi);
    } else if (lo) {
      frags.push(`${E}.expense_date >= ?`);
      params.push(lo);
    } else if (hi) {
      frags.push(`${E}.expense_date <= ?`);
      params.push(hi);
    }
  }
  if (c.amountRange) {
    const { min, max } = c.amountRange;
    if (Number.isFinite(min) && Number.isFinite(max)) {
      frags.push(`${E}.amount BETWEEN ? AND ?`);
      params.push(min, max);
    } else if (Number.isFinite(min)) {
      frags.push(`${E}.amount >= ?`);
      params.push(min);
    } else if (Number.isFinite(max)) {
      frags.push(`${E}.amount <= ?`);
      params.push(max);
    }
  }
  if (c.recurring === true)  frags.push(`${E}.recurring = 1`);
  if (c.recurring === false) frags.push(`${E}.recurring = 0`);
  // 5.15 — match either the permanent receipt_path (5.12 onward) or the
  // legacy receipt_uri (pre-5.12 rows that haven't been migrated yet).
  if (c.hasReceipt === true)  frags.push(`COALESCE(${E}.receipt_path, ${E}.receipt_uri) IS NOT NULL`);
  if (c.hasReceipt === false) frags.push(`COALESCE(${E}.receipt_path, ${E}.receipt_uri) IS NULL`);
  if (c.moods && c.moods.length) {
    frags.push(`${E}.mood IN (${inPlaceholders(c.moods.length)})`);
    params.push(...c.moods);
  }
  if (c.paymentMethods && c.paymentMethods.length) {
    frags.push(`${E}.payment_method IN (${inPlaceholders(c.paymentMethods.length)})`);
    params.push(...c.paymentMethods);
  }
  if (c.ids && c.ids.length) {
    frags.push(`${E}.id IN (${inPlaceholders(c.ids.length)})`);
    params.push(...c.ids);
  }

  return { whereSql: frags.join(' AND '), params };
}

function isMonthEnd(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return d === last;
}

// True when the criteria object has at least one effective filter (i.e. would
// produce a non-empty fragment beyond `${NOT_DELETED_E}`). Used by the
// AllExpenses screen to decide whether to short-circuit to the in-memory feed.
export function hasActiveFilters(rawCriteria) {
  const c = normalizeCriteria(rawCriteria);
  if (c.categoryIds && c.categoryIds.length) return true;
  if (c.merchantIds && c.merchantIds.length) return true;
  if (c.accountIds && c.accountIds.length) return true;
  if (c.tripIds && c.tripIds.length) return true;
  if (c.moods && c.moods.length) return true;
  if (c.paymentMethods && c.paymentMethods.length) return true;
  if (c.ids && c.ids.length) return true;
  if (c.amountRange && (Number.isFinite(c.amountRange.min) || Number.isFinite(c.amountRange.max))) return true;
  if (c.recurring === true || c.recurring === false) return true;
  if (c.hasReceipt === true || c.hasReceipt === false) return true;
  if (c.dateRange) {
    const { from, to, preset } = c.dateRange;
    if (from || to) return true;
    if (preset && preset !== 'all') return true;
  }
  return false;
}

// Human-readable summary for saved-filter pills. Keeps it short ("Groceries · Last 30 days").
export function criteriaToHumanLabel(rawCriteria, { categoryMap = {}, merchantMap = {} } = {}) {
  const c = normalizeCriteria(rawCriteria);
  const parts = [];
  if (c.categoryIds && c.categoryIds.length) {
    const names = c.categoryIds.map((id) => categoryMap[id]?.name).filter(Boolean);
    if (names.length === 1) parts.push(names[0]);
    else if (names.length > 1) parts.push(`${names.length} categories`);
  }
  if (c.dateRange) {
    if (c.dateRange.preset && c.dateRange.preset !== 'all') {
      parts.push(({
        thisMonth: 'This month', lastMonth: 'Last month',
        last3: 'Last 3 months', ytd: 'Year to date',
      })[c.dateRange.preset] || 'Custom range');
    } else if (c.dateRange.from || c.dateRange.to) {
      parts.push(`${c.dateRange.from || '…'} → ${c.dateRange.to || '…'}`);
    }
  }
  if (c.amountRange) {
    const { min, max } = c.amountRange;
    if (Number.isFinite(min) && Number.isFinite(max)) parts.push(`${min}–${max}`);
    else if (Number.isFinite(min)) parts.push(`≥ ${min}`);
    else if (Number.isFinite(max)) parts.push(`≤ ${max}`);
  }
  if (c.merchantIds && c.merchantIds.length) {
    const names = c.merchantIds.map((id) => merchantMap[id]?.canonical_name).filter(Boolean);
    if (names.length === 1) parts.push(names[0]);
    else if (names.length > 1) parts.push(`${names.length} merchants`);
  }
  if (c.recurring === true) parts.push('Recurring');
  if (c.recurring === false) parts.push('One-off');
  if (c.hasReceipt === true) parts.push('With receipt');
  if (c.hasReceipt === false) parts.push('No receipt');
  if (c.moods && c.moods.length) parts.push(`${c.moods.length} mood${c.moods.length === 1 ? '' : 's'}`);
  if (c.paymentMethods && c.paymentMethods.length) {
    if (c.paymentMethods.length === 1) {
      parts.push((PAYMENT_LABELS[c.paymentMethods[0]] || c.paymentMethods[0]));
    } else {
      parts.push(`${c.paymentMethods.length} payment methods`);
    }
  }
  if (c.ids && c.ids.length) {
    parts.push(`${c.ids.length} selected`);
  }
  return parts.join(' · ') || 'All transactions';
}

// Shared display table for payment_method (5.4). The emoji prefix is the
// inline badge on AllExpenses rows and the Detail "Payment" meta-row.
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'wallet', 'other'];
export const PAYMENT_LABELS = {
  cash:   '💵 Cash',
  upi:    '📱 UPI',
  card:   '💳 Card',
  wallet: '👛 Wallet',
  other:  '… Other',
};
export const PAYMENT_EMOJI = {
  cash: '💵', upi: '📱', card: '💳', wallet: '👛', other: '…',
};

// Re-export for callers that want to splice the predicate directly without
// going through buildWhere (mostly for symmetry with the predicates module).
export { NOT_DELETED_E };

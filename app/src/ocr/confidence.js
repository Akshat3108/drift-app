// Confidence scoring for a parsed receipt. The orchestrator runs this
// after extraction. The UI uses the overall score (0..1) to decide whether
// to flag the bill for closer review.
//
// Components, each scored 0..1, then weighted:
//   currency   10%  — currency symbol detected anywhere
//   date       10%  — valid date parsed
//   merchant   10%  — non-default merchant string
//   format     10%  — strength of format detection
//   items      20%  — at least one valid item extracted
//   total      20%  — total > 0
//   reconcile  20%  — sum(items) + fees + tax − discount ≈ total

const WEIGHTS = {
  currency: 0.10,
  date:     0.10,
  merchant: 0.10,
  format:   0.10,
  items:    0.20,
  total:    0.20,
  reconcile: 0.20,
};

function within(actual, expected, tolerance) {
  if (!isFinite(actual) || !isFinite(expected) || expected <= 0) return false;
  return Math.abs(actual - expected) / expected <= tolerance;
}

// 4.18 — adaptive reconciliation tolerance: `max(0.03, min(0.10, 3/n))`.
// Short bills get the generous ceiling (each item is large relative to the
// total, so a missed item shows up dramatically against any %); long bills get
// the floor (each item is small relative to total, so a finer % still catches
// real omissions). Concretely:
//   n ≤ 30   → 0.10 (ceiling — 3/n ≥ 0.10)
//   n = 50   → 0.06
//   n ≥ 100  → 0.03 (floor)
// The soft band stays at 2× the primary so the "half credit" semantics in the
// reconcile component hold across bill sizes; the subtotal fallback uses the
// primary band — same strictness as the items-sum check.
function reconcileTolerances(itemCount) {
  const n = Math.max(1, itemCount);
  const primary = Math.max(0.03, Math.min(0.10, 3 / n));
  return { primary, soft: 2 * primary, subtotal: primary };
}

export function scoreConfidence(parsed) {
  const components = {
    currency:  parsed.currency ? 1 : 0,
    date:      parsed.date && parsed.date !== parsed._fallbackDate ? 1 : 0.3,
    merchant:  parsed.merchant && parsed.merchant !== 'Unknown store' ? 1 : 0,
    format:    typeof parsed.formatConfidence === 'number' ? parsed.formatConfidence : 0,
    items:     (parsed.items?.length || 0) > 0 ? 1 : 0,
    total:     parsed.total > 0 ? 1 : 0,
    reconcile: 0,
  };

  // Reconciliation: items + fees + tax - discount ≈ total. Tolerances scale
  // with item count via reconcileTolerances().
  if (parsed.total > 0) {
    const itemsSum = (parsed.items || []).reduce((s, it) => s + (it.price || 0), 0);
    const feesSum  = (parsed.fees  || []).reduce((s, f)  => s + (f.amount || 0), 0);
    const discountSum = (parsed.discounts || []).reduce((s, d) => s + Math.abs(d.amount || 0), 0);
    const tax = parsed.tax || 0;
    const expected = itemsSum + tax + feesSum - discountSum;
    const tol = reconcileTolerances((parsed.items || []).length);
    if (within(expected, parsed.total, tol.primary)) {
      components.reconcile = 1;
    } else if (within(expected, parsed.total, tol.soft)) {
      components.reconcile = 0.5;
    } else if (parsed.subtotal > 0 && within(parsed.subtotal + tax + feesSum - discountSum, parsed.total, tol.subtotal)) {
      // Fall back to subtotal-based reconciliation if items list looks incomplete.
      components.reconcile = 0.7;
    } else {
      components.reconcile = 0;
    }
  }

  let overall = 0;
  for (const k of Object.keys(WEIGHTS)) overall += components[k] * WEIGHTS[k];

  let label;
  if (overall >= 0.85) label = 'high';
  else if (overall >= 0.6) label = 'medium';
  else label = 'low';

  // Per-field flags so the UI can highlight what's likely wrong.
  const flags = {
    needsMerchant: components.merchant === 0,
    needsDate:     components.date < 1,
    needsItems:    components.items === 0,
    needsTotal:    components.total === 0,
    needsReview:   components.reconcile < 0.5 || overall < 0.6,
  };

  return { overall: +overall.toFixed(3), label, components, flags };
}

// PS-35 — pure auto-tag rule matcher. No DB / React (unit-testable in /tmp).
//
// A rule's `predicate` is an object with any of these axes; a rule matches an
// expense only when EVERY specified axis matches (AND semantics). A predicate
// with no axes never matches (so an empty rule can't tag everything).
//   merchant_contains : case-insensitive substring of expense.merchant
//   notes_contains    : case-insensitive substring of expense.notes
//   category_id       : exact expense.category_id
//   payment_method    : exact expense.payment_method
//   amount_min        : expense.amount >= amount_min
//   amount_max        : expense.amount <= amount_max

const has = (v) => v !== undefined && v !== null && v !== '';

export function matchesPredicate(predicate, exp) {
  if (!predicate || typeof predicate !== 'object' || !exp) return false;
  let constrained = false;

  if (has(predicate.merchant_contains)) {
    constrained = true;
    if (!String(exp.merchant || '').toLowerCase().includes(String(predicate.merchant_contains).toLowerCase())) return false;
  }
  if (has(predicate.notes_contains)) {
    constrained = true;
    if (!String(exp.notes || '').toLowerCase().includes(String(predicate.notes_contains).toLowerCase())) return false;
  }
  if (has(predicate.category_id)) {
    constrained = true;
    if (Number(exp.category_id) !== Number(predicate.category_id)) return false;
  }
  if (has(predicate.payment_method)) {
    constrained = true;
    if (String(exp.payment_method || '') !== String(predicate.payment_method)) return false;
  }
  if (has(predicate.amount_min)) {
    constrained = true;
    if (!(Number(exp.amount) >= Number(predicate.amount_min))) return false;
  }
  if (has(predicate.amount_max)) {
    constrained = true;
    if (!(Number(exp.amount) <= Number(predicate.amount_max))) return false;
  }
  return constrained;
}

// De-duplicated tag ids whose (enabled) rule matches the expense.
export function autoTagIdsFor(rules, exp) {
  const out = [];
  for (const r of rules || []) {
    if (r.enabled === 0) continue;
    if (matchesPredicate(r.predicate, exp)) out.push(r.tag_id);
  }
  return Array.from(new Set(out));
}

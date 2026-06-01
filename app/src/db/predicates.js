// Soft-delete predicate constants. Spliced into every list query that reads
// a soft-deletable table (expenses, receipt_items, categories, accounts,
// subscriptions, goals — v2 added `deleted_at TEXT` to all six; trips picked
// it up in v25, saved_filters in v21, merchant_aliases in v24).
//
// Use NOT_DELETED for unqualified queries, NOT_DELETED_E for queries that
// alias expenses as `e`, NOT_DELETED_R for receipt_items as `r`, etc.
// Add a new qualifier here when a new alias enters the codebase rather than
// inlining the predicate at the call site.
//
// 2.D.09 — every `remove(id)` repo method now soft-deletes (UPDATE … SET
// deleted_at = datetime('now')) and pairs with a `restore(id)` (UPDATE …
// SET deleted_at = NULL). The Undo snackbar consumes restore. The v12 AU
// triggers on expenses + receipt_items reconcile monthly_summary,
// item_summary, expense_fts, and item_fts on either flip direction.
export const NOT_DELETED   = 'deleted_at IS NULL';
export const NOT_DELETED_E = 'e.deleted_at IS NULL';
export const NOT_DELETED_R = 'r.deleted_at IS NULL';
export const NOT_DELETED_C = 'c.deleted_at IS NULL';
export const NOT_DELETED_T = 't.deleted_at IS NULL';

// PS-30 — pending (auto-created, not-yet-confirmed) expenses live in the
// `expenses` table with `is_pending = 1` and must be hidden from the visible
// feed + raw-expenses analytics until confirmed. The v54 triggers already keep
// them out of the rollups/FTS; these predicates cover the hand-written raw
// reads. `buildWhere()` adds the same clause for the filtered list/search path.
export const NOT_PENDING   = 'is_pending = 0';
export const NOT_PENDING_E = 'e.is_pending = 0';

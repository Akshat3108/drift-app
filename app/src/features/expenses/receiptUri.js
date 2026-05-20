// 5.15 — Reader-side selection for the receipt image URIs on an expense row.
//
// Three columns can carry the image source today:
//   receipt_path  — permanent, written by Scan since 5.12 + by lazy-migrate
//   receipt_thumb — permanent 320px JPEG, paired with receipt_path
//   receipt_uri   — the original cache-resident path, v1 column, volatile
//
// pickReceiptUri prefers the permanent columns and falls back to the legacy
// cache URI so legacy rows still render until the lazy-migrate (also 5.15)
// catches them on first viewer open. needsMigration is true for the exact
// shape lazy-migrate has to act on: legacy-only, no permanent path.

export function pickReceiptUri(e) {
  if (!e) return { full: null, thumb: null };
  const full = e.receipt_path || e.receipt_uri || null;
  const thumb = e.receipt_thumb || e.receipt_path || e.receipt_uri || null;
  return { full, thumb };
}

export function hasReceipt(e) {
  if (!e) return false;
  return !!(e.receipt_path || e.receipt_uri);
}

export function needsMigration(e) {
  if (!e) return false;
  return !!e.receipt_uri && !e.receipt_path;
}

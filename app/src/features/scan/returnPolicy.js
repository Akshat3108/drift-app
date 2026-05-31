// PS-39 — default return-window resolver. Pure: maps a scanned merchant string
// to a return-by date by looking it up in the bundled returnPolicies.json. Used
// by the Scan save path to stamp receipt_items.return_by_date. Heuristic only —
// the windows are seller-/category-dependent in reality, so a stamp here is a
// best-effort default the user can override.

import policies from './returnPolicies.json';
import { lightNormMerchant } from '@core/utils/strings';

// Keys sorted longest-first so a more specific match ("nykaa fashion") wins
// over a prefix ("nykaa"). Computed once at module load. `_meta` is skipped.
const ENTRIES = Object.keys(policies)
  .filter((k) => k !== '_meta')
  .sort((a, b) => b.length - a.length)
  .map((k) => ({ key: k, days: policies[k].days, display: policies[k].display }));

// Whole-word-sequence match: pad both sides with spaces so "amazon" matches
// "amazon pay later" but not "amazonia". Returns the matched policy or null.
export function lookupReturnPolicy(merchant) {
  const norm = lightNormMerchant(merchant);
  if (!norm) return null;
  const hay = ` ${norm} `;
  for (const e of ENTRIES) {
    if (hay.includes(` ${e.key} `)) return e;
  }
  return null;
}

// Adds `days` whole days to a YYYY-MM-DD purchase date and returns YYYY-MM-DD.
// Date-only arithmetic in local time; bad input falls back to today.
function addDaysISO(purchaseDate, days) {
  const base = /^\d{4}-\d{2}-\d{2}/.test(purchaseDate || '')
    ? new Date(`${purchaseDate.slice(0, 10)}T00:00:00`)
    : new Date();
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The one entry point Scan uses: merchant + purchase date → return-by date, or
// null when the merchant isn't in the policy map.
export function returnByDateFor(merchant, purchaseDate) {
  const hit = lookupReturnPolicy(merchant);
  if (!hit) return null;
  return addDaysISO(purchaseDate, hit.days);
}

import { lightNormMerchant } from '@core/utils/strings';

// Receipt fingerprints used to detect duplicates pre-save. Two hashes:
//
//   hard (fingerprintReceipt)
//     Stable identity built from merchant + date + total + item count + the
//     sorted item-price tuple. Catches: exact re-scans of the same bill,
//     re-scans after a quick OCR retake, double-tap saves.
//
//   soft (softFingerprint)
//     Looser identity: merchant + total rounded to the rupee. Catches:
//     near-identical bills where OCR jitter moved the total by a paisa or
//     the date drifted by a day. Used together with a ±1-day query
//     predicate in the repo so legitimate same-day repeats at the same
//     merchant (lunch + dinner at the same café) still pass through.
//
// Both hashes are stored on the expenses row alongside the OCR result
// (columns added in migration v7) so the lookup is a plain index scan.
// We use a djb2 32-bit string hash rather than a crypto hash — cheap,
// deterministic, plenty of collision room for a single user's lifetime
// scan history, and human-debuggable in `expo-sqlite` query inspectors.

function djb2(str) {
  let h = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  // Stringify as unsigned 32-bit hex.
  return (h >>> 0).toString(16).padStart(8, '0');
}

function canonicalMerchant(parsed) {
  return lightNormMerchant(parsed?.merchant || '');
}

function priceTupleString(items) {
  if (!items?.length) return '';
  return items
    .map(it => Number(it?.price || 0).toFixed(2))
    .sort()
    .join(',');
}

export function fingerprintReceipt(parsed) {
  const merchant = canonicalMerchant(parsed);
  const date = parsed?.date || '';
  const total = Number(parsed?.total || 0).toFixed(2);
  const items = parsed?.items || [];
  const payload = [merchant, date, total, items.length, priceTupleString(items)].join('|');
  return djb2(payload);
}

export function softFingerprint(parsed) {
  const merchant = canonicalMerchant(parsed);
  const total = Math.round(Number(parsed?.total || 0));
  return djb2(`${merchant}|${total}`);
}

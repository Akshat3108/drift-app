// String-similarity utilities. Currently only Jaro-Winkler + a light
// merchant-name normaliser, both used by features/expenses/merchants.repo
// for resolving an OCR'd merchant string against the merchants table.
//
// Kept pure (no React, no DB) so /tmp validators can import directly.
// PS-18 — TypeScript pilot.

// Jaro-Winkler similarity in [0, 1]. Standard algorithm:
//   1. Find matching characters within a window of floor(max(|a|,|b|)/2) - 1.
//   2. Count transpositions among matched pairs.
//   3. Jaro = (m/|a| + m/|b| + (m-t/2)/m) / 3.
//   4. Winkler boost: add p * L * (1 - Jaro) where L = common prefix length
//      capped at 4 and p = 0.1.
//
// Returns 0 when either input is empty (matches the conventional definition).
export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aLen = a.length;
  const bLen = b.length;
  const matchWindow = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);

  const aMatches: boolean[] = new Array(aLen).fill(false);
  const bMatches: boolean[] = new Array(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(bLen, i + matchWindow + 1);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / aLen + m / bLen + (m - transpositions / 2) / m) / 3;

  let prefix = 0;
  const maxPrefix = Math.min(4, aLen, bLen);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;

  return jaro + prefix * 0.1 * (1 - jaro);
}

// Light merchant-name normaliser for similarity comparison. Lowercases,
// trims, collapses internal whitespace, strips trailing company suffixes
// ("pvt ltd", "private limited", "llp", "inc", "co"). Aggressive enough to
// merge "Starbucks Pvt Ltd" with "Starbucks" but NOT aggressive enough to
// strip branch identifiers ("Starbucks MG Road" stays distinct from
// "Starbucks Indiranagar").
const COMPANY_SUFFIX_RE = /\s+(?:pvt\.?\s*ltd\.?|private\s+limited|llp|inc\.?|co\.?)\s*$/i;

export function lightNormMerchant(name: string | null | undefined): string {
  if (!name) return '';
  let s = String(name).toLowerCase().trim().replace(/\s+/g, ' ');
  // Run the suffix strip up to twice to catch "starbucks pvt ltd co".
  for (let i = 0; i < 2; i++) {
    const next = s.replace(COMPANY_SUFFIX_RE, '');
    if (next === s) break;
    s = next.trim();
  }
  return s;
}

// Two-stage canonicaliser run by normalizeName() before singularisation.
// Stage 1: lookup the Devanagari/Hindi-script form against hindi_product_map.
// Stage 2: lookup the resulting Latin form against product_synonyms.
//
// Both maps are flat `{ input → canonical }` JSON; chained mappings work
// because we run stage 1 then stage 2. Identity fallback when neither map
// has an entry — the input passes through unchanged.
//
// Inputs are NFC-normalised to match the JSON keys. Whole-string matches
// only; partial-word substitution would mis-canonicalise compound names
// ("Amul Doodh 1L" must not become "Amul milk" via substring replace —
// brand context belongs to merchant resolution, not item canonicalisation).

import HINDI_MAP from './hindi_product_map.json';
import SYNONYMS from './product_synonyms.json';

export function canonicalizeName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const nfc = s.normalize('NFC');
  // Hindi map keys are Devanagari; check exact whole-string then lowercased.
  const fromHindi = HINDI_MAP[nfc] ?? HINDI_MAP[nfc.toLowerCase()];
  const stage1 = fromHindi ?? nfc;
  const stage1Lower = stage1.toLowerCase();
  const fromSyn = SYNONYMS[stage1Lower];
  return fromSyn ?? stage1Lower;
}

import { parseUnitToken } from './units';
import { canonicalizeName } from './synonyms';

const PLURALS = [
  [/ies\b/, 'y'],
  [/oes\b/, 'o'],
  [/ses\b/, 's'],
  [/s\b/, ''],
];

const NUM_LEAD_RE = /^\s*\d+(?:[.,]\d+)?\s*(?:[x×]\s*)?/i;
const SKU_RE      = /^\s*\d{4,}\s+/;
const HSN_TAIL_RE = /\s*(?:HSN|SAC)[:\s]*\d{4,8}\s*$/i;

const TRAIL_MUL_RE = /\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*$/i;
const LEAD_MUL_RE  = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s+/i;
const PORTION_LEAD_RE = /^\s*(half|full|quarter|regular|reg\.?|small|medium|large|sml|med|lrg)\s+/i;

function singularise(word) {
  if (word.length < 4) return word;
  for (const [re, sub] of PLURALS) {
    if (re.test(word)) return word.replace(re, sub);
  }
  return word;
}

// Parse an OCR'd item-name fragment into structured fields. The input has
// already been stripped of the price by the caller.
//
// Returns:
//   display_name      — original-case cleaned text (qty/multipliers removed)
//   normalized_name   — lowercase, singularised, used for indexing
//   qty               — numeric quantity (already includes any "× N" multiplier)
//   unit              — canonical unit ('pcs', 'kg', 'g', 'L', 'mL', 'pack', 'dozen')
export function normalizeName(raw) {
  let s = String(raw || '').trim();
  if (!s) return { display_name: '', normalized_name: '', qty: 1, unit: 'pcs' };

  // NFC so composed vs decomposed forms (café vs cafe + combining acute,
  // प्र vs प + ् + र) collapse to a single normalized representation.
  s = s.normalize('NFC');

  s = s.replace(HSN_TAIL_RE, '').trim();

  let qty = 1;
  let unit = 'pcs';
  let unitFound = false;

  // Step 1: primary unit token, e.g. "440 ml", "1 ltr", "500 g", "2 kg".
  // Skip when the unit token appears AFTER a "N x" prefix with a product name
  // between them — that's a packaging spec ("1 x Coca Cola 475ml" = 1 piece,
  // not 475 mL), not the unit count. We still strip it from the display name
  // when the leadMul claims qty.
  const tok = parseUnitToken(s);
  const leadMulEarly = s.match(LEAD_MUL_RE);
  const unitTokenIsPackagingSpec =
    !!(tok && leadMulEarly && (tok.index - leadMulEarly[0].length) > 3);
  if (tok && !unitTokenIsPackagingSpec) {
    qty = tok.qty;
    unit = tok.unit;
    unitFound = true;
    s = (s.slice(0, tok.index) + s.slice(tok.index + tok.match.length)).trim();
  }

  // Step 2: explicit multiplier, e.g. "x 2" trailing or "2 x" leading.
  let multiplier = 1;
  const trailMul = s.match(TRAIL_MUL_RE);
  const leadMul  = s.match(LEAD_MUL_RE);
  if (trailMul) {
    const n = parseFloat(trailMul[1].replace(',', '.'));
    if (n > 0 && n < 1000) {
      multiplier = n;
      s = s.slice(0, trailMul.index).trim();
    }
  } else if (leadMul) {
    const n = parseFloat(leadMul[1].replace(',', '.'));
    if (n > 0 && n < 1000) {
      multiplier = n;
      s = s.slice(leadMul[0].length).trim();
    }
  }
  if (multiplier !== 1) {
    if (unitFound) qty = qty * multiplier;
    else { qty = multiplier; unit = 'pcs'; }
  } else if (unitTokenIsPackagingSpec && leadMul) {
    // "1 x Coca Cola 475ml": leadMul=1, packaging-spec stays in name.
    qty = 1; unit = 'pcs';
  }

  // Step 3: portion words (restaurant menus).
  if (!unitFound) {
    const portion = s.match(PORTION_LEAD_RE);
    if (portion) {
      const w = portion[1].toLowerCase();
      if (w === 'half') qty = 0.5;
      else if (w === 'quarter') qty = 0.25;
      // 'full', 'regular', 'small/medium/large' all stay at qty=1 — they
      // describe size, not quantity. We strip the word from the name.
      s = s.slice(portion[0].length).trim();
    }
  }

  // Step 4: strip leading SKU codes and stray leading numbers.
  s = s.replace(SKU_RE, '').replace(NUM_LEAD_RE, '').trim();

  // Display name = cleaned but original case.
  const display_name = s.replace(/\s+/g, ' ').trim();

  // Canonicalise via synonym maps BEFORE singularising. Whole-string lookup
  // first (Devanagari → English, Hinglish → English staples) so "दूध" /
  // "Doodh" / "Milk" all collapse to one normalized_name. Identity fallback
  // when no entry matches — pipeline continues with the cleaned text.
  const canonical = canonicalizeName(display_name);
  if (canonical && canonical !== display_name.toLowerCase()) {
    return { display_name, normalized_name: canonical, qty, unit };
  }

  // Normalized name = lowercase, letters+digits in any script, singularised for indexing.
  // \p{L}=any-script letter, \p{N}=any-script number; preserves Devanagari, Tamil, accented Latin.
  const lower = display_name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = lower.split(' ').filter(Boolean).map(singularise);
  const normalized_name = words.join(' ');

  return { display_name, normalized_name, qty, unit };
}

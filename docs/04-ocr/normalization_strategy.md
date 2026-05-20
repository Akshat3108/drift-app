# Normalization Strategy — Drift OCR

This document covers the complete recommended approach to item name normalization, merchant normalization, price normalization, quantity extraction, and the offline NLP approaches suitable for on-device use.

---

## Why Normalization Matters for This App

The core value of Drift's item tracking is **cross-receipt price comparison over time**. This requires that "Amul Butter 100g" bought at DMart in January and "AMUL BUTTER 100GM" bought at Blinkit in March resolve to the **same normalized key** in the database. Without consistent normalization:
- Price history is fragmented across dozens of variants of the same product
- Inflation analysis is unreliable
- Consumption tracking misses purchases

---

## Current State

`normalizeName.js` pipeline:
```
raw string
  → strip HSN tail
  → parseUnitToken (qty + unit)
  → trailing/leading multiplier
  → portion words
  → strip leading SKU
  → strip leading stray numbers
  → display_name (original case)
  → lowercase + replace(/[^a-z\s]/g, ' ') + singularize
  → normalized_name
```

**Critical gap:** `[^a-z\s]` replaces all non-ASCII characters with spaces. This means:
- All Devanagari product names → empty string
- Brand names with accents (Nestlé) → truncated
- Numeric brand components (7UP, 5-Star, 100Plus) → stripped

---

## Recommended Normalization Pipeline

### Phase 1 — Script Detection and Transliteration

```js
// Detect dominant script of input
function detectScript(text) {
  const devanagari = (text.match(/[ऀ-ॿ]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const tamil = (text.match(/[஀-௿]/g) || []).length;
  const telugu = (text.match(/[ఀ-౿]/g) || []).length;
  const scores = { devanagari, latin, tamil, telugu };
  return Object.entries(scores).sort((a,b) => b[1]-a[1])[0][0];
}

// For Devanagari: transliterate to Latin using offline table
// A bundled ~50KB lookup JSON is sufficient for common product words
const DEVANAGARI_TO_LATIN = {
  'दूध': 'milk',
  'आटा': 'atta wheat flour',
  'टमाटर': 'tomato',
  'प्याज': 'onion',
  'आलू': 'potato',
  'चीनी': 'sugar',
  'नमक': 'salt',
  'तेल': 'oil',
  'घी': 'ghee',
  // ... ~500 common product words
};
```

**Implementation approach**: bundle a `hindi_product_map.json` (~50KB) in assets. Devanagari product names are either fully in the map (common household items) or transliterated character-by-character using a Devanagari→Latin table (handles brand names in Hindi script).

---

### Phase 2 — Pre-normalization Cleaning

```js
function preclean(raw) {
  let s = String(raw || '').trim();

  // 1. Unicode normalization (NFC: composed forms)
  s = s.normalize('NFC');

  // 2. Strip control characters and non-printable chars
  s = s.replace(/[\x00-\x1F\x7F]/g, ' ');

  // 3. Normalize whitespace
  s = s.replace(/\s+/g, ' ');

  // 4. Strip common OCR artifacts at start/end
  //    e.g., stray "|", ":", ".", leading barcode fragments
  s = s.replace(/^[\|:.\-*]+\s*/, '');
  s = s.replace(/\s*[\|:.\-*]+$/, '');

  // 5. Normalize commonly confused OCR characters in product context
  //    Only in numeric contexts — don't replace O→0 in names
  s = s.replace(/\b([0-9]+)[lI]([0-9])\b/g, '$10$2'); // "l" or "I" between digits → 0
  s = s.replace(/\b([0-9]+)[oO]([0-9])\b/g, '$100$2'); // "O" between digits → 0

  return s.trim();
}
```

---

### Phase 3 — Unit and Quantity Extraction (Enhanced)

Current `parseUnitToken()` is solid. Enhancements:

```js
// Multi-token unit patterns missed by the current single-token approach:
const MULTI_UNIT_PATTERNS = [
  // "2 x 500g" → qty=2, unit=pcs, sub_qty=500, sub_unit=g
  /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|oz|L|mL|pcs?|pack|dozen)/i,
  // "500g × 2 pack" → total_canonical_qty = 2 * 0.5kg = 1kg
  /(\d+(?:[.,]\d+)?)\s*(kg|g|lb|oz|L|mL)\s*[x×*]\s*(\d+)/i,
  // "1L × 6" → 6 pcs of 1L each
  /(\d+(?:[.,]\d+)?)\s*(kg|g|lb|oz|L|mL|pcs?)\s*[x×*]\s*(\d+)/i,
];

// Portion fractions not in current code:
const FRACTION_WORDS = {
  'half': 0.5, 'quarter': 0.25, 'third': 0.333,
  'double': 2, 'triple': 3,
};

// Decimal-tolerant qty derivation (fixes W14):
function deriveQtyFromRate(price, rate) {
  if (rate <= 0) return null;
  const derived = price / rate;
  // Check common fractions: 0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 2.5, etc.
  const COMMON = [0.25, 0.33, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 10, 12];
  for (const c of COMMON) {
    if (Math.abs(derived - c) / c < 0.05) return c;
  }
  // Integer check (existing)
  if (derived > 0.5 && derived < 200 && Math.abs(derived - Math.round(derived)) < 0.05) {
    return Math.round(derived);
  }
  return null;
}
```

---

### Phase 4 — Name Cleaning (Unicode-Safe)

Replace the current ASCII-only normalization with Unicode-aware processing:

```js
function normalizeName_v2(raw) {
  let s = preclean(raw);

  // Try Hindi/regional lookup first
  const hindiMatch = HINDI_PRODUCT_MAP[s.toLowerCase()];
  if (hindiMatch) {
    s = hindiMatch; // Replace with English equivalent
  }

  // ... existing steps (unit extraction, multiplier, portion words) ...

  // Step 8 (FIXED): Unicode-aware lowercasing and normalization
  // Allow Unicode letters (covers Devanagari, Tamil etc. after transliteration)
  const lower = display_name.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // keep Unicode letters AND digits
    .replace(/\s+/g, ' ')
    .trim();

  // Singularize English words only (other scripts: keep as-is)
  const words = lower.split(' ').filter(Boolean).map(w =>
    /^[a-z]+$/.test(w) ? singularise(w) : w
  );

  const normalized_name = words.join(' ');
  return { display_name, normalized_name, qty, unit };
}
```

---

### Phase 5 — Product Synonym Resolution

A bundled offline synonym dictionary resolves regional and colloquial product names to their standard English form:

```js
// product_synonyms.json (bundled, ~80KB)
const SYNONYMS = {
  // Hindi/Hinglish common produce names
  'tamatar': 'tomato',
  'pyaaz': 'onion', 'piaz': 'onion',
  'aloo': 'potato', 'alu': 'potato',
  'palak': 'spinach',
  'methi': 'fenugreek',
  'dhaniya': 'coriander',
  'adrak': 'ginger',
  'lahsun': 'garlic',
  'mirch': 'chilli',
  'shimla mirch': 'capsicum',
  'karela': 'bitter gourd',
  'lauki': 'bottle gourd',
  'turai': 'ridge gourd',
  'tinda': 'tinda gourd',
  'kela': 'banana',
  'aam': 'mango',
  'seb': 'apple',
  'angoor': 'grape',
  'mosambi': 'sweet lime',
  'anar': 'pomegranate',
  'amrud': 'guava',
  'nashpati': 'pear',
  // Dairy
  'doodh': 'milk',
  'makhan': 'butter',
  'dahi': 'yogurt curd',
  'paneer': 'paneer cottage cheese',
  'malai': 'cream',
  'ghee': 'ghee clarified butter',
  'makkhan': 'butter',
  // Grains/staples
  'atta': 'wheat flour',
  'maida': 'refined flour',
  'chawal': 'rice',
  'dal': 'lentil',
  'besan': 'chickpea flour',
  'sooji': 'semolina',
  'rava': 'semolina',
  'poha': 'flattened rice',
  'chura': 'flattened rice',
  'namak': 'salt',
  'cheeni': 'sugar',
  'shakkar': 'jaggery',
  'gur': 'jaggery',
  'tel': 'oil',
  'sarso': 'mustard',
  // Common colloquials
  'bisleri': 'mineral water',
  'kinley': 'mineral water',
  'aquafina': 'mineral water',
  // South Indian
  'keerai': 'spinach greens',
  'vengayam': 'onion',
  'thakkali': 'tomato',
  'urulaikizhangu': 'potato',
  'vellaipoondu': 'garlic',
  'inji': 'ginger',
  'kothamalli': 'coriander',
};

function applySynonyms(normalized_name) {
  // Exact match first
  if (SYNONYMS[normalized_name]) return SYNONYMS[normalized_name];
  // Word-by-word match for compound names
  const words = normalized_name.split(' ');
  return words.map(w => SYNONYMS[w] || w).join(' ');
}
```

---

### Phase 6 — Brand Name Preservation

Some normalizations should **not** singularize or strip numbers:

```js
const BRAND_PRESERVED = new Set([
  '7up', '7-up', '5star', '5-star', '100plus', '3roses',
  'v-guard', 'e-lite', 'co-op',
]);

function singulariseSafe(word) {
  if (BRAND_PRESERVED.has(word.toLowerCase())) return word;
  return singularise(word);
}
```

---

### Phase 7 — Fuzzy Produce Classification

Replace `PRODUCE.has(normalized_name)` with a tiered lookup:

```js
function classifyKind(normalized_name) {
  // Tier 1: Exact Set lookup (fast path, existing)
  if (PRODUCE.has(normalized_name)) return 'produce';

  // Tier 2: Word-level match (any word in name is a produce word)
  const words = normalized_name.split(' ');
  if (words.some(w => PRODUCE.has(w))) return 'produce';

  // Tier 3: Trigram similarity against produce list
  const best = findBestTrigram(normalized_name, [...PRODUCE]);
  if (best.score >= 0.75) return 'produce';

  // Tier 4: Kind dictionary lookup
  if (DAIRY_TERMS.has(normalized_name)) return 'dairy';
  if (MEAT_TERMS.has(normalized_name)) return 'meat';
  if (BAKERY_TERMS.has(normalized_name)) return 'bakery';
  if (BEVERAGE_TERMS.has(normalized_name)) return 'beverage';

  return 'grocery';
}

// Offline trigram similarity (pure JS, no dependencies)
function trigramSimilarity(a, b) {
  const trigramsA = new Set(Array.from({length: a.length-2}, (_, i) => a.slice(i, i+3)));
  const trigramsB = new Set(Array.from({length: b.length-2}, (_, i) => b.slice(i, i+3)));
  const intersection = [...trigramsA].filter(t => trigramsB.has(t)).length;
  return (2 * intersection) / (trigramsA.size + trigramsB.size);
}

function findBestTrigram(query, candidates) {
  let best = { candidate: null, score: 0 };
  for (const c of candidates) {
    const score = trigramSimilarity(query, c);
    if (score > best.score) best = { candidate: c, score };
  }
  return best;
}
```

---

## Merchant Normalization

### Current Problem

The `matchBrand()` function returns a canonical brand name only when the receipt text explicitly contains the brand's keyword. For unrecognized merchants, the raw OCR text becomes the merchant name.

### Recommended Approach

```js
async function normalizeMerchant(rawText, gstin) {
  // Step 1: Brand registry (exact match, current)
  const brand = matchBrand(rawText);
  if (brand) return brand;

  // Step 2: GSTIN lookup
  if (gstin) {
    const cached = await db.one('SELECT display_name FROM merchants WHERE gstin = ?', [gstin]);
    if (cached) return cached.display_name;
  }

  // Step 3: Jaro-Winkler similarity against known merchants table
  const cleanedRaw = rawText
    .replace(/\(.*?\)/g, '')           // remove parenthetical addresses
    .replace(/\b(pvt\.?|ltd\.?|inc\.?|llp)\b/gi, '')
    .replace(/[-_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  const candidates = await db.all('SELECT id, canonical_name FROM merchants WHERE deleted_at IS NULL');
  let best = { id: null, name: cleanedRaw, score: 0 };
  for (const c of candidates) {
    const score = jaroWinkler(cleanedRaw.toLowerCase(), c.canonical_name.toLowerCase());
    if (score > best.score && score > 0.88) {
      best = { id: c.id, name: c.canonical_name, score };
    }
  }

  if (best.id) return best.name;

  // Step 4: Return cleaned raw text as new merchant candidate
  return cleanedRaw || 'Unknown store';
}
```

### Jaro-Winkler (pure JS, offline)

```js
// ~40 lines, no dependencies — suitable for on-device merchant matching
function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0, transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = (matches/len1 + matches/len2 + (matches - transpositions/2)/matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] !== s2[i]) break;
    prefix++;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}
```

---

## Price Normalization

### OCR Digit Confusion Correction

Common OCR misreads in numeric strings:

| OCR reads | Could be | Context clue |
|---|---|---|
| `1,74.00` | `174.00` | Extra comma in 3-digit number |
| `₹8.00` | `₹80.00` or `₹800.00` | Compare with item sum |
| `₹1O.00` | `₹10.00` | Letter O in numeric position |
| `₹1748` | `₹1,748` | Missing thousands separator |
| `₹17 4.00` | `₹174.00` | Space inserted by OCR in number |

```js
function sanitizeAmountString(raw) {
  let s = String(raw || '');
  // Remove letter O/l/I surrounded by digits
  s = s.replace(/(\d)[oOlI](\d)/g, '$10$2');
  // Remove spaces within a number: "17 4.00" → "174.00"
  s = s.replace(/(\d)\s+(\d)/g, '$1$2');
  // Normalize multiple decimal points → keep last
  const parts = s.split('.');
  if (parts.length > 2) s = parts.slice(0, -1).join('') + '.' + parts[parts.length-1];
  return s;
}
```

### Multi-Amount Line Resolution

When a line has multiple amounts (e.g. `MRP ₹210  Discount ₹42  Net ₹168`):

```js
function resolveLinePrice(amounts, format) {
  if (amounts.length === 1) return amounts[0].value;
  if (amounts.length === 2) {
    // Pattern A: MRP, Net → take net (lower value if both positive)
    const [a, b] = amounts.map(x => x.value);
    if (a > b && b > 0) return b;  // net is smaller
    return amounts[amounts.length - 1].value;  // rightmost = net
  }
  if (amounts.length >= 3) {
    // Pattern B: Qty, Rate, Total → last is total
    // Validate: amounts[0] * amounts[1] ≈ amounts[2]
    const [qty, rate, total] = amounts.map(x => x.value);
    if (Math.abs(qty * rate - total) / total < 0.05) return total;
    return amounts[amounts.length - 1].value;
  }
  return amounts[amounts.length - 1].value;
}
```

---

## SKIP_RE Over-Matching Fix

The current `SKIP_RE` union catches product names that happen to contain keywords. The fix is to require the keyword to appear **before** the price, not within a product name context:

```js
// New: classify only when keyword is at START of line or before the price position
function classifyRowSafe(text, priceIndex) {
  // Only check the portion of the text BEFORE the price
  const prePrice = priceIndex != null ? text.slice(0, priceIndex) : text;
  if (BILL_HDR_RE.test(prePrice)) return 'bill_header';
  if (SUBTOTAL_RE.test(prePrice)) return 'subtotal';
  if (DISCOUNT_RE.test(prePrice)) return 'discount';
  if (TOTAL_RE.test(prePrice)) return 'total';
  if (TAX_RE.test(prePrice)) return 'tax';
  if (FEE_RE.test(prePrice)) return 'fee';
  if (META_RE.test(prePrice)) return 'meta';
  return 'item';
}

// Additionally: item names matching keywords require the keyword to be
// the dominant content (not just a sub-word)
// "Total Care Soap" → keyword "total" is at position 0 but is part of a brand name
// Heuristic: if the line has an amount token, it's likely an item regardless of keyword
function classifyRowWithContext(text) {
  const amounts = matchAmounts(text);
  if (amounts.length > 0) {
    // Has a price token → likely an item. Only classify as non-item if the
    // keyword is at the START and there are no alphabetic words after it.
    const priceIdx = amounts[0].start;
    const cls = classifyRowSafe(text, priceIdx);
    if (cls !== 'item') {
      // Double-check: if the pre-price text is longer than 30 chars and has
      // multiple words, it's probably a product name with an incidental keyword
      const prePrice = text.slice(0, priceIdx).trim();
      const wordCount = prePrice.split(/\s+/).length;
      if (wordCount >= 3 && prePrice.length > 20) return 'item';
    }
    return cls;
  }
  return classifyRowSafe(text, null);
}
```

---

## GST Rate Extraction Per Item

For Indian tax invoices, extract CGST and SGST rates per line:

```js
// Patterns found on Indian receipts
const CGST_RATE_RE  = /\bCGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;
const SGST_RATE_RE  = /\bSGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;
const IGST_RATE_RE  = /\bIGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;
const GST_RATE_RE   = /\bGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;

// Standard Indian GST slabs
const GST_SLABS = [0, 5, 12, 18, 28];

function extractGSTRates(rowText) {
  const cgst = rowText.match(CGST_RATE_RE)?.[1];
  const sgst = rowText.match(SGST_RATE_RE)?.[1];
  const igst = rowText.match(IGST_RATE_RE)?.[1];
  const gst  = rowText.match(GST_RATE_RE)?.[1];

  if (cgst && sgst) {
    const total_rate = parseFloat(cgst) + parseFloat(sgst);
    // Validate against known GST slabs
    const valid = GST_SLABS.includes(Math.round(total_rate));
    return { cgst_rate: parseFloat(cgst)/100, sgst_rate: parseFloat(sgst)/100, valid };
  }
  if (igst) {
    return { igst_rate: parseFloat(igst)/100, valid: GST_SLABS.includes(Math.round(parseFloat(igst))) };
  }
  if (gst) {
    const r = parseFloat(gst) / 2; // assume CGST = SGST = total/2
    return { cgst_rate: r/100, sgst_rate: r/100, valid: GST_SLABS.includes(Math.round(parseFloat(gst))) };
  }
  return null;
}
```

---

## Offline NLP Approaches

### What's Feasible On-Device

| Approach | Size | Latency | Use case |
|---|---|---|---|
| Regex pipelines (current) | ~0KB | <1ms | Known patterns (dates, amounts, keywords) |
| Trie / prefix tree lookups | 50–200KB | <1ms | Merchant names, product synonyms |
| Trigram similarity | 0KB runtime | 1–5ms | Fuzzy name matching |
| Jaro-Winkler | 0KB | <1ms | Merchant dedup |
| n-gram language model (small) | 2–5MB | 5–20ms | Spell correction for product names |
| Keyword embeddings (FastText lite) | 10–30MB | 50–200ms | Semantic similarity for product categorization |
| Full transformer (MobileBERT) | 25–100MB | 200–1000ms | Named entity recognition |

### Recommended Offline NLP Stack

**For Phase 1 (now → 6 months):** Regex + Trie + Trigram + Jaro-Winkler. Zero additional dependencies. Covers merchant dedup, produce classification, synonym resolution. Total bundle size addition: <500KB of data assets.

**For Phase 2 (6–18 months):** FastText lite with a custom receipt-domain model fine-tuned on Indian grocery receipts. The model is trained offline and bundled as a 10–15MB ONNX file. Provides semantic similarity for product categorization without rule lists.

**Do not attempt on-device (yet):** Full NER with transformer models. The latency (200ms–1s) and model size (25–100MB) are unacceptable for a receipt scanning flow that should feel instantaneous.

---

## Duplicate Receipt Detection

```js
// Fingerprint: stable hash of receipt identity
function fingerprintReceipt(parsed) {
  const items_sorted = [...(parsed.items || [])]
    .map(i => `${i.normalized_name}:${i.price.toFixed(2)}`)
    .sort()
    .join('|');
  const canonical = [
    parsed.merchant?.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 30),
    parsed.date,
    parsed.total?.toFixed(2),
    items_sorted,
  ].join('||');
  return hashFNV1a(canonical);  // fast 32-bit hash, no crypto dependency
}

// FNV-1a: fast, deterministic, no external library
function hashFNV1a(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}

// Soft fingerprint: tolerates minor OCR variation
function softFingerprint(parsed) {
  return [
    parsed.merchant?.slice(0, 15).toLowerCase().replace(/[^a-z]/g, ''),
    parsed.date,
    Math.round((parsed.total || 0) / 5) * 5,  // round to nearest 5
  ].join(':');
}
```

Store both `receipt_hash` (exact) and `receipt_soft_hash` (fuzzy) on the `expenses` table. Before saving, check:
1. Exact hash match → "This exact receipt was already scanned"
2. Soft hash match → "A similar receipt from the same date and store exists — duplicate?"

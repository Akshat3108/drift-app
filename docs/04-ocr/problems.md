# OCR Pipeline Problems — Drift

This document catalogs all weaknesses, accuracy bottlenecks, and architectural gaps in the current pipeline. Issues are grouped by layer.

---

## Layer 1 — Image Capture

### W1 — No Image Preprocessing

**Current state:** The raw camera URI is passed directly to ML Kit with no preprocessing.

**Impact:** Every image quality problem is passed upstream to the OCR engine, which has no per-image tuning knobs.

Known failure modes:
- **Low contrast** — thermal receipt paper fades with age. Faded receipts look like light gray text on white background. ML Kit's internal binarization often misses characters entirely.
- **Perspective distortion** — receipts photographed at 20-30° angle produce trapezoidal text that ML Kit's block detection struggles with. Lines merge or split incorrectly.
- **Motion blur** — handheld capture without stabilization. Characters in long numeric strings get smeared.
- **Glare / specular reflection** — glossy paper (pharmacies, online retail printouts) has hot spots that obliterate characters.
- **Crumpled receipts** — wrinkles create local shadow patterns that the binarizer reads as ink.
- **Long receipts cropped** — a restaurant bill photographed in portrait mode cuts off the bottom (grand total). User must then manually enter total.

**JPEG quality 0.8:** For fine-print items (unit prices, HSN codes, lot numbers), 80% JPEG introduces block artifacts that corrupt characters. Pharmacy receipts with 8pt font are particularly vulnerable.

---

### W2 — No Perspective / Skew Correction

**Current state:** None. Raw image fed to ML Kit.

**Impact:** Text at > 15° skew produces misordered bounding boxes. `mergeIntoRows()` uses y-coordinate overlap — if lines are rotated, their y-positions overlap across multiple logical rows. This causes item names from one row to merge with prices from another.

**Indian-specific:** Kirana shop receipts are often handed to the customer folded; when unfolded and photographed quickly, the crease creates two angled halves. ML Kit reads these as two separate text regions with no spatial continuity.

---

### W3 — Single Image Capture (No Multi-Frame Fusion)

For a long DMart or pharmacy receipt (30-40 items), a single photograph captures perhaps 60-70% of the content legibly. The user has no guidance to scroll and capture the full receipt. There is no multi-image stitching capability.

---

## Layer 2 — OCR Engine

### W4 — ML Kit v1 Has No Script Support Beyond Latin

**Current state:** `@react-native-ml-kit/text-recognition` uses ML Kit Text Recognition v1.

**Impact:** Hindi/Devanagari product names, Tamil labels, Bengali prices, or Marathi merchant names are not recognized at all — they return as garbled Latin or empty strings.

**Indian receipt reality:**
- Kirana bills: merchant name in Hindi/Marathi (Devanagari script)
- Local vegetables: handwritten names in regional script
- Pharmaceutical: drug names in Devanagari
- Government utility bills: BESCOM/MSEB bills partially in Kannada/Marathi

**ML Kit Text Recognition v2** (available since 2023) supports Devanagari, Latin, Chinese, Japanese, Korean, South Indian scripts as separate models. The app hasn't upgraded.

---

### W5 — No Per-Character / Per-Word OCR Confidence

**Current state:** ML Kit's JavaScript binding exposes the result as `{ blocks, lines, elements }`. Per-element (word) `confidence` property exists in the native SDK but is **not reliably surfaced** in the React Native binding `@react-native-ml-kit/text-recognition`.

**Impact:** The confidence scorer in `confidence.js` is purely semantic (did we find a date? a total?). It cannot detect:
- OCR character substitution errors (1→l, 0→O, 5→S)
- Partially read numeric strings (₹1,74.00 vs ₹1,740.00 — a missing character in the middle)
- Ambiguous letters in product names (BISLEN vs BISLERI, AMUL vs AMUN)

**Consequence:** A high-confidence parse score can coexist with silently wrong prices — e.g., ₹174 extracted when the actual total was ₹1,740.

---

### W6 — No Fallback OCR Engine

**Current state:** Single ML Kit call. If it returns empty blocks (network model loading failure, very low quality image, unsupported script), the pipeline immediately returns a zero-item result.

**Impact:** No retry at higher quality, no alternate engine, no partial result.

---

## Layer 3 — Row Merging

### W7 — y-Overlap Merging Fails on Multi-Column Tabular Layouts

**Current state:** `mergeIntoRows()` groups lines with ≥ 50% y-box overlap regardless of x position or column structure.

**Failure case — Pharmacy tabular receipt:**

```
ML Kit output (3 separate text blocks per row):
  "PARACETAMOL 500MG"  (x=20, y=100)
  "10 tabs"             (x=250, y=103)
  "₹29.00"             (x=380, y=100)

Merged correctly:
  "PARACETAMOL 500MG 10 tabs ₹29.00"
```

This case works. But for receipts with 5+ columns (item | batch | expiry | MRP | discount | net):

```
  "CROCIN ADVANCE"  (y=100)
  "J/123"           (y=100)   ← batch number
  "12/26"           (y=100)   ← expiry date (MM/YY)
  "₹45.00"          (y=100)   ← MRP
  "₹40.50"          (y=100)   ← net price

Merged: "CROCIN ADVANCE J/123 12/26 ₹45.00 ₹40.50"
```

Now `matchAmounts()` finds two prices. The parser takes the last (₹40.50 = net), but also reads `12/26` as a date override (DD/YY), potentially corrupting the bill date.

---

### W8 — `mergeIntoRows()` Ignores Column Count

A DMart receipt has columns: `Item | Qty | Unit | MRP | Discount | Net`. The parser treats the merged text as a single string and tries to extract name + price from it. Without knowing the column structure, it may pick MRP instead of net price, or include "Qty" column value in the item name.

---

## Layer 4 — Format Detection

### W9 — Signal Count Threshold Is Brittle

**Current state:**
- `hits >= 3` → formatConfidence = 1.0
- `hits == 2` → 0.75
- `hits == 1` → 0.5
- `hits < 2` and short → 'handwritten'

**Failure case:** A Zomato receipt with only the restaurant name visible (rest cropped) fires 0-1 signals but is classified as 'handwritten'. The permissive item strategy then extracts garbage.

**Failure case:** A Reliance Fresh receipt photographed with the header cropped fires no brand signals. Only "Cashier: 002" and "HSN 1001" are visible → classified as 'generic' instead of 'departmental'. Generic uses tabular strategy which works, but lacks the correct priority list for Reliance's specific total keywords ("net payable" vs "amount payable").

---

### W10 — No Confidence Decay for Ambiguous Formats

When two formats score equally (e.g. restaurant=2, departmental=2), the first one in `FORMAT_SIGNATURES` wins by iteration order. There is no tie-breaking by secondary signals or brand presence.

---

### W11 — `looksHandwritten` Heuristic Is Naive

```js
function looksHandwritten(rows, signalsByFormat) {
  if (rows.length > 40) return false;
  const text = rows.map(r => r.text).join('\n');
  if (/GSTIN|FSSAI/i.test(text)) return false;
  if (maxSignal >= 3) return false;
  return rows.length <= 25 && maxSignal <= 1;
}
```

- A printed kirana receipt from a billing software (common: `Vyapar`, `Marg`) has GSTIN, 20 rows, and 1 format signal → classified as generic, not handwritten. This is correct but fragile.
- A small café bill with 8 items: coffee ₹80, sandwich ₹120, total ₹200 → 8 rows, 0 GSTIN, 0 signals → classified as handwritten. Permissive strategy works but is less precise.

---

## Layer 5 — Item Extraction

### W12 — `itemBandTop = 10%` Is Wrong for App-Generated Receipts

Blinkit/Zepto/Zomato digital receipts have a large header:
```
[Logo + Order # + Address + Delivery partner + Date + Time]
```
This header often occupies 25-40% of the receipt image. The 10% band top cutoff means the parser attempts to extract items from the header region, creating phantom items from address text and order IDs.

---

### W13 — `findNameBackward()` Uses a 4-Row Lookback With No Spatial Awareness

When the item name is on a separate line above the price:

```
Row 12: "Amul Butter 100g"    (name row)
Row 13: "₹56.00"              (price row)
```

The backward search finds "Amul Butter 100g" correctly. But for receipts where the name is separated by an unrelated row:

```
Row 12: "Amul Butter 100g"
Row 13: "Batch: B/2024/011"    ← meta row, SKIP_RE fires
Row 14: "₹56.00"               ← price row; backward search stops at SKIP_RE
```

The item name is lost. The item gets the price but no name → discarded by the `nameText.length < 2` check.

`stopOnSkip: true` is the default, which is correct for most cases but causes this failure for pharmacy receipts with per-item batch numbers between the name and price.

---

### W14 — Quantity Derivation Rounds to Integers Only

```js
const derived = price / rate;
if (derived > 0.5 && derived < 100 && Math.abs(derived - Math.round(derived)) < 0.05) {
  qtyHint = Math.round(derived);
}
```

- `0.05` tolerance: 1.5kg × ₹20 = ₹30. derived = 30/20 = 1.5. |1.5 - 2| = 0.5 > 0.05 → rejected. Qty lost.
- This is intentional (avoid false positives) but means decimal-quantity items (0.5kg, 2.5L) never get qty from the `rate × qty = total` pattern.
- The fix: also check if derived is within 5% of a common fraction (0.25, 0.5, 0.75, 1.5, 2.5).

---

### W15 — No Column Position Awareness in Price Selection

For tabular formats with MRP + net price columns:

```
Row: "ARIEL 500g         ₹210.00    ₹168.00"
           name           MRP        net(after discount)
```

`matchAmounts()` returns [₹210, ₹168]. The parser takes the **last** positive amount (`₹168`) as the price. This is correct most of the time, but fails when the receipt uses: `[net] [discount]` ordering:

```
Row: "ARIEL 500g     ₹168.00    -₹42.00"
          name          net      discount
```

Here the last positive amount is ₹168 (correct). But if the parser used `allowNegative: false` on `pickAmount`, this still works. However the pattern is unverified by column position — it's a positional assumption.

---

### W16 — GST Line Items Not Extracted Per Product

Indian GST invoices (departmental, pharmacy, online retail) have per-item HSN codes and GST rates:

```
Tata Salt 1kg        ₹20.00    HSN 2501  GST 5%  CGST 2.5%  SGST 2.5%
Amul Butter 100g     ₹56.00    HSN 0405  GST 12% CGST 6%    SGST 6%
```

The current parser:
1. Extracts GSTIN (entity-level)
2. Sums all tax rows as a single `tax` total
3. Does NOT link CGST/SGST rates to individual items

**Impact:** Cannot compute per-item pre-tax price. Cannot verify GST amount. Cannot detect wrong tax rates applied to items.

---

### W17 — `SKIP_RE` Over-Matches Item Names

`SKIP_RE` is a union of ALL keyword sets. Items with names like:

- **"Total Care Soap"** → matches `total` → skipped
- **"Savings Atta"** → matches `savings` in DISCOUNT_KEYWORDS → skipped
- **"Delivery Express Tea"** → matches `delivery` in FEE_KEYWORDS → skipped
- **"Mobile Cleaner"** → matches `mobile` in META_KEYWORDS → skipped
- **"Cash Nut"** (a common snack) → matches `cash` → skipped

---

### W18 — `normalizeName()` Strips All Non-ASCII Characters

```js
const lower = display_name.toLowerCase()
  .replace(/[^a-z\s]/g, ' ')  // ← destroys non-ASCII entirely
  .replace(/\s+/g, ' ')
  .trim();
```

**Impact:**
- Hindi product names (e.g., "दूध", "आटा") → empty string → item rejected
- Tamil labels: "வெங்காயம்" → empty → rejected
- Brand names with ® symbols: "Nestlé®" → "nestl" (loses the 'é')
- French-origin brand names: "café" → "caf" (corrupts the normalized key)
- Numeric brand names like "7UP", "5-Star" → "up", "star" (loses the number which disambiguates)

---

### W19 — `produceList.js` Has No Fuzzy Matching

The produce classification uses an exact `Set.has()` lookup on `normalized_name`.

Failures:
- `"tomatoes"` → singularize → `"tomato"` → **matches** ✓ (correct)
- `"tamatar"` (Hindi for tomato) → `"tamatar"` → **no match** ✗
- `"pyaaz"` (onion in Hindi) → **no match** ✗
- `"aloo"` (potato) → **no match** ✗
- `"saag"` (leafy greens) → **no match** ✗
- `"brinjal"` → **matches** ✓
- `"baingan"` (brinjal in Hindi) → **no match** ✗

These all produce `kind='grocery'` instead of `'produce'`, affecting inflation tracking and kind-based filtering.

---

## Layer 6 — Merchant Extraction

### W20 — Top-25% Heuristic Is Wrong for Digital App Receipts

For Blinkit, Zomato, or Swiggy receipts displayed in-app and screenshotted, the merchant brand appears in the top 5%. But address information, "delivering to:", "ordered by:", and "order placed at:" lines also appear in the top 25% and can win the candidate selection if they appear above the brand line.

---

### W21 — No Merchant Normalization Post-Extraction

Even when extraction succeeds, the extracted merchant is raw OCR text: "RELIANCE FRESH", "Reliance Fresh", "Reliance fresh (Andheri)", "RELIANCE FRESH-ANDHERI" are all returned as-is. No canonical mapping to "Reliance Fresh".

The `matchBrand()` function in `patterns.js` runs on the entire receipt text, not on the extracted merchant string. So a brand can be recognized in the receipt body but the extracted merchant name still contains the raw OCR variant.

---

### W22 — GSTIN Not Used for Merchant Lookup

A GSTIN like `29AACCM3590D1ZN` encodes:
- `29` = Karnataka (state code)
- `AACCM3590D` = PAN number (where `C` = company type, `MCDONA` would be the first 4 chars of the company name)
- First 4 chars of PAN (after type char) identify the legal entity

The current code extracts GSTIN but does nothing with it. State code alone could improve merchant's state/city context.

---

## Layer 7 — Date Extraction

### W23 — Ambiguous DD/MM vs MM/DD

```js
export const DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;
```

For `01/05/2025`: Is this January 5 or May 1? In India, DD/MM is standard, but the regex captures groups `(1=01, 2=05, 3=2025)` and then calls `normaliseDate(d=01, m=05, y=2025)` → `2025-05-01`. This is correct for the Indian convention but silently wrong for receipts from US-format stores.

More critically: `DATE_RE` can match non-date numbers like:
- `"HSN/8.12.2023"` → matches `8.12.2023` as a date
- `"Batch: A/01/05/26"` → matches `01/05/26`
- An invoice number `"INV-12-03-24-001"` → matches `12-03-24`

No validation that the matched day is 1-31, month is 1-12, or year is reasonable.

---

### W24 — Time Regex `TIME_RE` Is Defined But Never Used

`patterns.js` exports `TIME_RE` but `parseReceipt.js` never calls it. Receipt timestamps (common on all POS bills) are ignored. Timestamp would improve date parsing accuracy: `"12/05/25 14:32:07"` → date `12/05/25`, time `14:32:07`.

---

## Layer 8 — Confidence Scoring

### W25 — Reconciliation Tolerance Is Fixed at 7%

```js
if (within(expected, parsed.total, 0.07)) components.reconcile = 1;
```

For a ₹5,000 pharmacy bill, 7% = ₹350 tolerance. This could mask large extraction errors. For a ₹50 tea bill, 7% = ₹3.50 — tight enough but some rounding across 5 items could still miss.

A dynamic tolerance based on item count and bill size would be more appropriate.

---

### W26 — Confidence Doesn't Penalize Duplicate Items

If the same item is extracted twice (common when the receipt has a "you ordered" section AND a "bill details" section), the reconciliation score stays high (double-counted items sum to approximately the total), but the user is shown 2× the actual items.

---

### W27 — No OCR Quality Signal in Confidence

The confidence model has no input from the OCR engine about image quality. A receipt with heavily degraded OCR that happens to produce matching totals scores equally to a clean scan. The user doesn't know the underlying recognition was unreliable.

---

## Layer 9 — Special Receipt Types

### W28 — Thermal Receipts: No Inversion Handling

Many thermal receipts are printed with dark background and light text (inverted). ML Kit can read these but accuracy drops. If the user captures an already-faded thermal receipt, the combination of inversion + fade makes recognition nearly impossible. No automatic inversion detection or correction exists.

---

### W29 — Duplicate Bill Detection Is Absent

There is no mechanism to detect if the same receipt has been scanned twice. A user could scan a receipt, edit items, and then scan again → double-counted expense. No fingerprinting of receipts (by total + date + merchant + item count hash).

---

### W30 — No Pharmacy-Specific Extraction

Pharmacy receipts have unique fields:
- Drug name (with strength: "Paracetamol 500mg")
- Batch number
- Expiry date (separate from bill date)
- MFG date
- Quantity (number of strips/tablets/ml)
- Schedule (H/H1/X drug classification)
- Manufacturer

The parser handles pharmacy as 'tabular' with generic item extraction. Per-item expiry dates and batch numbers are not captured. Batch numbers (format: `B/2024/011` or `A123B`) look like price fragments to `matchAmounts()` (the `/011` part) and can corrupt item names.

---

### W31 — No Fuel Receipt Item Extraction

Fuel receipts (`itemStrategy: 'totals-only'`) extract no items, but they have structured line data:
```
Product: Petrol
Volume:  12.34 L
Rate:    ₹94.72/L
Amount:  ₹1,168.78
```

This is a single-item extraction that the current system doesn't attempt. If extracted, it would enable: price-per-litre history, fuel consumption tracking, and inflation analysis for fuel.

---

## Summary Severity Table

| ID | Layer | Severity | Description |
|---|---|---|---|
| W1 | Image capture | Critical | No preprocessing (contrast, denoise) |
| W2 | Image capture | Critical | No deskew/perspective correction |
| W3 | Image capture | High | No multi-frame/long-receipt capture |
| W4 | OCR engine | Critical | ML Kit v1: no Indian script support |
| W5 | OCR engine | High | No per-word OCR confidence access |
| W6 | OCR engine | High | No fallback OCR engine |
| W7 | Row merging | High | y-overlap fails for multi-column tabular |
| W8 | Row merging | High | Column count not detected |
| W9 | Format detection | Medium | Signal count threshold brittle |
| W10 | Format detection | Medium | No tie-breaking on equal format scores |
| W11 | Format detection | Low | Handwritten heuristic naive |
| W12 | Item extraction | High | 10% band top wrong for app receipts |
| W13 | Item extraction | Medium | Backward name search stops on batch rows |
| W14 | Item extraction | Medium | Qty derivation rejects decimal quantities |
| W15 | Item extraction | Medium | No column position awareness |
| W16 | Item extraction | High | No per-item GST rate extraction |
| W17 | Item extraction | High | SKIP_RE over-matches item names |
| W18 | Normalization | Critical | Strips all non-ASCII → Hindi names lost |
| W19 | Normalization | High | Produce list has no Hindi/regional names |
| W20 | Merchant | Medium | 25% heuristic wrong for app receipts |
| W21 | Merchant | Medium | No post-extraction normalization |
| W22 | Merchant | Low | GSTIN not used for merchant lookup |
| W23 | Date | Medium | Ambiguous DD/MM vs MM/DD |
| W24 | Date | Low | TIME_RE defined but unused |
| W25 | Confidence | Medium | Fixed 7% reconciliation tolerance |
| W26 | Confidence | Medium | Duplicate items not penalized |
| W27 | Confidence | Medium | No OCR quality signal in confidence |
| W28 | Special types | Medium | No thermal inversion handling |
| W29 | Special types | High | No duplicate receipt detection |
| W30 | Special types | Medium | Pharmacy batch/expiry not extracted |
| W31 | Special types | Low | Fuel single-item not extracted |

# Current OCR Pipeline — Drift

**Engine:** `@react-native-ml-kit/text-recognition` (Google ML Kit v1)  
**Platform:** React Native / Expo (Android + iOS)  
**Mode:** Fully offline, on-device  
**Entry point:** `Scan.js` → `textRecognition.js` → `parseReceipt.js`

---

## Full Pipeline Map

```
┌──────────────────────────────────────────────────────────────────────┐
│  1. IMAGE CAPTURE                                                     │
│     expo-image-picker                                                 │
│     └─ Camera → launchCameraAsync({ quality: 0.8 })                  │
│     └─ Gallery → launchImageLibraryAsync({ quality: 0.8 })           │
│     Output: local URI (JPEG, ~80% quality, native resolution)        │
│     No preprocessing. No deskew. No contrast. No resize.             │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ URI
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. OCR ENGINE (textRecognition.js)                                   │
│     TextRecognition.recognize(uri)                                    │
│     └─ ML Kit Text Recognition v1                                     │
│     Output: { blocks: [{ lines: [{ text, frame }] }] }               │
│     Block = paragraph-level grouping by ML Kit                       │
│     Line = individual text line within a block                       │
│     No word-level confidence exposed. No character confidence.       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ OCR result object
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  3. LINE EXTRACTION (textRecognition.js → extractLines)              │
│     Flatten blocks → lines                                           │
│     Extract bounding box per line: { text, x, y, width, height }    │
│     Sort lines: y ASC, x ASC (top-to-bottom, left-to-right)         │
│     Output: Line[] with spatial coordinates                          │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ Line[]
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  4. ROW MERGING (parseReceipt.js → mergeIntoRows)                    │
│     Group lines that share a baseline (y-box overlap ≥ 50%)         │
│     Join items left-to-right by x position                          │
│     Output: Row[] { text, parts[], x, y, height }                   │
│                                                                       │
│     Example: "Tomato"(x=10)  "2 kg"(x=180)  "₹40"(x=340)          │
│     → merged: { text: "Tomato 2 kg ₹40", parts: ["Tomato","2 kg","₹40"] } │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ Row[]
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  5. FORMAT DETECTION (detectFormat.js)                               │
│     Concatenate all row text → fullText                              │
│     Score each FORMAT_SIGNATURE against fullText (regex hit count)   │
│                                                                       │
│     Formats scored:                                                  │
│       quick_commerce, food_delivery, online_retail, restaurant,      │
│       departmental, pharmacy, fuel, transport, utility               │
│                                                                       │
│     Tie-breaking:                                                    │
│       If top format hits < 2 AND rows ≤ 25 AND no GSTIN/FSSAI       │
│         → classify as 'handwritten'                                  │
│       Else if hits < 2 → classify as 'generic'                      │
│                                                                       │
│     Also runs matchBrand() against KNOWN_BRANDS list (55 brands)    │
│     Output: { format, label, config, brand, formatConfidence }       │
│                                                                       │
│     Per-format configs select:                                       │
│       itemStrategy: 'card' | 'tabular' | 'permissive' | 'totals-only'│
│       subtotalPriority[], totalPriority[]                            │
│       feeWhitelist[]                                                 │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ format config
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  6. ROW CLASSIFICATION (parseReceipt.js → classifyRow)               │
│     Each row classified against compiled keyword regexes:            │
│       BILL_HDR_RE  → 'bill_header'  (checked first — more specific)  │
│       SUBTOTAL_RE  → 'subtotal'                                      │
│       DISCOUNT_RE  → 'discount'                                      │
│       TOTAL_RE     → 'total'                                         │
│       TAX_RE       → 'tax'                                           │
│       FEE_RE       → 'fee'                                           │
│       META_RE      → 'meta'                                          │
│       else         → 'item'                                          │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ classified rows
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  7. BILL TOTALS EXTRACTION (extractBillTotals)                       │
│     Bucket rows by classification (total/subtotal/tax/fee/discount)  │
│     For each bucket: extract rightmost positive amount token         │
│     findPriority(): try each keyword in priority list,              │
│       fall back to last row in bucket                               │
│     Tax: SUM all tax rows (CGST + SGST + IGST summed)               │
│     Output: { total, totalY, subtotal, tax, fees[], discounts[] }   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ totalY
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  8. BAND DETECTION (findBillBands)                                   │
│     itemBandTop = minY + 10% of receiptHeight                        │
│     itemBandBottom:                                                  │
│       if billHeaderY found (after first amount row) → billHeaderY-1  │
│       else if totalY found → totalY-1                               │
│       else → maxY (whole receipt)                                    │
│     Output: { itemBandTop, itemBandBottom, minY, maxY, rangeY }     │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ bands
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  9. ITEM EXTRACTION — dispatched by itemStrategy                     │
│                                                                       │
│  Strategy: 'card' (quick_commerce, food_delivery)                    │
│    ├─ For each row in item band:                                     │
│    │    Find rightmost positive amount → price                       │
│    │    Remainder of line → candidate name                          │
│    │    If name is qty-only → look backward up to 4 rows for name   │
│    │    If name has no digits → look forward 1-2 rows for qty token  │
│    └─ buildItem(name, price)                                         │
│                                                                       │
│  Strategy: 'tabular' (restaurant, departmental, pharmacy)            │
│    ├─ Same as card, PLUS:                                            │
│    │    If 2+ amounts on line: qty = price / rate (integer check)    │
│    │    Strip trailing 1-2 digit integers as qty column             │
│    │    Prepend "N x " to preNormalize string if qtyHint found      │
│    └─ buildItem(name, price, { namePreNormalize })                   │
│                                                                       │
│  Strategy: 'permissive' (handwritten)                                │
│    ├─ Accept bare integers (no currency prefix required)             │
│    └─ Require at least one alpha character in name                  │
│                                                                       │
│  Strategy: 'totals-only' (fuel, transport, utility)                  │
│    └─ Return [] immediately                                          │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ raw items[]
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  10. NAME NORMALIZATION (normalizeName.js)                           │
│     Input: raw name string (price already stripped)                  │
│                                                                       │
│     Step 1: Strip HSN/SAC tail codes (e.g. "Tata Salt HSN 2501")   │
│     Step 2: parseUnitToken() — find first unit token (e.g. "500g")  │
│             → qty=500, unit='g'; remove token from name             │
│     Step 3: Trailing/leading multiplier (e.g. "x 2", "2 x")        │
│             → multiply qty if unit found; else qty = multiplier     │
│     Step 4: Portion words (half/full/quarter/small/medium/large)    │
│     Step 5: Strip leading SKU codes (4+ digit prefix)               │
│     Step 6: Strip leading stray numbers                             │
│     Step 7: display_name = cleaned original-case text               │
│     Step 8: normalized_name = lowercase, strip non-ASCII, singularize│
│                                                                       │
│     Output: { display_name, normalized_name, qty, unit }            │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ normalized items
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  11. UNIT CANONICALIZATION (units.js → toCanonical)                  │
│     Convert qty/unit to base units:                                  │
│       mass: g→kg (*0.001), lb→kg (*0.454), oz→kg (*0.028)          │
│       volume: mL→L (*0.001)                                          │
│       count: dozen→pcs (*12)                                         │
│       pack: pack→pack (*1)                                           │
│     Compute unit_price = price / canonical_qty                       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ items with canonical units
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  12. METADATA EXTRACTION                                             │
│     merchant: matchBrand() first, else top-25% row heuristic        │
│     date: DATE_RE (DD/MM/YY, DD-MM-YY) + MONTH_DATE_RE (word months)│
│     currency: first CURRENCY_RE match → mapped to symbol            │
│     gstin: GSTIN_RE → 15-char GST number                            │
│     orderId: ORDER_ID_RE → invoice/order/bill/receipt number         │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ parsed object
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  13. TOTAL FALLBACK                                                  │
│     If total still NaN after keyword search:                         │
│       Scan bottom 40% of receipt for largest non-subtotal amount     │
│     If still 0 and items exist: sum item prices                      │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  14. CONFIDENCE SCORING (confidence.js → scoreConfidence)            │
│     7 weighted components:                                           │
│       currency  10% — currency symbol found?                        │
│       date      10% — non-fallback date parsed?                     │
│       merchant  10% — non-"Unknown store" merchant?                 │
│       format    10% — formatConfidence from step 5                  │
│       items     20% — at least one item extracted?                  │
│       total     20% — total > 0?                                    │
│       reconcile 20% — sum(items)+fees+tax-discounts ≈ total ±7%?   │
│                                                                       │
│     Overall: weighted sum → label: high(≥0.85) / medium(≥0.6) / low │
│     Flags: needsMerchant, needsDate, needsItems, needsTotal, needsReview│
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ final parsed object
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  15. UI REVIEW (Scan.js)                                             │
│     Show: format label, confidence badge, merchant, date, total      │
│     Show: item list (name, qty, unit, unit_price)                   │
│     Show: fees & charges section                                     │
│     User can: edit any field, add/delete items, adjust unit/qty     │
│     On save: addExpenseWithItems() → SQLite transaction              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## File → Responsibility Map

| File | Responsibility |
|---|---|
| `Scan.js` | Image capture, UI review, save orchestration |
| `textRecognition.js` | ML Kit bridge, line extraction + spatial sort |
| `parseReceipt.js` | Row merging, all extraction strategies, orchestrator |
| `detectFormat.js` | Format classification, per-format config |
| `patterns.js` | All regexes, keyword sets, brand list, amount parsing helpers |
| `normalizeName.js` | Item name → structured `{display_name, normalized_name, qty, unit}` |
| `confidence.js` | 7-component weighted confidence scoring |
| `units.js` | Unit aliases, canonicalization (g→kg, mL→L, etc.) |
| `produceList.js` | Set of known produce names for `kind='produce'` tagging |

---

## Supported Receipt Formats

| Format | Item Strategy | Key Detection Signals |
|---|---|---|
| Quick commerce | card | blinkit/zepto/instamart, "items in this order", "bill details" |
| Food delivery | card | zomato/swiggy, "item total", "platform fee" |
| Online retail | tabular | amazon/flipkart, "order id", "shipped by", "grand total" |
| Restaurant | tabular | table/kot/steward, "service charge", CGST @% |
| Departmental | tabular | dmart/reliance, HSN codes, "cashier", "loyalty" |
| Pharmacy | tabular | batch/expiry/MFG date, "schedule h", pharmacy brand |
| Fuel | totals-only | petrol/diesel/CNG, liters, rate/L, HPCL/BPCL/IOCL |
| Transport | totals-only | uber/ola/rapido, "base fare", "surge", "pickup" |
| Utility | totals-only | "billing period", meter no., "units consumed" |
| Handwritten | permissive | ≤25 rows, no GSTIN, weak format signals |
| Generic | tabular | fallback for everything else |

---

## Key Data Flows

### Amount token extraction (`patterns.js → PRICE_TOKEN_RE`)

```
₹72          → group1="72",        value=72.00
Rs. 1,200    → group1="1,200",     value=1200.00
$12.99       → group1="12.99",     value=12.99
1090.00      → group2="1090.00",   value=1090.00  (decimal-only form)
109,0        → NO MATCH           (rejects ambiguous comma form)
-₹50         → value=-50.00       (sign detection from prefix)
```

### Unit token extraction (`units.js → parseUnitToken`)

```
"500 grams tomato"    → { qty:500, unit:'g', match:'500 grams', index:0 }
"1.5 kg Onion"        → { qty:1.5, unit:'kg', match:'1.5 kg', index:0 }
"440 ml x 2"          → qty=440, unit='mL', then multiplier=2 → canonical: 0.88L
"2 dozen eggs"        → qty=2, unit='dozen', canonical: 24 pcs
```

### Merchant heuristic (top-25% non-numeric non-meta rows)

```
Receipt top section:
  Line 1: "FRESH MART"         ← y=10, letters=10, digits=0 → CANDIDATE
  Line 2: "12/05/2025"         ← digits dominate → SKIP
  Line 3: "GSTIN: 29ABCDE..."  ← looksLikeMetaOnly → SKIP
  Line 4: "Kotla, Andheri East"← letters=16, digits=2 → CANDIDATE
  → returns "FRESH MART" (topmost candidate)
```

---

## What the Pipeline Does NOT Do

- Image preprocessing (deskew, binarize, denoise, contrast stretch)
- Multi-language / Devanagari / Tamil / Telugu OCR
- Barcode / QR code scanning
- Per-character or per-word OCR confidence access
- Column separator detection for tabular layouts
- Duplicate receipt detection
- GST rate extraction per line item (only totals)
- Merchant deduplication / normalization post-extraction
- Template learning for recurring merchants
- Any form of ML-based line classification

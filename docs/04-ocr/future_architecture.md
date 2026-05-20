# Future OCR Architecture — Drift

This document specifies the recommended architecture for a production-grade, fully offline, India-first receipt OCR pipeline on Android.

---

## Design Goals

1. **Offline-first**: zero network calls for any OCR or parsing step
2. **India-first**: Devanagari, Tamil, Telugu, Kannada, Bengali in addition to Latin
3. **Thermal-receipt resilient**: preprocessing handles faded, inverted, crumpled images
4. **Item-level accuracy**: per-item price, qty, unit, GST rate, and product kind
5. **Merchant confidence**: canonical merchant from GSTIN + brand registry + NLP
6. **Duplicate detection**: fingerprint-based dedup before save
7. **Extensible**: new receipt formats added via template registry without code changes

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 0: CAPTURE                                   │
│  ┌──────────────────┐    ┌──────────────────────────────────────┐    │
│  │  Camera / Gallery│    │  Image Quality Pre-Check             │    │
│  │  (expo-camera)   │───►│  • Blur detection (Laplacian var)    │    │
│  │  quality: 1.0    │    │  • Dark / overexposed check          │    │
│  └──────────────────┘    │  • Aspect ratio validation           │    │
│                           │  → If low quality: prompt re-capture │    │
│                           └──────────────────────────────────────┘    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ original image URI
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: IMAGE PREPROCESSING                       │
│  Run in order (expo-image-manipulator + native module):               │
│                                                                       │
│  1a. Resize to 2000px max dimension (preserve aspect)                │
│  1b. Grayscale conversion                                            │
│  1c. Contrast Limited Adaptive Histogram Equalization (CLAHE)        │
│  1d. Perspective correction (4-corner document detection)            │
│  1e. Deskew (Hough line transform for rotation angle)               │
│  1f. Adaptive binarization (Sauvola / Niblack for thermal paper)    │
│  1g. Thermal detection: if mean brightness > 0.92, invert image     │
│  1h. Noise removal (median filter 3×3)                              │
│                                                                       │
│  Output: preprocessed PNG (lossless) → fed to OCR                   │
│  Implementation: OpenCV Android via react-native-opencv OR           │
│                  Custom Kotlin module calling Android Bitmap APIs    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ preprocessed image
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 2: OCR ENGINE (Multi-Engine)                 │
│                                                                       │
│  Primary: ML Kit Text Recognition v2 (Latin + Indian scripts)       │
│    └─ Devanagari model: ~3MB download, on-device inference           │
│    └─ Returns: blocks, lines, elements with confidence per element   │
│    └─ Min element confidence threshold: 0.60                        │
│                                                                       │
│  Fallback A: Tesseract LSTM (triggered when ML Kit conf < 0.5)      │
│    └─ Languages: eng+hin+tam+tel+kan+ben LSTM models               │
│    └─ ~15MB total, bundled in APK assets                            │
│    └─ Returns: word-level confidence + hOCR bounding boxes          │
│                                                                       │
│  Fallback B: Permissive regex mode (handwritten, no OCR fallback)   │
│    └─ Use ML Kit result as-is, flag confidence as 'low'             │
│                                                                       │
│  Engine selection logic:                                             │
│    1. Run ML Kit v2                                                  │
│    2. If mean word confidence < 0.5 OR text density < 3 words/cm²  │
│       → run Tesseract LSTM in parallel                              │
│    3. Merge results: prefer ML Kit for Latin chars,                 │
│       Tesseract for Devanagari/South Indian script runs             │
│                                                                       │
│  Output: EnrichedOCRResult {                                         │
│    lines: [{ text, x, y, w, h, confidence, script }]                │
│    meanConfidence: 0..1                                              │
│    dominantScript: 'latin' | 'devanagari' | 'tamil' | ...          │
│  }                                                                   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ EnrichedOCRResult
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 3: STRUCTURAL ANALYSIS                       │
│                                                                       │
│  3a. Column Detection                                                │
│    • Project all text tokens onto x-axis                            │
│    • Find x-axis density gaps (columns separated by whitespace)     │
│    • Identify: [name_col, qty_col, rate_col, discount_col, net_col] │
│    • Store column boundaries for downstream extraction               │
│                                                                       │
│  3b. Row Merging (enhanced)                                          │
│    • Current y-overlap logic + column-aware join                    │
│    • Tokens merged only if they are in the same column OR           │
│      the column structure is single-column                          │
│    • Each merged row tagged with column index per part              │
│                                                                       │
│  3c. Section Segmentation                                            │
│    • Identify: HEADER zone, ITEM zone, SUMMARY zone, FOOTER zone    │
│    • Header: from top to first item-like row                        │
│    • Item zone: between header and first total keyword              │
│    • Summary: total/tax/fee/discount rows                           │
│    • Footer: payment method, thank you, address                     │
│    • Use both keyword anchors AND whitespace gap detection           │
│                                                                       │
│  Output: StructuredReceipt {                                         │
│    columns: ColumnDef[]                                              │
│    rows: StructuredRow[] (with column assignments)                   │
│    sections: { header, items, summary, footer }                     │
│  }                                                                   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ StructuredReceipt
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 4: FORMAT DETECTION (v2)                     │
│                                                                       │
│  Signal scoring: unchanged from current (10 format types)           │
│  Enhanced: template registry lookup (new)                            │
│                                                                       │
│  Template Registry:                                                  │
│    • Per-merchant templates stored in SQLite (learned over time)    │
│    • Template: { merchant_id, column_pattern, section_heights,      │
│                  total_keyword, item_col_index, price_col_index }   │
│    • If GSTIN match → look up entity in GSTIN registry              │
│    • If brand match → apply brand-specific template immediately     │
│                                                                       │
│  Output: FormatDecision {                                            │
│    format, config, brand, formatConfidence,                          │
│    template: MerchantTemplate | null                                │
│    columnMap: { name:0, qty:1, rate:2, net:3 } | null              │
│  }                                                                   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ FormatDecision
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 5: ITEM EXTRACTION (v2)                      │
│                                                                       │
│  5a. Column-Aware Extraction (new strategy: 'columnar')              │
│    If columnMap detected:                                            │
│      name  = row.parts[columnMap.name]                              │
│      qty   = row.parts[columnMap.qty]                               │
│      rate  = row.parts[columnMap.rate]                              │
│      net   = row.parts[columnMap.net]                               │
│    Fallback to positional extraction if column index OOB            │
│                                                                       │
│  5b. Existing strategies: card, tabular, permissive (unchanged)     │
│                                                                       │
│  5c. Fuel Item Extraction (new strategy: 'fuel')                    │
│    Extract: product_type (petrol/diesel/CNG),                        │
│             volume (L), rate (₹/L), amount                          │
│                                                                       │
│  5d. Per-Item GST Extraction (new)                                  │
│    For each item row:                                                │
│      If HSN_RE matches → extract HSN code                           │
│      If CGST_RATE_RE matches (e.g. "CGST @2.5%") → cgst_rate      │
│      If SGST_RATE_RE matches → sgst_rate                           │
│      Compute: pre_tax_price = net / (1 + cgst_rate + sgst_rate)   │
│                                                                       │
│  5e. Pharmacy Extraction (new strategy: 'pharmacy')                 │
│    Per-item: drug_name, strength, form, quantity, batch, expiry    │
│    Strip batch/expiry from name column before normalization         │
│                                                                       │
│  Output: RawItem[] with optional { hsn, cgst_rate, sgst_rate,      │
│          batch_no, expiry_date, pre_tax_price }                     │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ RawItem[]
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 6: NAME NORMALIZATION (v2)                   │
│                                                                       │
│  6a. Script Detection                                                │
│    If dominantScript = 'devanagari':                                │
│      Run Hindi→English transliteration (Sanscript.js offline)      │
│      Or keep original Devanagari, store as display_name             │
│    For mixed script (e.g. "Amul दूध"):                             │
│      Segment by script, process each segment separately             │
│                                                                       │
│  6b. Current normalizeName() pipeline (unchanged for ASCII)         │
│    + Fix: allow Unicode alphanumeric in normalized_name             │
│      replace(/[^\p{L}\s]/gu, ' ') instead of [^a-z\s]             │
│                                                                       │
│  6c. Hindi / Regional synonym lookup                                │
│    Offline dictionary:                                               │
│      tamatar → tomato, pyaaz → onion, aloo → potato                │
│      doodh → milk, makhan → butter, paneer → paneer cheese         │
│    (~500 common items, bundled as a small JSON asset)               │
│                                                                       │
│  6d. Fuzzy produce classification                                    │
│    Instead of exact Set.has():                                      │
│      1. Exact match → produce                                       │
│      2. Trigram similarity ≥ 0.75 against produce list → produce   │
│      3. Regional synonym match → produce                            │
│                                                                       │
│  Output: NormalizedItem with display_name, normalized_name          │
│          (now Unicode-safe), qty, unit, kind                        │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ NormalizedItem[]
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 7: MERCHANT RESOLUTION                       │
│                                                                       │
│  7a. Brand registry lookup (current) → canonical brand name         │
│  7b. GSTIN entity lookup                                             │
│    If GSTIN found:                                                   │
│      Look up in local GSTIN cache (SQLite: gstin → merchant_name)  │
│      If not in cache: store GSTIN, use it to confirm state code     │
│      State code → city hint (e.g. 27=Maharashtra, 29=Karnataka)    │
│                                                                       │
│  7c. Merchant fuzzy match                                            │
│    Extracted raw merchant text → compare against merchants table    │
│    Jaro-Winkler similarity ≥ 0.88 → link to existing merchant      │
│    Else → create new merchant entry                                 │
│                                                                       │
│  7d. Category inference from merchant type                           │
│    If format = 'pharmacy' → category hint: 'Health'                │
│    If format = 'fuel' → category hint: 'Transport'                  │
│    If format = 'restaurant' → category hint: 'Food & Drink'        │
│                                                                       │
│  Output: { merchant_id, canonical_name, category_hint }            │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ merchant resolved
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 8: DUPLICATE DETECTION                       │
│                                                                       │
│  Compute receipt fingerprint:                                        │
│    hash = SHA256(merchant + date + total.toFixed(2) + itemCount)   │
│                                                                       │
│  Soft fingerprint (fuzzy):                                           │
│    key = `${merchant_id}:${date}:${Math.round(total/10)*10}`       │
│                                                                       │
│  Query: SELECT id FROM expenses WHERE receipt_hash = ?              │
│  If match found:                                                     │
│    → Show "Possible duplicate" warning with link to existing entry  │
│    → User can confirm duplicate or proceed to save                  │
│                                                                       │
│  Store receipt_hash on the expense row after save                   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ duplicate check passed
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 9: CONFIDENCE SCORING (v2)                   │
│                                                                       │
│  Existing 7 components (unchanged weight structure)                  │
│  New components:                                                     │
│    ocr_quality   10%  — mean OCR word confidence from engine        │
│    column_detect  5%  — was column structure successfully detected? │
│                                                                       │
│  Adjusted weights (total = 100%):                                   │
│    currency  8%  date 8%  merchant 8%  format 8%                   │
│    items 18%  total 18%  reconcile 18%                              │
│    ocr_quality 10%  column_detect 4%                                │
│                                                                       │
│  Dynamic reconciliation tolerance:                                   │
│    tolerance = max(0.03, min(0.10, 3 / itemCount))                 │
│    → 1 item: 10% tolerance; 30 items: 3% tolerance                 │
│                                                                       │
│  Duplicate penalty: if soft fingerprint match found, overall *= 0.5 │
│  New flags: isDuplicate, hasUnresolvedItems (items with empty names) │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ enriched parsed result
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    STAGE 10: UI REVIEW (enhanced)                     │
│                                                                       │
│  Existing edit UI (merchant, date, total, items) → unchanged        │
│  New:                                                                │
│    • Duplicate warning banner with "View existing" button           │
│    • Per-item confidence indicator (low confidence items highlighted)│
│    • Missing item name auto-focus for user to fill in               │
│    • Category auto-suggest based on merchant category hint          │
│    • "Rescan" shortcut to re-run OCR with different preprocessing   │
│    • Long-receipt: "Scan more pages" append mode                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## OCR Engine Comparison

| Criterion | ML Kit v1 (current) | ML Kit v2 | Tesseract 5 LSTM | PaddleOCR Lite | EasyOCR | TrOCR |
|---|---|---|---|---|---|---|
| **Offline** | ✓ | ✓ | ✓ | ✓ | ✗ (Python) | ✓ (ONNX) |
| **Android native** | ✓ | ✓ | ✓ (via JNI) | ✓ (Android SDK) | ✗ | ✓ (ONNX) |
| **React Native binding** | `@react-native-ml-kit/text-recognition` | Same package v2 | `react-native-tesseract-ocr` | Custom module needed | ✗ | Custom ONNX module |
| **Latin accuracy** | Very high | Very high | High | Very high | Very high | Excellent |
| **Devanagari** | ✗ | ✓ | ✓ (trainable) | ✓ | Limited | Fine-tunable |
| **Tamil/Telugu** | ✗ | ✓ | ✓ | ✓ | Limited | Fine-tunable |
| **Handwriting** | Poor | Poor | Medium | Medium | Good | Excellent |
| **Thermal receipts** | Good (after preprocessing) | Good | Medium | Good | Good | Excellent |
| **Word confidence** | Not in RN binding | Per-element ✓ | Per-word ✓ | Per-box ✓ | Per-box ✓ | Beam score |
| **Speed (mid-range Android)** | 50–150ms | 100–250ms | 500–2000ms | 200–500ms | N/A | 1000–3000ms |
| **Model size** | ~3MB (bundled) | +3MB per script | 15–25MB total | 5–15MB | N/A | 100–500MB |
| **Custom training** | ✗ | ✗ | ✓ (fine-tunable) | ✓ | ✓ | ✓ |
| **License** | Apache 2 | Apache 2 | Apache 2 | Apache 2 | Apache 2 | MIT |

### Recommendation

**Tier 1 (implement now):** Upgrade to ML Kit v2 + add per-element confidence read.
```
Cost: 1–2 days. Impact: Devanagari support, confidence access.
```

**Tier 2 (6-month horizon):** Add Tesseract 5 as fallback for low-confidence ML Kit results.
```
Cost: 1 week. Impact: handwriting, complex scripts, character-level correction.
```

**Tier 3 (12-month horizon):** PaddleOCR Lite for departmental and pharmacy tabular layouts.
```
Cost: 2–3 weeks (native Android module). Impact: table structure detection, column layout.
```

**Do not use:** EasyOCR (Python only), TrOCR (model too large for mobile, 100–500MB).

---

## Preprocessing Implementation Options

### Option A — `expo-image-manipulator` (available today)

```js
import * as ImageManipulator from 'expo-image-manipulator';

async function preprocessImage(uri) {
  // Resize
  const resized = await ImageManipulator.manipulateAsync(uri,
    [{ resize: { width: 2000 } }],
    { compress: 1, format: ImageManipulator.SaveFormat.PNG }
  );
  return resized.uri;
}
```

Supports: resize, rotate, flip. Does NOT support: CLAHE, Sauvola binarization, Hough deskew. Useful only for basic resize + quality fixes.

### Option B — Native Kotlin Module (recommended)

Write a small `ImagePreprocessModule.kt` that wraps Android's `android.graphics.Bitmap` and OpenCV Mobile (if bundled):

```kotlin
// In ImagePreprocessModule.kt
fun preprocessReceipt(inputUri: String): String {
    val bitmap = BitmapFactory.decodeFile(inputUri)
    // 1. Grayscale
    val gray = toGrayscale(bitmap)
    // 2. CLAHE (via OpenCV)
    val enhanced = applyClahe(gray)
    // 3. Binarization (Sauvola)
    val binary = sauvolaBinarize(enhanced)
    // 4. Deskew
    val deskewed = deskewHough(binary)
    // Save and return URI
    return saveToCache(deskewed)
}
```

**OpenCV Mobile for Android**: `implementation 'org.opencv:opencv:4.9.0'` — adds ~4MB to APK, self-contained, no native compilation.

### Option C — Pure JS (acceptable subset)

Using `react-native-canvas` or `@tensorflow/tfjs-react-native`, basic operations can be done in JS on typed arrays:
- Grayscale: average R,G,B channels
- Contrast stretch: normalize histogram
- Simple thresholding: mean adaptive

This won't match OpenCV quality but adds zero native dependencies.

---

## Template Learning Architecture

After a user saves a receipt with manual corrections, the system can learn the template:

```sql
CREATE TABLE receipt_templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id),
  format       TEXT NOT NULL,
  -- Column structure (JSON array of column x-ranges)
  column_map   TEXT,
  -- How many lines the header occupies (as fraction of receipt height)
  header_frac  REAL NOT NULL DEFAULT 0.15,
  footer_frac  REAL NOT NULL DEFAULT 0.20,
  -- Keyword that marks the start of items section
  item_start_keyword TEXT,
  -- Keyword that marks the end of items section
  item_end_keyword   TEXT,
  -- User-confirmed samples used to create this template
  sample_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

On each scan:
1. Look up `merchant_id` in `receipt_templates`
2. If template found with `sample_count >= 3`: use template's column_map and section fractions
3. After user saves with corrections: update template (average the fractions, increment sample_count)

This creates a feedback loop: the more a merchant is scanned, the more accurate future scans of that merchant become.

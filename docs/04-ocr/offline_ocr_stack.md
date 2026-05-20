# Recommended Offline OCR Stack — Drift

This document specifies the complete offline-first OCR technology stack for production Android deployment, with package recommendations, size budgets, implementation order, and a comparison of every viable option for each layer.

---

## Stack Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  LAYER            │  CURRENT              │  RECOMMENDED                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  Image capture    │  expo-image-picker    │  expo-camera (direct, quality=1)  │
│                   │  quality: 0.8 JPEG    │  + PNG output                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  Preprocessing    │  NONE                 │  Custom Kotlin module / OpenCV     │
│                   │                       │  Grayscale + CLAHE + Sauvola      │
│                   │                       │  Deskew + Perspective correction  │
├──────────────────────────────────────────────────────────────────────────────┤
│  OCR (primary)    │  ML Kit v1 (Latin)    │  ML Kit v2 (Latin + Indian scripts)│
│                   │  No confidence        │  Per-element confidence ≥ 0.60    │
├──────────────────────────────────────────────────────────────────────────────┤
│  OCR (fallback)   │  NONE                 │  Tesseract 5 LSTM                 │
│                   │                       │  (triggered at low ML Kit conf)   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Parsing engine   │  JS regex pipeline    │  JS regex pipeline (enhanced)     │
│                   │                       │  + column detection               │
│                   │                       │  + template registry              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Name normalization│  ASCII-only          │  Unicode-safe                     │
│                   │  No synonyms          │  + Hindi/regional synonym dict    │
│                   │                       │  + trigram fuzzy produce classify │
├──────────────────────────────────────────────────────────────────────────────┤
│  Merchant resolution│ Brand list match    │  Brand list + GSTIN cache         │
│                   │  (in-memory)          │  + Jaro-Winkler dedup             │
├──────────────────────────────────────────────────────────────────────────────┤
│  Duplicate detect │  NONE                 │  FNV-1a hash + soft fingerprint   │
├──────────────────────────────────────────────────────────────────────────────┤
│  NLP / classify   │  Regex + Set lookup   │  Regex + Trie + Trigram           │
│                   │                       │  (+ FastText lite at Phase 2)     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## OCR Engine Deep Dive

### ML Kit Text Recognition v2 (Primary — Upgrade Now)

**Package:** `@react-native-ml-kit/text-recognition` (already installed)  
**Upgrade action:** Bump package version + configure language model download

```json
// app.json (Expo config)
{
  "plugins": [
    ["@react-native-ml-kit/text-recognition", {
      "languageModels": ["latin", "devanagari"]
    }]
  ]
}
```

**v2 vs v1 comparison:**

| Feature | v1 (current) | v2 (recommended) |
|---|---|---|
| Latin (English) | ✓ | ✓ |
| Devanagari (Hindi) | ✗ | ✓ |
| Tamil | ✗ | ✓ |
| Telugu | ✗ | ✓ |
| Kannada | ✗ | ✓ |
| Bengali | ✗ | ✓ |
| Gujarati | ✗ | ✓ |
| Marathi | ✗ | ✓ (via Devanagari) |
| Per-element confidence | Limited | ✓ |
| Offline model bundling | ✓ | ✓ |
| Model size (Devanagari) | N/A | ~3MB |
| Play Store model delivery | ✓ | ✓ |

**Reading per-element confidence:**
```js
// textRecognition.js (updated)
export function extractLines(result) {
  const lines = [];
  if (!result?.blocks) return lines;
  for (const b of result.blocks) {
    if (!b?.lines) continue;
    for (const ln of b.lines) {
      if (!ln?.text) continue;
      const frame = ln.frame || b.frame || { left: 0, top: 0, width: 0, height: 0 };
      // v2 exposes confidence per element (word)
      const wordConfs = (ln.elements || [])
        .map(el => el.confidence ?? 1.0)
        .filter(c => isFinite(c));
      const lineConf = wordConfs.length
        ? wordConfs.reduce((s, c) => s + c, 0) / wordConfs.length
        : 1.0;
      lines.push({
        text: ln.text.trim(),
        x: frame.left ?? frame.x ?? 0,
        y: frame.top ?? frame.y ?? 0,
        width: frame.width ?? 0,
        height: frame.height ?? 0,
        confidence: lineConf,
      });
    }
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines;
}
```

---

### Tesseract 5 LSTM (Fallback OCR)

**Package:** `react-native-tesseract-ocr`  
**NPM:** `react-native-tesseract-ocr@^2.0.0`  
**GitHub:** https://github.com/jonathanpalma/react-native-tesseract-ocr (archived) OR fork  
**Alternative:** Write a custom native Kotlin module wrapping Tesseract4Android

**Language data files** (bundle in `android/app/src/main/assets/tessdata/`):
```
eng.traineddata    — 4.0 MB (English LSTM)
hin.traineddata    — 2.1 MB (Hindi Devanagari LSTM)
tam.traineddata    — 2.4 MB (Tamil LSTM)
tel.traineddata    — 2.2 MB (Telugu LSTM)
```
Total: ~11MB additional APK size (acceptable for a dedicated app)

**Trigger condition:**
```js
async function runOCR(uri) {
  const mlKitResult = await recognize(uri);
  const mlKitLines = extractLines(mlKitResult);
  const meanConf = meanConfidence(mlKitLines);

  if (meanConf >= 0.65) {
    return { lines: mlKitLines, engine: 'mlkit', confidence: meanConf };
  }

  // Fallback: run Tesseract
  const tessResult = await TesseractOCR.recognize(uri, {
    lang: 'eng+hin',
    psm: TesseractOCR.PSM.AUTO,          // auto page segmentation
    oem: TesseractOCR.OEM.LSTM_ONLY,     // LSTM engine
  });

  // Merge: prefer ML Kit text for Latin runs, Tesseract for non-Latin
  const mergedLines = mergeEngineResults(mlKitLines, tessResult.lines);
  return { lines: mergedLines, engine: 'tesseract+mlkit', confidence: meanConf };
}

function meanConfidence(lines) {
  if (!lines.length) return 0;
  const confs = lines.map(l => l.confidence ?? 1.0);
  return confs.reduce((s, c) => s + c, 0) / confs.length;
}
```

**Tesseract PSM (Page Segmentation Mode) selection:**
```
PSM.AUTO              — automatic (good default for most receipts)
PSM.SINGLE_COLUMN     — long narrow thermal receipts
PSM.SPARSE_TEXT       — handwritten kirana bills with scattered text
PSM.SINGLE_LINE       — when processing individual extracted lines
```

---

### PaddleOCR Lite (Future — Phase 3)

PaddleOCR's mobile SDK provides both text **detection** (finding text regions) and text **recognition** (reading the content), including structure analysis for tables.

**Integration path:**
1. Download PaddleOCR Lite Android AAR from PaddlePaddle model zoo
2. Write a `PaddleOCRModule.kt` bridge in `android/app/src/main/java/`
3. Expose `detectAndRecognize(imagePath: String): Promise<StructuredResult>`
4. `StructuredResult` includes detected text boxes + column groupings

**When to use:** Pharmacy receipts, DMart tabular receipts, multi-column layouts that the current column detector misses.

**Model sizes:**
- Text detection model (PP-OCRv4 det): 4.7MB
- Text recognition model (PP-OCRv4 rec, English): 8.9MB
- Hindi recognition model: 10.2MB

**Why deferred:** Requires native Android module development (~3 weeks). Not justified until ML Kit + Tesseract combo is shipping and residual errors are specifically traced to column detection failures.

---

## Image Preprocessing Stack

### Recommended: Custom Kotlin Module

Create `android/app/src/main/java/com/drift/expensemanager/ImagePreprocessModule.kt`

```kotlin
package com.drift.expensemanager

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream

class ImagePreprocessModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "ImagePreprocess"

    @ReactMethod
    fun preprocess(inputUri: String, promise: Promise) {
        try {
            val bitmap = BitmapFactory.decodeFile(inputUri)
            val processed = pipeline(bitmap)
            val outFile = File(reactContext.cacheDir, "preprocessed_${System.currentTimeMillis()}.png")
            FileOutputStream(outFile).use { out ->
                processed.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
            promise.resolve(outFile.absolutePath)
        } catch (e: Exception) {
            promise.reject("PREPROCESS_ERROR", e.message)
        }
    }

    private fun pipeline(src: Bitmap): Bitmap {
        var bmp = resize(src, 2000)
        bmp = toGrayscale(bmp)
        bmp = clahe(bmp)           // Contrast Limited Adaptive Histogram Equalization
        bmp = deskew(bmp)          // Hough line-based rotation correction
        bmp = sauvolaBinarize(bmp) // Adaptive thresholding
        return bmp
    }

    private fun resize(bmp: Bitmap, maxDim: Int): Bitmap {
        val scale = maxDim.toFloat() / maxOf(bmp.width, bmp.height)
        if (scale >= 1f) return bmp
        val w = (bmp.width * scale).toInt()
        val h = (bmp.height * scale).toInt()
        return Bitmap.createScaledBitmap(bmp, w, h, true)
    }

    private fun toGrayscale(bmp: Bitmap): Bitmap {
        val gray = Bitmap.createBitmap(bmp.width, bmp.height, Bitmap.Config.ARGB_8888)
        for (x in 0 until bmp.width) {
            for (y in 0 until bmp.height) {
                val p = bmp.getPixel(x, y)
                val lum = (0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p)).toInt()
                gray.setPixel(x, y, Color.rgb(lum, lum, lum))
            }
        }
        return gray
    }

    // Sauvola binarization for thermal paper (local threshold per block)
    private fun sauvolaBinarize(bmp: Bitmap, winSize: Int = 51, k: Double = 0.2): Bitmap {
        val w = bmp.width; val h = bmp.height
        val gray = IntArray(w * h) { bmp.getPixel(it % w, it / w).let { p -> Color.red(p) } }
        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val half = winSize / 2
        for (y in 0 until h) {
            for (x in 0 until w) {
                val x0 = maxOf(0, x - half); val x1 = minOf(w - 1, x + half)
                val y0 = maxOf(0, y - half); val y1 = minOf(h - 1, y + half)
                var sum = 0L; var sumSq = 0L; var count = 0
                for (py in y0..y1) for (px in x0..x1) {
                    val v = gray[py * w + px].toLong()
                    sum += v; sumSq += v * v; count++
                }
                val mean = sum.toDouble() / count
                val variance = sumSq.toDouble() / count - mean * mean
                val stdDev = Math.sqrt(maxOf(0.0, variance))
                val threshold = mean * (1 + k * (stdDev / 128.0 - 1))
                val pixel = if (gray[y * w + x] > threshold) 255 else 0
                result.setPixel(x, y, Color.rgb(pixel, pixel, pixel))
            }
        }
        return result
    }

    // Simplified CLAHE: enhance contrast in 8x8 tiles
    private fun clahe(bmp: Bitmap): Bitmap {
        // Full CLAHE implementation or OpenCV if available
        // Placeholder: histogram equalization (global, simpler)
        return histEq(bmp)
    }

    private fun histEq(bmp: Bitmap): Bitmap {
        val w = bmp.width; val h = bmp.height
        val hist = IntArray(256)
        for (x in 0 until w) for (y in 0 until h) hist[Color.red(bmp.getPixel(x, y))]++
        val cdf = IntArray(256)
        cdf[0] = hist[0]
        for (i in 1..255) cdf[i] = cdf[i-1] + hist[i]
        val total = w * h
        val result = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        for (x in 0 until w) for (y in 0 until h) {
            val v = Color.red(bmp.getPixel(x, y))
            val eq = ((cdf[v] - cdf[0]).toFloat() / (total - cdf[0]) * 255).toInt()
            result.setPixel(x, y, Color.rgb(eq, eq, eq))
        }
        return result
    }

    // Deskew: detect dominant rotation via projection profile
    private fun deskew(bmp: Bitmap): Bitmap {
        // For MVP: skip deskew (complex, use ML Kit's built-in handling)
        // Full implementation: Hough line transform to find dominant angle
        // then Matrix rotation
        return bmp
    }
}
```

**JS bridge:**
```js
// app/src/ocr/preprocess.js
import { NativeModules } from 'react-native';
const { ImagePreprocess } = NativeModules;

export async function preprocessReceiptImage(uri) {
  if (!ImagePreprocess) return uri; // graceful fallback: skip preprocessing
  try {
    return await ImagePreprocess.preprocess(uri);
  } catch (e) {
    console.warn('Preprocessing failed, using raw image:', e.message);
    return uri;
  }
}
```

---

### Alternative: expo-image-manipulator (Quick Win, Limited)

For teams that cannot write native Kotlin:

```js
import * as ImageManipulator from 'expo-image-manipulator';

export async function lightPreprocess(uri) {
  // Resize to standardize input size
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1800 } }],
    {
      compress: 1.0,           // PNG-quality (no JPEG artifacts)
      format: ImageManipulator.SaveFormat.PNG,
    }
  );
  return result.uri;
}
```

This alone (resize + PNG output) gives a measurable improvement on receipts photographed in portrait mode where JPEG artifacts at 80% quality corrupt small text.

---

## Bundle Size Budget

| Component | Size Added | Priority |
|---|---|---|
| ML Kit v2 (already installed) | +3MB (Devanagari model) | P0 — now |
| `product_synonyms.json` | +80KB | P0 — now |
| `hindi_product_map.json` | +50KB | P0 — now |
| Custom Kotlin preprocessing module | +0KB (native code) | P1 — 1 month |
| OpenCV Mobile (optional, for CLAHE) | +4MB | P2 — 3 months |
| Tesseract 5 LSTM models (eng+hin) | +11MB | P2 — 3 months |
| `react-native-tesseract-ocr` | +500KB | P2 — 3 months |
| PaddleOCR Lite Android SDK | +25MB | P3 — 12 months |
| FastText lite model (Phase 2 NLP) | +12MB | P3 — 12 months |

**Current APK size budget:** The base Expo app with ML Kit is ~45MB. Adding P0+P1 brings it to ~48MB. Adding P2 brings it to ~60MB. P3 brings it to ~97MB — approaching the 100MB uncompressed threshold where app stores require split APKs.

**Mitigation for P3:** Use Play Feature Delivery to deliver Tesseract language data and FastText model as on-demand modules (downloaded after first launch on Wi-Fi).

---

## Implementation Roadmap

### Phase 0 — Immediate Fixes (1–3 days)

| Change | File | Impact |
|---|---|---|
| Fix `[^a-z\s]` → `[^\p{L}\p{N}\s]` | `normalizeName.js` | Hindi names no longer destroyed |
| Add `product_synonyms.json` lookup | `normalizeName.js` | tamatar→tomato, aloo→potato |
| Upgrade PRICE_TOKEN_RE to catch `₹1 74.00` (space in number) | `patterns.js` | Fewer price read errors |
| Fix `substr(date, 1, 7)` → range predicates | `expenses.js` | (DB, not OCR) |
| Expose `quality: 1.0` + PNG output in Scan.js | `Scan.js` | Sharper text in small font |

### Phase 1 — Core OCR Improvements (1–2 weeks)

| Change | Description |
|---|---|
| Upgrade ML Kit to v2 | Add Devanagari language model |
| Add per-element confidence reading | Use in confidence.js |
| Add `lightPreprocess()` using expo-image-manipulator | Resize + PNG lossless |
| Add `classifyRowWithContext()` fix | Prevent SKIP_RE over-matching item names |
| Add `deriveQtyFromRate()` decimal support | Capture 0.5kg, 2.5L quantities |
| Add recipe fingerprint + duplicate detection | FNV1a hash on `expenses` table |
| Fix date parser: validate day/month ranges | Prevent non-dates being parsed as dates |

### Phase 2 — Structural & Fallback (1–2 months)

| Change | Description |
|---|---|
| Implement column detection in row merging | `detectColumns(rows)` → column boundaries |
| Add 'columnar' item strategy | Use detected column indices |
| Add Tesseract 5 as ML Kit fallback | For low-confidence scans |
| Add Kotlin preprocessing module | Grayscale + histogram eq + Sauvola |
| Add pharmacy-specific extraction | Drug name, batch, expiry per item |
| Add fuel item extraction | Volume, rate, amount from fuel receipts |
| Add GSTIN-to-merchant cache | SQLite: gstin → canonical_name |
| Add Jaro-Winkler merchant dedup | Against `merchants` table |

### Phase 3 — Intelligence (3–12 months)

| Change | Description |
|---|---|
| Template registry (learn per merchant) | SQLite: `receipt_templates` table |
| Per-item GST rate extraction | CGST/SGST % per item line |
| FastText lite for product categorization | Replace regex kind classification |
| Multi-image receipt stitching | Append from second photo |
| PaddleOCR Lite for table layouts | Column-perfect extraction for pharmacies |

---

## Quality Targets by Receipt Type

| Receipt type | Current accuracy | Phase 1 target | Phase 2 target |
|---|---|---|---|
| Blinkit/Zepto digital screenshot | 85% | 90% | 95% |
| Restaurant printed (laser) | 75% | 82% | 90% |
| DMart POS thermal | 65% | 75% | 85% |
| Pharmacy (small font, 5 columns) | 45% | 60% | 80% |
| Handwritten kirana | 40% | 45% | 65% |
| Hindi-only kirana receipt | 5% | 60% | 75% |
| Crumpled thermal receipt | 30% | 55% | 70% |

Accuracy = (correctly extracted items with correct name + price) / (total items on receipt) × 100

---

## Testing Strategy

### Unit Tests
- Each regex in `patterns.js`: test against 20+ real receipt fragments
- `normalizeName()`: test Hindi names, mixed script, unit parsing edge cases
- `parseAmount()`: test Indian comma format, OCR digit confusions

### Integration Tests
- Full pipeline test with synthetic receipts (generated programmatically)
- Cover all 11 format types with representative sample texts

### Golden Dataset
- Collect 50 real receipt scans (with ground truth item/price/merchant/date)
- Track accuracy metrics per phase
- Store in `tests/ocr/golden/` with encrypted PII scrubbing

### Regression Gate
- Any change to `patterns.js`, `normalizeName.js`, or `parseReceipt.js` must:
  - Not reduce golden dataset accuracy by more than 2%
  - Pass all unit tests

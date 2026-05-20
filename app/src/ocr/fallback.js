// 4.21 — Tesseract fallback support: trigger heuristic + line-level merge.
//
// The fallback path (in ScanService.scanAndProcess) runs ML Kit, runs a probe
// parseReceipt, and if the result looks weak it runs Tesseract over the same
// preprocessed image, merges the two engines' line lists with the rules below,
// and re-parses. Engine choice is exposed on the parsed object as
// `parsed.engine = 'mlkit' | 'mlkit+tesseract'` so analytics / golden-dataset
// capture can record which engine produced the final result.
//
// Both functions are pure. No React, no native bridge, no DB.

// Heuristic — should we even attempt the Tesseract pass?
//
// The original spec ("ML Kit mean line confidence < 0.5") cannot fire today
// because the v2 ML Kit bridge does not surface per-element confidence (see
// textRecognition.js:14-34 and Decision log 2026-05-19 / 4.9). We trigger on
// parsed-output signals instead — cheap to compute since the probe parse has
// already run. Any one of the following flips the bill into fallback territory:
//
//   - rawLines.length < 5           (almost certainly a thumbnail / blur)
//   - parsed.confidence.overall < 0.5  (parse-time low-confidence label)
//   - 0 items extracted AND total ≤ 0  (extraction got nothing useful)
//   - 'Unknown store' merchant + thin OCR (< 15 lines) — likely a Devanagari
//     header ML Kit Latin couldn't read
//
// The 15-line guard on the merchant-only signal is deliberate — many valid
// retail receipts simply lack a recognisable merchant header (handwritten
// kirana bills); we don't want to penalise those just because the merchant
// slot fell back to default.
export function shouldFallback(parsed, lines) {
  if (!parsed || !lines) return false;
  const lineCount = lines.length;
  const overall = parsed.confidence?.overall;
  const itemCount = parsed.items?.length || 0;
  const total = parsed.total || 0;
  const merchant = parsed.merchant || '';

  if (lineCount < 5) return true;
  if (typeof overall === 'number' && overall < 0.5) return true;
  if (itemCount === 0 && total <= 0) return true;
  if (merchant === 'Unknown store' && lineCount < 15) return true;
  return false;
}

// Detect whether a string contains any non-Latin script characters worth
// preferring Tesseract for. The use case is "ML Kit saw 'XX' but Tesseract
// saw 'पतंजलि' for the same row" — Tesseract wins because the script is what
// it was bundled for.
const NON_LATIN_RE = /[ऀ-ॿ஀-௿ఀ-౿ঀ-৿]/;
// Devanagari (0900) · Tamil (0B80) · Telugu (0C00) · Bengali (0980).

function hasNonLatin(s) {
  return typeof s === 'string' && NON_LATIN_RE.test(s);
}

// Two lines overlap vertically if their y-boxes share ≥ 50% of the smaller
// height — same rule mergeIntoRows uses for column-merging.
function yOverlapRatio(a, b) {
  const ah = a.height || 20;
  const bh = b.height || 20;
  const aTop = a.y;
  const aBot = a.y + ah;
  const bTop = b.y;
  const bBot = b.y + bh;
  const overlap = Math.max(0, Math.min(aBot, bBot) - Math.max(aTop, bTop));
  const minH = Math.max(1, Math.min(ah, bh));
  return overlap / minH;
}

// Merge ML Kit + Tesseract line lists into a single list ready for parseReceipt.
//
// Rules (in order of precedence):
//   1. For each ML Kit line, find the Tesseract line with the best y-overlap.
//   2. If overlap ≥ 0.5 AND Tesseract version has non-Latin chars AND ML Kit
//      version is pure-Latin → swap in the Tesseract line (mark `swapped: true`).
//   3. Otherwise keep the ML Kit line (ML Kit's frames are reliable, its Latin
//      text is generally cleaner than Tesseract's).
//   4. Any Tesseract line with no ≥0.5 overlap against any ML Kit line is
//      appended (Tesseract found text ML Kit missed entirely).
//
// The output is sorted top-to-bottom, left-to-right — same ordering invariant
// as extractLines() in textRecognition.js.
export function mergeEngineResults(mlkitLines, tessLines) {
  if (!Array.isArray(mlkitLines)) mlkitLines = [];
  if (!Array.isArray(tessLines)) tessLines = [];
  if (!tessLines.length) return mlkitLines.slice();
  if (!mlkitLines.length) return tessLines.slice();

  const usedTess = new Array(tessLines.length).fill(false);
  const merged = [];

  for (const m of mlkitLines) {
    let bestIdx = -1;
    let bestRatio = 0;
    for (let i = 0; i < tessLines.length; i++) {
      if (usedTess[i]) continue;
      const r = yOverlapRatio(m, tessLines[i]);
      if (r > bestRatio) {
        bestRatio = r;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestRatio >= 0.5) {
      const t = tessLines[bestIdx];
      usedTess[bestIdx] = true;
      if (hasNonLatin(t.text) && !hasNonLatin(m.text)) {
        // Keep ML Kit's frame (more reliable), Tesseract's text (correct script).
        merged.push({ ...m, text: t.text, swapped: true });
      } else {
        merged.push(m);
      }
    } else {
      merged.push(m);
    }
  }

  for (let i = 0; i < tessLines.length; i++) {
    if (!usedTess[i]) merged.push(tessLines[i]);
  }

  merged.sort((a, b) => a.y - b.y || a.x - b.x);
  return merged;
}

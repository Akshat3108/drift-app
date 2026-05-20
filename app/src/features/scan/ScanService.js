import { recognize, extractLines } from '@ocr/textRecognition';
import { parseReceipt, recalcItem } from '@ocr/parseReceipt';
import { lightPreprocess } from '@ocr/preprocess';
import { fingerprintReceipt, softFingerprint } from '@ocr/fingerprint';
import { TesseractEngine } from '@ocr/tesseract';
import { shouldFallback, mergeEngineResults } from '@ocr/fallback';
import { merchants } from '@features/expenses/merchants.repo';
import { templates, parseColumnMap } from '@features/scan/templates.repo';
import { mergePages } from '@ocr/stitchPages';

// Re-export the per-row recompute helper so Scan.js consumers don't reach
// into @ocr/parseReceipt directly. Keeps the service the single import the
// Scan UI needs.
export { recalcItem };

// Maps detected receipt format → regex picking the best-fit category by name.
// Produce-heavy carts override to grocery regardless of format.
const CATEGORY_MATCHERS = {
  fuel:           /transport|fuel/i,
  transport:      /transport|fuel/i,
  pharmacy:       /health|pharm|medic/i,
  restaurant:     /food|drink|dining|eat/i,
  food_delivery:  /food|drink|dining|eat/i,
  departmental:   /grocer/i,
  quick_commerce: /grocer/i,
  utility:        /bill|utilit/i,
  online_retail:  /shop|fun|fashion/i,
};

// Picks the best-fit category id for a parsed receipt against the current
// pots. Returns the first pot's id as a fallback, or null if no pots exist.
export function guessCategoryId(parsed, pots) {
  const produceHeavy = parsed.items?.some(i => i.kind === 'produce');
  const matcher = produceHeavy ? /grocer/i : CATEGORY_MATCHERS[parsed.format];
  const guess = matcher ? pots.find(p => matcher.test(p.name))?.id : null;
  return guess || pots[0]?.id || null;
}

// Pure transformation: takes an already-parsed receipt + the pots list,
// returns the review-stage payload Scan.js renders. No React, no side
// effects, no DB. Split out from processReceipt() in 4.21 so the fallback
// pipeline in scanAndProcess() can build the payload from a re-parse of
// merged ML Kit + Tesseract lines without re-parsing twice.
export function buildReviewPayload(parsed, pots) {
  const total = parsed.total || parsed.items.reduce((s, i) => s + i.price, 0);
  return {
    merchant: parsed.merchant,
    date: parsed.date,
    items: parsed.items,
    total,
    formatLabel: parsed.formatLabel || '',
    format: parsed.format,
    confidence: parsed.confidence || null,
    fees: parsed.fees || [],
    suggestedPotId: guessCategoryId(parsed, pots),
    // 4.8 tax-invoice fields — passed through to the Scan save path. Each
    // is nullable; UI surfacing lives in 5.11.
    gstin: parsed.gstin || null,
    invoiceNumber: parsed.invoiceNumber || null,
    cgst: parsed.cgst ?? null,
    sgst: parsed.sgst ?? null,
    igst: parsed.igst ?? null,
    // 4.14 — receipt fingerprints. Stored on the expense row at save time
    // so future scans can dedup. Hashes are computed from the parsed
    // payload (not the OCR text) so post-edit overrides on the review
    // screen invalidate the hash before save — see Scan.js where we
    // recompute on the in-memory parsed shape just prior to dedup check.
    receiptHash: fingerprintReceipt(parsed),
    receiptSoftHash: softFingerprint(parsed),
  };
}

// Back-compat wrapper. Callers (tests, debug consoles, future batch
// importers) that pass a raw ML Kit OCR result keep working unchanged.
export function processReceipt(ocr, pots) {
  return buildReviewPayload(parseReceipt(ocr), pots);
}

// Re-export the fingerprint helpers so Scan.js can recompute after the user
// edits merchant/date/total/items on the review screen.
export { fingerprintReceipt, softFingerprint };

// Full pipeline: light-preprocess the image, run ML Kit, run a probe parse,
// optionally fall back to Tesseract + merge + re-parse (4.21), then build
// the review payload. Async wrapper for the typical Scan flow; tests can
// bypass by calling processReceipt directly with a stubbed OCR payload.
//
// Fallback discipline: a Tesseract-augmented re-parse only displaces the
// ML Kit result when the merged confidence is at least as high. This means
// a noisy Tesseract pass can never *degrade* an existing weak-but-valid
// ML Kit parse — worst case it's wasted work, never a regression.
//
// Engine choice is exposed as `processed.engine` ('mlkit' | 'mlkit+tesseract')
// so the 4.19 golden-capture pipeline can label fixtures with which engine
// produced them, and so analytics / Decision-log entries downstream can
// reason about which receipts triggered the heavier path.
//
// The raw ML Kit OCR is attached as `_ocr` so the Scan screen can pass it
// to the 4.19 golden-candidate capture pipeline on save. It's not part of
// the review-payload contract (callers should ignore it unless they're the
// capture path).
export async function scanAndProcess(uri, pots) {
  const preprocessed = await lightPreprocess(uri);
  const mlkitOcr = await recognize(preprocessed);
  const mlkitLines = extractLines(mlkitOcr);

  // ── Probe parse ───────────────────────────────────────────────────────
  let parsed = parseReceipt(mlkitLines);
  let engine = 'mlkit';
  let templateApplied = false;

  // ── 4.22 — Template apply path ────────────────────────────────────────
  // Resolve the merchant once (this may INSERT a new merchants row if it's
  // the first scan of this merchant — that's fine, expenses.createWithItems
  // bypasses re-resolve when expense.merchant_id is supplied at save time).
  // Then look up the learned template; if it's accumulated >= 3 samples,
  // re-parse with the template. Regression-safety: only swap in the
  // templated parse when its confidence is at least as high as the probe.
  let merchantId = null;
  try {
    merchantId = await merchants.resolve(parsed.merchant);
  } catch {
    // resolve is best-effort here; a failed lookup just means no template
    // applies. The save-time resolve in expenses.createWithItems is the
    // canonical write path.
    merchantId = null;
  }
  const tplRow = merchantId ? await safeGetTemplate(merchantId) : null;
  const tplWithColumns = tplRow && tplRow.sample_count >= templates.ACTIVATION_SAMPLES
    ? { ...tplRow, columnMapParsed: parseColumnMap(tplRow.column_map) }
    : null;

  if (tplWithColumns) {
    const templated = parseReceipt(mlkitLines, { template: tplWithColumns });
    const prior = parsed.confidence?.overall ?? 0;
    const after = templated.confidence?.overall ?? 0;
    if (after >= prior) {
      parsed = templated;
      templateApplied = true;
    }
  }

  // ── 4.21 — Tesseract fallback (now template-aware) ────────────────────
  if (shouldFallback(parsed, mlkitLines)) {
    const tess = await TesseractEngine.recognize(preprocessed);
    if (tess.available && tess.lines.length > 0) {
      const merged = mergeEngineResults(mlkitLines, tess.lines);
      const opts = tplWithColumns ? { template: tplWithColumns } : {};
      const reparsed = parseReceipt(merged, opts);
      const prior = parsed.confidence?.overall ?? 0;
      const after = reparsed.confidence?.overall ?? 0;
      if (after >= prior) {
        parsed = reparsed;
        engine = 'mlkit+tesseract';
        if (tplWithColumns) templateApplied = true;
      }
    }
  }

  parsed.engine = engine;
  const processed = buildReviewPayload(parsed, pots);
  processed.engine = engine;
  processed.merchantId = merchantId;
  processed.templateApplied = templateApplied;
  processed._ocr = mlkitOcr;
  // 4.22 — capture-time payload for templates.recordSample(). Scan.js
  // pulls this off the processed object after a successful save. We
  // include it under an underscore-prefixed key so it's a clear signal
  // the field is internal and not part of the review-payload contract.
  processed._parsedForTemplate = {
    format: parsed.format,
    bands: parsed.bands,
    columns: parsed.columns,
    confidence: parsed.confidence,
  };
  // 4.24 — full parsed payload exposed for multi-page stitching. The
  // Scan screen stashes this per-page snapshot in a ref so a later
  // scanAndProcessMore() call can re-merge from scratch. Same internal-
  // only underscore convention as _ocr / _parsedForTemplate.
  processed._parsed = parsed;
  return processed;
}

// 4.24 — Multi-image stitching pipeline. Runs the full single-page OCR
// pipeline (lightPreprocess → ML Kit → optional Tesseract fallback →
// optional template apply) on a new image, then mergePages() merges its
// parsed shape with the prior pages. Returns the new processed review
// payload + the updated pages array for the caller to stash. The Scan
// screen owns the pages array (state lives in a useRef there); this
// helper is stateless.
//
// Order matters: pages must be passed in capture order. The merge rule
// for total is "last page wins if > 0" — the last page in `priorPages +
// newPage` is the latest scan, so that's the natural ordering.
export async function scanAndProcessMore(uri, priorPages, pots) {
  const newPageProcessed = await scanAndProcess(uri, pots);
  const newParsed = newPageProcessed._parsed;
  const updatedPages = [...(priorPages || []), newParsed];
  const merged = mergePages(updatedPages);
  const review = buildReviewPayload(merged, pots);
  // Carry forward the per-page diagnostics. merchantId comes from the
  // latest page's merchants.resolve (idempotent — same printed merchant
  // resolves to the same id every time via JW ≥ 0.92); engine and
  // templateApplied reflect the LATEST page since they're per-page
  // signals, not aggregate.
  review.engine = newPageProcessed.engine;
  review.merchantId = newPageProcessed.merchantId;
  review.templateApplied = newPageProcessed.templateApplied;
  review._ocr = newPageProcessed._ocr;          // last page's OCR only
  review._parsed = merged;
  review._parsedForTemplate = {
    format: merged.format,
    bands: merged.bands,
    columns: merged.columns,
    confidence: merged.confidence,
  };
  review._pages = updatedPages;
  review._pageCount = updatedPages.length;
  return review;
}

// templates.getByMerchant wrapped so a DB hiccup never blocks scanning.
// A missing template is the common case; treating a query error the same
// as "no template" keeps the fallback path safe.
async function safeGetTemplate(merchantId) {
  try {
    return await templates.getByMerchant(merchantId);
  } catch {
    return null;
  }
}

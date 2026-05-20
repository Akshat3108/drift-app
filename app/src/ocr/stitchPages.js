// 4.24 — Multi-image receipt stitching.
//
// Long DMart / pharmacy receipts don't fit in one photo (the user can
// capture ~60-70% of a 30-item bill legibly per shot — see problems.md
// W3). This module merges multiple per-page parseReceipt() outputs into a
// single parsed shape ready for buildReviewPayload() and save.
//
// Inputs: ParsedReceipt[] in CAPTURE order (page 1, page 2, ...).
// Output: a single ParsedReceipt with deduped items + best-of headers +
// reconciled total + freshly-scored confidence.
//
// Item dedup rule (Step 2 choice): normalized_name + |price diff| ≤ 0.01.
// Each output item is annotated with `_pageId` (index in input pages) and
// `_origIdx` (position within that page's items) so the Scan screen can
// preserve user edits across re-merges when a new page is added.
//
// Pure JS — no React, no DB, no native. The scoreConfidence import is the
// only outside reference (we re-score on the merged shape because individual
// page confidences don't compose linearly).

import { scoreConfidence } from './confidence';

const PRICE_EPS = 0.01;

function isFiniteNumber(n) { return typeof n === 'number' && Number.isFinite(n); }

// Walk pages in order, append each page's items, skip later-page items that
// already exist in the working list (same normalized_name + price within
// PRICE_EPS). Annotates every kept item with _pageId / _origIdx so the
// caller can map back to which page the item came from — required for
// edit-preservation in the Scan UI.
function dedupItems(pages) {
  const out = [];
  for (let pi = 0; pi < pages.length; pi++) {
    const items = pages[pi]?.items || [];
    for (let oi = 0; oi < items.length; oi++) {
      const it = items[oi];
      if (!it || !it.normalized_name) continue;
      const price = isFiniteNumber(it.price) ? it.price : 0;
      const dup = out.find(o =>
        o.normalized_name === it.normalized_name &&
        Math.abs((o.price || 0) - price) <= PRICE_EPS
      );
      if (dup) continue;
      out.push({ ...it, _pageId: pi, _origIdx: oi });
    }
  }
  return out;
}

// Pick the page with the highest formatConfidence whose `field` is truthy
// (non-empty string, non-zero number, non-null object). Falls back to the
// first page with a truthy value, then null. `defaultsToSkip` lets us
// treat a parseReceipt fallback (e.g. merchant='Unknown store') as if it
// were empty.
function pickBestHeader(pages, field, defaultsToSkip = []) {
  let best = null;
  let bestConf = -1;
  for (const p of pages) {
    if (!p) continue;
    const v = p[field];
    if (v == null) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) continue;
      if (defaultsToSkip.includes(t)) continue;
    }
    if (typeof v === 'number' && !isFiniteNumber(v)) continue;
    const conf = isFiniteNumber(p.formatConfidence) ? p.formatConfidence : 0;
    if (conf > bestConf) {
      bestConf = conf;
      best = v;
    }
  }
  return best;
}

// Pick the merged total. Spec: last-page total wins if > 0; otherwise sum
// of merged items (after dedup). This is robust against intermediate
// per-page subtotals being miscategorised as totals, while still surviving
// pages that printed no total at all.
function pickTotal(pages, mergedItems) {
  for (let i = pages.length - 1; i >= 0; i--) {
    const t = pages[i]?.total;
    if (isFiniteNumber(t) && t > 0) return +t.toFixed(2);
  }
  const sum = mergedItems.reduce((s, it) => s + (isFiniteNumber(it?.price) ? it.price : 0), 0);
  return +sum.toFixed(2);
}

// Pick a per-component bill-level number (cgst/sgst/igst/subtotal/tax)
// from the page that has the highest formatConfidence AND a non-zero value.
// Same picker as pickBestHeader but tuned for amounts.
function pickAmount(pages, field) {
  let best = null;
  let bestConf = -1;
  for (const p of pages) {
    if (!p) continue;
    const v = p[field];
    if (!isFiniteNumber(v) || v <= 0) continue;
    const conf = isFiniteNumber(p.formatConfidence) ? p.formatConfidence : 0;
    if (conf > bestConf) {
      bestConf = conf;
      best = v;
    }
  }
  return best;
}

export function mergePages(pages) {
  const safe = Array.isArray(pages) ? pages.filter(Boolean) : [];
  if (safe.length === 0) return null;
  if (safe.length === 1) {
    // Single page — preserve identity but still tag items so the Scan UI
    // edit-preservation path works uniformly (every item has _pageId=0).
    const p = safe[0];
    const items = (p.items || []).map((it, oi) => ({ ...it, _pageId: 0, _origIdx: oi }));
    return { ...p, items };
  }

  const items = dedupItems(safe);

  // Headers — choose best per field. Default skips reflect the parser's
  // fallback shapes (`Unknown store`, fallback date) so we don't anchor on
  // a placeholder when a real value exists on a different page.
  const fallbackDate = safe[0]?._fallbackDate;
  const merchant = pickBestHeader(safe, 'merchant', ['Unknown store']) || 'Unknown store';
  const date = pickBestHeader(safe, 'date', fallbackDate ? [fallbackDate] : []) || fallbackDate || safe[safe.length - 1]?.date;

  const gstin = pickBestHeader(safe, 'gstin');
  const orderId = pickBestHeader(safe, 'orderId');
  const invoiceNumber = pickBestHeader(safe, 'invoiceNumber');

  // Currency / format / formatLabel / brand: take from the highest-conf
  // page that has them.
  const currency = pickBestHeader(safe, 'currency');
  const format = pickBestHeader(safe, 'format') || 'generic';
  const formatLabel = pickBestHeader(safe, 'formatLabel') || 'Generic';
  const brand = pickBestHeader(safe, 'brand');

  const subtotal = pickAmount(safe, 'subtotal') || 0;
  const tax = pickAmount(safe, 'tax') || 0;
  const cgst = pickAmount(safe, 'cgst');
  const sgst = pickAmount(safe, 'sgst');
  const igst = pickAmount(safe, 'igst');

  const total = pickTotal(safe, items);

  // Fees and discounts: union (concat), no dedup — these are typically
  // unique per page. If a page is captured twice the user can edit.
  const fees = safe.flatMap(p => Array.isArray(p.fees) ? p.fees : []);
  const discounts = safe.flatMap(p => Array.isArray(p.discounts) ? p.discounts : []);

  // formatConfidence: max across pages (the strongest signal wins).
  const formatConfidence = safe.reduce((m, p) =>
    Math.max(m, isFiniteNumber(p?.formatConfidence) ? p.formatConfidence : 0), 0);

  // Capture-side material (4.22 templates): take from the last page that
  // has it, mirroring "last page wins" for write semantics.
  let bands = null;
  let columns = null;
  for (let i = safe.length - 1; i >= 0; i--) {
    if (!bands && safe[i].bands) bands = safe[i].bands;
    if (!columns && Array.isArray(safe[i].columns)) columns = safe[i].columns;
    if (bands && columns) break;
  }

  const merged = {
    merchant,
    date,
    _fallbackDate: fallbackDate,
    total,
    subtotal,
    tax,
    currency,
    items,
    fees,
    discounts,
    format,
    formatLabel,
    brand,
    formatConfidence,
    gstin,
    orderId,
    invoiceNumber,
    cgst,
    sgst,
    igst,
    bands,
    columns,
    _pageCount: safe.length,
  };

  merged.confidence = scoreConfidence(merged);
  return merged;
}

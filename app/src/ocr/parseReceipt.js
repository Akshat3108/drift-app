import { extractLines } from './textRecognition';
import { PRODUCE } from '../core/domain/produce';
import { toCanonical } from '../core/domain/units';
import { normalizeName } from '../core/domain/normalize';
import { normaliseDateParts } from '../core/domain/date';
import { detectFormat, FORMAT_CONFIGS } from './detectFormat';
import { scoreConfidence } from './confidence';
import { detectColumns, tokenColumn } from './columns';
import {
  PRICE_TOKEN_RE,
  CURRENCY_RE,
  detectCurrency,
  DATE_RE,
  MONTH_DATE_RE,
  MONTHS,
  GSTIN_RE,
  FSSAI_RE,
  HSN_RE,
  ORDER_ID_RE,
  INVOICE_NO_RE,
  CGST_AMOUNT_RE,
  SGST_AMOUNT_RE,
  IGST_AMOUNT_RE,
  ITEM_CGST_RATE_RE,
  ITEM_SGST_RATE_RE,
  ITEM_IGST_RATE_RE,
  ITEM_GST_RATE_RE,
  BATCH_RE,
  EXPIRY_RE,
  MFG_RE,
  TOTAL_RE,
  SUBTOTAL_RE,
  TAX_RE,
  FEE_RE,
  DISCOUNT_RE,
  META_RE,
  BILL_HDR_RE,
  SKIP_RE,
  matchBrand,
  matchAmounts,
  pickAmount,
  parseAmount,
  looksLikeQtyOnly,
  looksLikeMetaOnly,
} from './patterns';

// ── Row merging ─────────────────────────────────────────────────────────────
// Combine OCR lines that share a baseline (two-column layouts) into single
// logical rows. Uses y-box overlap rather than centerline distance so the
// match is robust to differing font sizes within the same row (e.g. small
// "qty" text vs. larger "price" text on quick-commerce cards).
function mergeIntoRows(lines) {
  if (!lines.length) return lines;
  const sorted = lines.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const groups = [];
  for (const l of sorted) {
    const h = l.height || 20;
    const top = l.y;
    const bot = l.y + h;
    let placed = false;
    for (const g of groups) {
      const overlap = Math.max(0, Math.min(bot, g.bot) - Math.max(top, g.top));
      const minH = Math.max(1, Math.min(g.height, h));
      if (overlap / minH >= 0.5) {
        g.items.push(l);
        g.top = Math.min(g.top, top);
        g.bot = Math.max(g.bot, bot);
        g.height = Math.max(g.height, h);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push({ items: [l], top, bot, height: h });
  }
  return groups.map(g => {
    const sortedItems = g.items.slice().sort((a, b) => a.x - b.x);
    // 4.12 — Flatten per-line elements into a single per-row token list so
    // detectColumns can build an x-axis histogram. When element data is
    // absent we synthesise a single token from the whole-line frame so the
    // row still contributes to the histogram (coarser but not blank).
    const tokens = [];
    for (const ln of sortedItems) {
      const els = Array.isArray(ln.elements) ? ln.elements : [];
      if (els.length) {
        for (const el of els) {
          if (!el?.text) continue;
          tokens.push({ text: el.text, x: el.x ?? ln.x, width: el.width || 0 });
        }
      } else {
        tokens.push({ text: ln.text, x: ln.x ?? 0, width: ln.width || 0 });
      }
    }
    return {
      text: sortedItems.map(i => i.text).join(' '),
      parts: sortedItems.map(i => i.text),
      tokens,
      x: Math.min(...sortedItems.map(i => i.x ?? 0)),
      y: g.top,
      width: 0,
      height: g.height,
    };
  });
}

// ── Row classification ──────────────────────────────────────────────────────
// Order matters here — subtotals/totals share the word "total", so we test
// the more specific keyword set first. See patterns.js for the regexes.
//
// Price-position rule: a row is only classified as total/subtotal/tax/fee/
// discount when its matched amount sits at the END of the line — either the
// last 30% by character position, or as the row's only amount. Mid-line
// prices on lines that incidentally mention "total" or "tax" (e.g. an item
// named "Total Mix Snack 4 x 50 200") fall through to `item`. bill_header
// and meta classifications stay pure-text — they don't carry amounts.
const TRAILING_PRICE_THRESHOLD = 0.7;

function hasTrailingPrice(text, amounts) {
  if (!amounts || !amounts.length) return false;
  if (amounts.length === 1) return true;
  const last = amounts[amounts.length - 1];
  const trimmedLength = text.replace(/\s+$/, '').length || text.length;
  return last.start / trimmedLength >= TRAILING_PRICE_THRESHOLD;
}

export function classifyRowWithContext(text, amounts) {
  if (BILL_HDR_RE.test(text)) return 'bill_header';
  if (META_RE.test(text))     return 'meta';
  const amts = amounts ?? matchAmounts(text);
  const trailing = hasTrailingPrice(text, amts);
  if (SUBTOTAL_RE.test(text)) return trailing ? 'subtotal' : 'item';
  if (DISCOUNT_RE.test(text)) return trailing ? 'discount' : 'item';
  if (TOTAL_RE.test(text))    return trailing ? 'total'    : 'item';
  if (TAX_RE.test(text))      return trailing ? 'tax'      : 'item';
  if (FEE_RE.test(text))      return trailing ? 'fee'      : 'item';
  return 'item';
}

// ── Date extraction ─────────────────────────────────────────────────────────
// Walks every DATE_RE / MONTH_DATE_RE match and returns the first one that
// passes validateDateParts. This lets "32/13/2026" (invalid) fall through to
// a later valid match on the same receipt instead of poisoning the result.
function findDate(text) {
  const reDigits = new RegExp(DATE_RE.source, 'g');
  let m;
  while ((m = reDigits.exec(text)) !== null) {
    const iso = normaliseDateParts(m[1], m[2], m[3]);
    if (iso) return iso;
  }
  const reMonth = new RegExp(MONTH_DATE_RE.source, 'gi');
  while ((m = reMonth.exec(text)) !== null) {
    // Either "12 May 2026" (groups 1-3) or "May 12, 2026" (groups 4-6).
    let day, monthWord, year;
    if (m[1]) { day = m[1]; monthWord = m[2]; year = m[3]; }
    else      { monthWord = m[4]; day = m[5]; year = m[6]; }
    const mi = MONTHS.indexOf(String(monthWord).toLowerCase().slice(0, 3));
    if (mi < 0 || !day) continue;
    const y = year ? Number(year) : new Date().getFullYear();
    const iso = normaliseDateParts(day, mi + 1, y);
    if (iso) return iso;
  }
  return null;
}

// ── Merchant extraction ─────────────────────────────────────────────────────
// Strategy: (1) prefer a known brand if we recognized one; (2) fall back to
// the top-most non-metadata, non-numeric line in the top 25% of the
// receipt. We prefer top-most-y over longest because the store name almost
// always comes first; longer lines tend to be addresses.
function extractMerchant(rows, brand, minY, rangeY) {
  if (brand) return brand;
  const candidates = rows
    .filter(l => (l.y - minY) / rangeY < 0.25 && l.text.length > 1)
    .filter(l => !looksLikeMetaOnly(l.text))
    .filter(l => !matchAmounts(l.text).length)
    .filter(l => classifyRowWithContext(l.text) === 'item')
    .filter(l => {
      // Skip lines dominated by digits (addresses, phone numbers, dates).
      const letters = (l.text.match(/[a-z]/gi) || []).length;
      const digits  = (l.text.match(/\d/g) || []).length;
      return letters >= 3 && letters > digits;
    });
  if (!candidates.length) return 'Unknown store';
  candidates.sort((a, b) => a.y - b.y);
  return candidates[0].text.replace(/\s+/g, ' ').slice(0, 60);
}

function extractOrderId(text) {
  const m = text.match(ORDER_ID_RE);
  return m ? m[1] : null;
}

function extractGstin(text) {
  const m = text.match(GSTIN_RE);
  return m ? m[0] : null;
}

function extractInvoiceNumber(text) {
  const m = text.match(INVOICE_NO_RE);
  return m ? m[1] : null;
}

function extractHsn(text) {
  const m = text.match(HSN_RE);
  return m ? m[1] : null;
}

function parseTaxAmountMatch(m) {
  if (!m) return null;
  const intPart = String(m[1] ?? '').replace(/,/g, '');
  const frac = m[2] ?? '';
  const v = parseFloat(frac ? `${intPart}.${frac}` : intPart);
  return isFinite(v) ? v : null;
}

function extractTaxBreakdown(text) {
  return {
    cgst: parseTaxAmountMatch(text.match(CGST_AMOUNT_RE)),
    sgst: parseTaxAmountMatch(text.match(SGST_AMOUNT_RE)),
    igst: parseTaxAmountMatch(text.match(IGST_AMOUNT_RE)),
  };
}

// ── Bill totals ─────────────────────────────────────────────────────────────
// Find total / subtotal / tax / fees / discounts using row classification.
// Honors per-format priority lists from the format config.
function findPriority(candidates, priority) {
  if (!candidates.length) return null;
  for (const key of priority) {
    const re = new RegExp(`\\b${key.replace(/\s+/g, '\\s*')}\\b`, 'i');
    const hit = candidates.find(c => re.test(c.text));
    if (hit) return hit;
  }
  return candidates[candidates.length - 1];
}

function extractBillTotals(rows, config) {
  const buckets = { total: [], subtotal: [], tax: [], fee: [], discount: [] };
  for (const r of rows) {
    const amounts = matchAmounts(r.text);
    if (!amounts.length) continue;
    const cls = classifyRowWithContext(r.text, amounts);
    if (!buckets[cls]) continue;
    const amt = amounts[amounts.length - 1];
    buckets[cls].push({ row: r, text: r.text, value: amt.absValue, signed: amt.value, y: r.y });
  }

  const totalHit    = findPriority(buckets.total,    config.totalPriority || []);
  const subtotalHit = findPriority(buckets.subtotal, config.subtotalPriority || []);

  // Sum taxes (CGST+SGST+IGST commonly split).
  const tax = buckets.tax.reduce((s, t) => s + t.value, 0);

  const labelOf = (text, fallback) => {
    const m = text.match(/^([^\d₹$€£¥+\-]*)/);
    const label = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    return (label || fallback).slice(0, 30);
  };

  const fees = buckets.fee.map(f => ({
    label: labelOf(f.text, 'Fee'),
    amount: f.value,
  }));

  const discounts = buckets.discount.map(d => ({
    label: labelOf(d.text, 'Discount'),
    amount: d.value,
  }));

  return {
    total: totalHit ? totalHit.value : NaN,
    totalY: totalHit ? totalHit.y : null,
    subtotal: subtotalHit ? subtotalHit.value : NaN,
    tax,
    fees,
    discounts,
  };
}

// ── Helpers for item extraction ─────────────────────────────────────────────
function findNameBackward(rows, idx, opts = {}) {
  const { maxSteps = 4, stopOnSkip = true } = opts;
  for (let j = idx - 1; j >= 0 && j >= idx - maxSteps; j--) {
    const prev = rows[j];
    if (!prev) break;
    if (stopOnSkip && SKIP_RE.test(prev.text)) break;
    if (matchAmounts(prev.text).length) continue;
    const candidate = prev.text.replace(/[₹$€£¥]/g, '').trim();
    if (candidate.length < 3) continue;
    if (!/[a-z]/i.test(candidate)) continue;
    if (looksLikeQtyOnly(candidate)) continue;
    if (looksLikeMetaOnly(candidate)) continue;
    return candidate;
  }
  return null;
}

function findQtyForward(rows, idx, bandBottom) {
  for (let j = idx + 1; j < rows.length && j <= idx + 2; j++) {
    const next = rows[j];
    if (!next) break;
    if (next.y > bandBottom) break;
    if (SKIP_RE.test(next.text)) break;
    if (matchAmounts(next.text).length) break;
    if (looksLikeQtyOnly(next.text)) return next.text.trim();
  }
  return null;
}

// ── Qty derivation ──────────────────────────────────────────────────────────
// When a row carries "qty × rate = amount" the OCR'd qty may be missing or
// noisy; we recover it by dividing amount/rate. Returns `{qty, unit}` or null.
//
// Three paths in priority order:
//   1. Integer snap (retail qty 1..99 sold by piece) → unit='pcs'.
//   2. Fractional snap {0.25, 0.5, 0.75} (half-dozen, quarter-pack) → unit='pcs'.
//   3. Decimal weight (sabzi-mandi / butcher / produce sold by weight) →
//      unit='kg'. Gated by `qty × rate ≈ amount within 5 paise` AND derived
//      in [0.01, 10] kg.
//
// Path 1/2 use a relative 5% tolerance so 0.249 → 0.25 but 0.30 returns null.
// Path 3 uses an absolute amount tolerance because the receipt itself rounds.
const FRACTIONAL_SNAPS = [0.25, 0.5, 0.75];
const SNAP_TOLERANCE = 0.05;        // relative
const WEIGHT_AMOUNT_TOL = 0.05;     // absolute rupees — receipt rounding

export function deriveQtyFromRate(amount, rate) {
  if (!isFinite(amount) || !isFinite(rate) || rate <= 0) return null;
  const derived = amount / rate;
  if (!isFinite(derived) || derived < 0.01 || derived > 100) return null;

  // Each snap candidate has to reconcile: candidate × rate ≈ amount inside
  // receipt-rounding tolerance. Otherwise 0.785 (the actual weight) would
  // wrongly snap to 0.75 just because they're within 5% of each other.
  const reconciles = (v) => Math.abs(+(v * rate).toFixed(2) - amount) <= WEIGHT_AMOUNT_TOL;

  // Integer snap (retail qty 1..99 — the common case).
  const rounded = Math.round(derived);
  if (rounded >= 1 && rounded <= 99
      && Math.abs(derived - rounded) / rounded <= SNAP_TOLERANCE
      && reconciles(rounded)) {
    return { qty: rounded, unit: 'pcs' };
  }
  // Sub-unit fraction snap (0.25, 0.5, 0.75 — half-kg sugar, quarter dozen, etc.).
  let best = null;
  let bestDelta = Infinity;
  for (const frac of FRACTIONAL_SNAPS) {
    const delta = Math.abs(derived - frac) / frac;
    if (delta <= SNAP_TOLERANCE && delta < bestDelta && reconciles(frac)) {
      best = frac;
      bestDelta = delta;
    }
  }
  if (best != null) return { qty: best, unit: 'pcs' };

  // Decimal weight path (mandi / butcher / produce). qty in kg with 3 decimals;
  // the receipt's amount = qty × rate already rounded. By construction
  // reconciles(derived) is true (derived = amount/rate); the bounds check
  // is what gates this path.
  if (derived >= 0.01 && derived <= 10) {
    return { qty: +derived.toFixed(3), unit: 'kg' };
  }
  return null;
}

// 4.17 — per-item GST rate extraction. Scans `text` for explicit CGST/SGST/IGST
// rates and (separately) a combined "GST N%" mention. The explicit rates are
// applied directly; the combined rate is parked on `_combinedGstRate` for the
// orchestrator to disambiguate against bill-level context (intrastate vs
// interstate) after all items are extracted.
function extractItemGstRates(text) {
  if (!text) return null;
  const cgstM = text.match(ITEM_CGST_RATE_RE);
  const sgstM = text.match(ITEM_SGST_RATE_RE);
  const igstM = text.match(ITEM_IGST_RATE_RE);
  const gstM  = text.match(ITEM_GST_RATE_RE);
  const cgst = cgstM ? parseFloat(cgstM[1]) : null;
  const sgst = sgstM ? parseFloat(sgstM[1]) : null;
  const igst = igstM ? parseFloat(igstM[1]) : null;
  const combined = gstM ? parseFloat(gstM[1]) : null;
  if (cgst == null && sgst == null && igst == null && combined == null) return null;
  return { cgst_rate: cgst, sgst_rate: sgst, igst_rate: igst, _combined: combined };
}

function buildItem(nameText, price, opts = {}) {
  const { normalized_name, qty, unit, display_name } =
    normalizeName(opts.namePreNormalize ?? nameText);
  if (!normalized_name) return null;
  const { canonical_qty, canonical_unit } = toCanonical(qty, unit);
  const unit_price = canonical_qty > 0 ? +(price / canonical_qty).toFixed(4) : price;
  const kind = opts.kind ?? (PRODUCE.has(normalized_name) ? 'produce' : 'grocery');
  const g = opts.gstRates || null;
  return {
    name: (display_name || nameText).slice(0, 60),
    normalized_name,
    kind,
    qty: +qty.toFixed(3),
    unit,
    canonical_qty,
    canonical_unit,
    unit_price,
    price,
    hsn: opts.hsn ?? null,
    // 4.17 — per-item GST rates. NULL when not matched on this row. Explicit
    // CGST/SGST/IGST rates win over the combined form; combined is parked here
    // and resolved into the per-component fields by the orchestrator after it
    // knows whether the bill is intrastate or interstate (taxBreakdown).
    cgst_rate: g?.cgst_rate ?? null,
    sgst_rate: g?.sgst_rate ?? null,
    igst_rate: g?.igst_rate ?? null,
    _combinedGstRate: g?._combined ?? null,
    // 4.23 — pharmacy metadata. NULL for non-pharmacy items.
    batch_no:    opts.batchNo    ?? null,
    expiry_date: opts.expiryDate ?? null,
    mfg_date:    opts.mfgDate    ?? null,
  };
}

// ── Pharmacy metadata (4.23) ────────────────────────────────────────────────
// Indian pharmacy receipts (Apollo, MedPlus, 1mg, PharmEasy, Netmeds) print
// batch / expiry / mfg as labelled fields. Layout varies: sometimes on the
// same row as the price, sometimes on a row of their own between the drug
// name and the qty/price line. We scan the current row + N rows back and
// take the first match for each field.
//
// `strips` returns the [start, end] ranges to strip from the CURRENT row's
// text before it goes into matchAmounts() — without this, batch tokens like
// "B/24/011" feed `/011` into the amount list and either corrupt the name
// or produce phantom 11-rupee prices.
const PHARMACY_LOOKBACK = 3;

function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function daysInMonth(year, month1) {
  return new Date(year, month1, 0).getDate();
}

// Accept "12/25", "12/2025", "31/12/25", "31-12-2025", with -, /, . as
// separators. Return YYYY-MM-DD or null. monthOnly mode picks last-of-month
// (expiry semantics) or first-of-month (mfg semantics).
function parseDrugDate(raw, mode) {
  if (!raw) return null;
  const parts = String(raw).split(/[\/\-\.]/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  for (const p of parts) if (!/^\d+$/.test(p)) return null;
  let day, month, year;
  if (parts.length === 2) {
    // month/year only
    month = parseInt(parts[0], 10);
    year  = parseInt(parts[1], 10);
    if (month < 1 || month > 12) return null;
  } else {
    day   = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year  = parseInt(parts[2], 10);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  }
  // Normalise 2-digit year. Expiry / Mfg cluster around the present; rule:
  // years 00..79 → 2000..2079, 80..99 → 1980..1999.
  if (year < 100) year = year < 80 ? 2000 + year : 1900 + year;
  if (year < 1980 || year > 2099) return null;
  if (day == null) {
    day = mode === 'last' ? daysInMonth(year, month) : 1;
  } else {
    day = clampInt(day, 1, daysInMonth(year, month));
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function normaliseExpiry(raw) { return parseDrugDate(raw, 'last'); }
function normaliseMfg(raw)    { return parseDrugDate(raw, 'first'); }

function extractPharmacyMeta(rows, idx, lookback = PHARMACY_LOOKBACK) {
  let batch = null, expiry = null, mfg = null;
  const strips = [];
  const start = Math.max(0, idx - lookback);
  for (let j = start; j <= idx; j++) {
    const text = rows[j]?.text;
    if (!text) continue;
    const onCurrent = j === idx;
    if (!batch) {
      const m = text.match(BATCH_RE);
      if (m) {
        batch = m[1].slice(0, 20);
        if (onCurrent) strips.push([m.index, m.index + m[0].length]);
      }
    }
    if (!expiry) {
      const m = text.match(EXPIRY_RE);
      if (m) {
        const norm = normaliseExpiry(m[1]);
        if (norm) {
          expiry = norm;
          if (onCurrent) strips.push([m.index, m.index + m[0].length]);
        }
      }
    }
    if (!mfg) {
      const m = text.match(MFG_RE);
      if (m) {
        const norm = normaliseMfg(m[1]);
        if (norm) {
          mfg = norm;
          if (onCurrent) strips.push([m.index, m.index + m[0].length]);
        }
      }
    }
  }
  return { batch, expiry, mfg, strips };
}

// ── Item strategies ─────────────────────────────────────────────────────────
function extractItemsCard(rows, bands) {
  const out = [];
  const { itemBandTop, itemBandBottom } = bands;
  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    if (l.y < itemBandTop || l.y > itemBandBottom) continue;
    if (SKIP_RE.test(l.text)) continue;
    const amounts = matchAmounts(l.text);
    if (!amounts.length) continue;
    const positive = amounts.filter(a => a.value > 0);
    if (!positive.length) continue;
    const lastAmt = positive[positive.length - 1];
    const price = lastAmt.value;

    let nameText = (l.text.slice(0, lastAmt.start) + l.text.slice(lastAmt.end))
      .replace(/[₹$€£¥]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!nameText || looksLikeQtyOnly(nameText)) {
      const back = findNameBackward(rows, i);
      if (back) nameText = nameText ? `${back} ${nameText}` : back;
    }
    if (nameText && !/\d/.test(nameText)) {
      const qtyAhead = findQtyForward(rows, i, itemBandBottom);
      if (qtyAhead) nameText = `${nameText} ${qtyAhead}`;
    }
    if (nameText.length < 2 || /^\d+$/.test(nameText)) continue;

    const item = buildItem(nameText, price, {
      hsn: extractHsn(l.text),
      gstRates: extractItemGstRates(l.text),
    });
    if (item) out.push(item);
  }
  return out;
}

function stripRanges(text, ranges) {
  // Remove a set of [start, end) ranges from `text` and return the survivors.
  if (!ranges.length) return text;
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  let out = '';
  let cursor = 0;
  for (const [s, e] of sorted) {
    if (s > cursor) out += text.slice(cursor, s);
    cursor = Math.max(cursor, e);
  }
  if (cursor < text.length) out += text.slice(cursor);
  return out;
}

function extractItemsTabular(rows, bands) {
  const out = [];
  const { itemBandTop, itemBandBottom } = bands;
  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    if (l.y < itemBandTop || l.y > itemBandBottom) continue;
    if (SKIP_RE.test(l.text)) continue;
    const amounts = matchAmounts(l.text);
    if (!amounts.length) continue;
    const positive = amounts.filter(a => a.value > 0);
    if (!positive.length) continue;
    const lastAmt = positive[positive.length - 1];
    const price = lastAmt.value;

    // Derive qty from "qty × rate = total" pattern when multiple amounts are
    // on the line. Last amount = total; second-to-last = unit rate.
    // deriveQtyFromRate returns { qty, unit } — unit is 'pcs' for snapped
    // integers/fractions, 'kg' for decimal weights (mandi-style).
    let qtyHint = null;
    let unitHint = null;
    if (positive.length >= 2) {
      const rate = positive[positive.length - 2].value;
      const derived = deriveQtyFromRate(price, rate);
      if (derived) { qtyHint = derived.qty; unitHint = derived.unit; }
    }

    // Remove ALL amount tokens from the name. Use positions so we also strip
    // the decimal tail (.00) and any currency prefix consumed by the regex.
    const ranges = positive.map(a => [a.start, a.end]);
    let nameText = stripRanges(l.text, ranges)
      .replace(/[₹$€£¥]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // A trailing numeric token (after amount strip) is most likely the qty
    // column. Match either a 1-2 digit integer or a decimal weight like
    // "0.615" — the latter is the sabzi-mandi / per-kg case.
    const trailNumRe = /^(.+?)\s+(\d{1,2}|\d{0,2}\.\d{1,3})\s*$/;
    if (!qtyHint) {
      const m = nameText.match(trailNumRe);
      if (m) {
        const n = parseFloat(m[2]);
        if (n > 0 && n < 100) {
          qtyHint = m[2].includes('.') ? +n.toFixed(3) : n;
          unitHint = m[2].includes('.') ? 'kg' : 'pcs';
          nameText = m[1].trim();
        }
      }
    } else {
      // Drop the qty column from the name now that we have it from rate division.
      const m = nameText.match(trailNumRe);
      if (m) nameText = m[1].trim();
    }

    if (!nameText || looksLikeQtyOnly(nameText)) {
      const back = findNameBackward(rows, i);
      if (back) nameText = nameText ? `${back} ${nameText}` : back;
    }

    if (nameText.length < 2 || /^\d+$/.test(nameText)) continue;

    const preNormalize = qtyHint != null
      ? (unitHint && unitHint !== 'pcs')
        ? `${qtyHint} ${unitHint} ${nameText}`
        : `${qtyHint} x ${nameText}`
      : nameText;
    const item = buildItem(nameText, price, {
      namePreNormalize: preNormalize,
      hsn: extractHsn(l.text),
      gstRates: extractItemGstRates(l.text),
    });
    if (item) out.push(item);
  }
  return out;
}

// 4.23 — Pharmacy-specific item extraction. Mirrors extractItemsTabular
// with two pharmacy-aware additions:
//   1. Before amount extraction, scan the current row + 3 rows back for
//      batch/expiry/mfg metadata. Same-row matches are stripped from the
//      working text so `B/24/011` no longer leaks `/011` into matchAmounts.
//   2. buildItem receives the metadata so the resulting RawItem carries
//      batch_no / expiry_date / mfg_date through to persistence.
//
// Lookback caps at PHARMACY_LOOKBACK (3) — tight enough that an item
// won't accidentally absorb the previous item's batch in the verbose
// 3-row-per-item layout (drug name → batch+exp line → qty/price line).
function extractItemsPharmacy(rows, bands) {
  const out = [];
  const { itemBandTop, itemBandBottom } = bands;
  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    if (l.y < itemBandTop || l.y > itemBandBottom) continue;
    if (SKIP_RE.test(l.text)) continue;

    const meta = extractPharmacyMeta(rows, i);
    const cleanedText = meta.strips.length
      ? stripRanges(l.text, meta.strips)
      : l.text;

    const amounts = matchAmounts(cleanedText);
    if (!amounts.length) continue;
    const positive = amounts.filter(a => a.value > 0);
    if (!positive.length) continue;
    const price = positive[positive.length - 1].value;

    let qtyHint = null;
    let unitHint = null;
    if (positive.length >= 2) {
      const rate = positive[positive.length - 2].value;
      const derived = deriveQtyFromRate(price, rate);
      if (derived) { qtyHint = derived.qty; unitHint = derived.unit; }
    }

    const ranges = positive.map(a => [a.start, a.end]);
    let nameText = stripRanges(cleanedText, ranges)
      .replace(/[₹$€£¥]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const trailNumRe = /^(.+?)\s+(\d{1,2}|\d{0,2}\.\d{1,3})\s*$/;
    if (!qtyHint) {
      const m = nameText.match(trailNumRe);
      if (m) {
        const n = parseFloat(m[2]);
        if (n > 0 && n < 100) {
          qtyHint = m[2].includes('.') ? +n.toFixed(3) : n;
          unitHint = m[2].includes('.') ? 'kg' : 'pcs';
          nameText = m[1].trim();
        }
      }
    } else {
      const m = nameText.match(trailNumRe);
      if (m) nameText = m[1].trim();
    }

    if (!nameText || looksLikeQtyOnly(nameText)) {
      const back = findNameBackward(rows, i);
      if (back) nameText = nameText ? `${back} ${nameText}` : back;
    }

    if (nameText.length < 2 || /^\d+$/.test(nameText)) continue;

    const preNormalize = qtyHint != null
      ? (unitHint && unitHint !== 'pcs')
        ? `${qtyHint} ${unitHint} ${nameText}`
        : `${qtyHint} x ${nameText}`
      : nameText;
    const item = buildItem(nameText, price, {
      namePreNormalize: preNormalize,
      hsn: extractHsn(l.text),
      gstRates: extractItemGstRates(l.text),
      batchNo:    meta.batch,
      expiryDate: meta.expiry,
      mfgDate:    meta.mfg,
    });
    if (item) out.push(item);
  }
  return out;
}

function extractItemsPermissive(rows, bands) {
  // For handwritten / very noisy receipts. Accept any line that has any
  // numeric token (currency optional) and at least one alphabetic word.
  const out = [];
  const { itemBandTop, itemBandBottom } = bands;
  const NUMERIC_RE = /(\d+(?:[.,]\d{1,2})?)/g;
  for (let i = 0; i < rows.length; i++) {
    const l = rows[i];
    if (l.y < itemBandTop || l.y > itemBandBottom) continue;
    if (SKIP_RE.test(l.text)) continue;
    // Strict amount match first; if no hit, fall back to bare-number match.
    let amounts = matchAmounts(l.text).filter(a => a.value > 0);
    if (!amounts.length) {
      NUMERIC_RE.lastIndex = 0;
      const fall = [];
      let m;
      while ((m = NUMERIC_RE.exec(l.text))) {
        const v = parseAmount(m[1]);
        if (isFinite(v) && v > 0 && v < 100000) {
          fall.push({ value: v, absValue: v, start: m.index, end: m.index + m[0].length });
        }
      }
      if (!fall.length) continue;
      amounts = fall;
    }
    const lastAmt = amounts[amounts.length - 1];
    const price = lastAmt.value;

    let nameText = (l.text.slice(0, lastAmt.start) + l.text.slice(lastAmt.end))
      .replace(/[₹$€£¥]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!nameText || nameText.length < 2 || /^\d+$/.test(nameText)) continue;
    if (!/[a-z]/i.test(nameText)) continue;

    const item = buildItem(nameText, price, {
      hsn: extractHsn(l.text),
      gstRates: extractItemGstRates(l.text),
    });
    if (item) out.push(item);
  }
  return out;
}

function extractItemsTotalsOnly() {
  // No items. The caller will surface the total alone.
  return [];
}

// 4.16 — Fuel-receipt item extractor. Fuel bills are deliberately sparse:
// a single dispensed-volume row with liters × rate = amount, possibly
// across one OCR line ("12.345 L x 105.50 = 1302.40") or split across
// adjacent rows ("Quantity 12.345 / Rate 105.50 / Amount 1302.40"). We
// detect the fuel type (Petrol / Diesel / CNG) by scanning the row text
// and emit a single item with unit='l' so the rollup behaves like every
// other receipt_item; downstream fuel/vehicle tracking (7.6) will consume
// it via `kind: 'fuel'`.
const FUEL_TYPE_RE = /\b(petrol|diesel|cng|gasoline)\b/i;
const FUEL_INLINE_RE = /(\d+(?:\.\d+)?)\s*(?:l|lt|ltr|litres?|liters?)\s*[x×*@]?\s*(?:₹|rs\.?|inr\.?)?\s*(\d+(?:\.\d+)?)\s*[=]?\s*(?:₹|rs\.?|inr\.?)?\s*(\d+(?:[.,]\d+)?)?/i;
const QTY_LABEL_RE = /\b(?:quantity|qty|vol(?:ume)?)\b[^\d]*(\d+(?:\.\d+)?)/i;
const RATE_LABEL_RE = /\b(?:rate(?:\s*\/\s*l(?:tr|itre)?)?|price\s*\/\s*l(?:tr|itre)?)\b[^\d]*(\d+(?:\.\d+)?)/i;
const AMOUNT_LABEL_RE = /\b(?:amount|sale\s*value|net\s*amount|total)\b[^\d]*(\d+(?:[.,]\d+)?)/i;

function detectFuelType(text) {
  const m = String(text).match(FUEL_TYPE_RE);
  if (!m) return 'Fuel';
  const word = m[1].toLowerCase();
  if (word === 'petrol' || word === 'gasoline') return 'Petrol';
  if (word === 'diesel') return 'Diesel';
  if (word === 'cng') return 'CNG';
  return 'Fuel';
}

function extractFuelItem(rows, bands) {
  const { itemBandTop, itemBandBottom } = bands;
  const bodyRows = rows.filter(r => r.y >= itemBandTop && r.y <= itemBandBottom);
  if (!bodyRows.length) return [];
  const fullText = bodyRows.map(r => r.text).join('\n');
  const fuelType = detectFuelType(fullText);

  // Shape 1: inline qty × rate = amount on a single row.
  for (const r of bodyRows) {
    if (SKIP_RE.test(r.text)) continue;
    const m = r.text.match(FUEL_INLINE_RE);
    if (!m) continue;
    const qty = parseFloat(m[1]);
    const rate = parseFloat(m[2]);
    const amt = m[3] != null ? parseAmount(m[3]) : (isFinite(qty * rate) ? +(qty * rate).toFixed(2) : NaN);
    if (!isFinite(qty) || qty <= 0) continue;
    if (!isFinite(amt) || amt <= 0) continue;
    const item = buildItem(fuelType, amt, {
      namePreNormalize: `${qty} l ${fuelType}`,
      kind: 'fuel',
    });
    if (item) return [item];
  }

  // Shape 2: split across rows. Search the full text for the three labels.
  const qtyMatch = fullText.match(QTY_LABEL_RE);
  const rateMatch = fullText.match(RATE_LABEL_RE);
  const amtMatch = fullText.match(AMOUNT_LABEL_RE);
  const qty = qtyMatch ? parseFloat(qtyMatch[1]) : NaN;
  const rate = rateMatch ? parseFloat(rateMatch[1]) : NaN;
  const amt = amtMatch ? parseAmount(amtMatch[1]) : NaN;
  if (isFinite(qty) && qty > 0 && isFinite(amt) && amt > 0) {
    const item = buildItem(fuelType, amt, {
      namePreNormalize: `${qty} l ${fuelType}`,
      kind: 'fuel',
    });
    if (item) return [item];
    // Touch `rate` so the reader sees the explicit pairing even when buildItem fails.
    void rate;
  }
  return [];
}

// 4.13 — Column-aware extraction. Uses detectColumns() to find x-axis gaps
// in the body rows, then buckets each token into the column whose [x0, x1)
// covers its centre. For each row:
//   - rightmost numeric column ⇒ amount (the line total)
//   - rightmost non-amount numeric column ⇒ rate (used by deriveQtyFromRate)
//   - remaining numeric tokens that look like a small integer ⇒ qty
//   - everything else concatenated left-to-right ⇒ item name
//
// Auto-fallback contract: when detectColumns returns < MIN_COLS columns OR
// max gap is below the minimum width, this function returns null and the
// dispatcher runs extractItemsTabular instead. Returning [] would mean
// "this strategy ran and produced zero items" — that's NOT the same signal.
const COLUMNAR_MIN_COLS = 3;

function isPlainNumber(text) {
  const t = String(text).replace(/[₹$€£¥,\s]/g, '');
  if (!t) return false;
  return /^-?\d+(?:\.\d+)?$/.test(t);
}

function parseNumberSafe(text) {
  return parseAmount(text);
}

function extractItemsColumnar(rows, bands, opts = {}) {
  const { itemBandTop, itemBandBottom } = bands;
  const bodyRows = rows.filter(r => r.y >= itemBandTop && r.y <= itemBandBottom);
  // 4.22 — when a learned column_map is supplied, use it instead of
  // re-detecting per-receipt. Templates apply only at sample_count >= 3,
  // gated by the caller, so this path is trusted.
  let columns, gapWidths;
  if (opts.columnsOverride && opts.columnsOverride.length >= COLUMNAR_MIN_COLS) {
    columns = opts.columnsOverride;
    gapWidths = [1];   // dummy non-empty to pass the gap-width gate below
  } else {
    ({ columns, gapWidths } = detectColumns(bodyRows));
  }
  if (columns.length < COLUMNAR_MIN_COLS) return null;
  if (!gapWidths.length) return null;

  const out = [];
  for (let i = 0; i < bodyRows.length; i++) {
    const l = bodyRows[i];
    if (SKIP_RE.test(l.text)) continue;
    const tokens = l.tokens || [];
    if (!tokens.length) continue;

    // Bucket tokens into columns and inspect each column for content.
    const perCol = columns.map(() => []);
    for (const t of tokens) {
      const c = tokenColumn(columns, t);
      if (c >= 0) perCol[c].push(t);
    }

    // Identify the rightmost column that is purely numeric across the row.
    let amountCol = -1;
    for (let c = columns.length - 1; c >= 0; c--) {
      const col = perCol[c];
      if (!col.length) continue;
      const joined = col.map(t => t.text).join('').trim();
      if (isPlainNumber(joined) || matchAmounts(joined).length) {
        amountCol = c;
        break;
      }
    }
    if (amountCol < 0) continue;
    const amountStr = perCol[amountCol].map(t => t.text).join('');
    const amounts = matchAmounts(amountStr);
    const amountVal = amounts.length ? amounts[amounts.length - 1].value : parseNumberSafe(amountStr);
    if (!isFinite(amountVal) || amountVal <= 0) continue;

    // Rate column = the rightmost remaining numeric column to the left.
    let rateCol = -1;
    for (let c = amountCol - 1; c >= 0; c--) {
      const col = perCol[c];
      if (!col.length) continue;
      const joined = col.map(t => t.text).join('').trim();
      if (isPlainNumber(joined) || matchAmounts(joined).length) {
        rateCol = c;
        break;
      }
    }
    let qtyHint = null;
    let unitHint = null;
    if (rateCol >= 0) {
      const rateStr = perCol[rateCol].map(t => t.text).join('');
      const rateAmts = matchAmounts(rateStr);
      const rateVal = rateAmts.length ? rateAmts[rateAmts.length - 1].value : parseNumberSafe(rateStr);
      if (isFinite(rateVal) && rateVal > 0) {
        const derived = deriveQtyFromRate(amountVal, rateVal);
        if (derived) { qtyHint = derived.qty; unitHint = derived.unit; }
      }
    }

    // Name = concat of every column to the LEFT of the rate (or amount if no
    // rate), stripping any incidental currency symbols. Pure-numeric columns
    // wedged in the middle (a 1–2 digit qty column OR a 3-decimal weight
    // column like "0.615") are consumed: promoted to qtyHint if we don't
    // already have one, otherwise dropped entirely so they don't leak into
    // the item name.
    const nameCols = [];
    for (let c = 0; c < (rateCol >= 0 ? rateCol : amountCol); c++) {
      const col = perCol[c];
      if (!col.length) continue;
      const joined = col.map(t => t.text).join(' ').trim();
      const cleaned = joined.replace(/[₹$€£¥]/g, '').trim();
      if (!cleaned) continue;
      if (/^\d{1,2}$/.test(cleaned)) {
        if (!qtyHint) {
          const n = parseInt(cleaned, 10);
          if (n > 0 && n < 100) { qtyHint = n; unitHint = 'pcs'; }
        }
        continue;
      }
      if (/^\d{0,2}\.\d{1,3}$/.test(cleaned)) {
        if (!qtyHint) {
          const n = parseFloat(cleaned);
          if (n > 0 && n < 100) { qtyHint = +n.toFixed(3); unitHint = 'kg'; }
        }
        continue;
      }
      nameCols.push(cleaned);
    }
    const nameText = nameCols.join(' ').replace(/\s+/g, ' ').trim();
    if (!nameText || nameText.length < 2 || /^\d+$/.test(nameText)) continue;
    if (looksLikeQtyOnly(nameText) || looksLikeMetaOnly(nameText)) continue;

    const preNormalize = qtyHint != null
      ? (unitHint && unitHint !== 'pcs')
        ? `${qtyHint} ${unitHint} ${nameText}`
        : `${qtyHint} x ${nameText}`
      : nameText;
    const item = buildItem(nameText, amountVal, {
      namePreNormalize: preNormalize,
      hsn: extractHsn(l.text),
      gstRates: extractItemGstRates(l.text),
    });
    if (item) out.push(item);
  }

  return out;
}

function dispatchItems(strategy, rows, bands, extra = {}) {
  switch (strategy) {
    case 'card':        return extractItemsCard(rows, bands);
    case 'tabular': {
      // 4.13 — try columnar first; fall back to the legacy tabular extractor
      // when detectColumns doesn't find a clean enough column structure.
      // 4.22 — pass through columnsOverride so a learned template can pin
      // the column layout instead of re-detecting per-receipt.
      const colsTry = extractItemsColumnar(rows, bands, extra);
      if (colsTry && colsTry.length) return colsTry;
      return extractItemsTabular(rows, bands);
    }
    case 'columnar':    return extractItemsColumnar(rows, bands, extra) || extractItemsTabular(rows, bands);
    case 'permissive':  return extractItemsPermissive(rows, bands);
    case 'totals-only': return extractItemsTotalsOnly(rows, bands);
    case 'fuel':        return extractFuelItem(rows, bands);
    case 'pharmacy':    return extractItemsPharmacy(rows, bands);
    default:            return extractItemsCard(rows, bands);
  }
}

// ── Bill bands ─────────────────────────────────────────────────────────────
// Items live between the merchant area and the row that holds the grand
// total (or the "Bill details" header, if it appears below the items).
//
// "Bill details" / "Tax invoice" / "Order summary" sometimes appear at the
// VERY TOP of the receipt as a page title (Blinkit, Amazon). Those don't
// mark the end of items — we ignore them and only treat a header as the
// items-end marker if it appears below at least one row that carries an
// amount (i.e. somewhere we've already seen items).
function findBillBands(rows, totalY) {
  if (!rows.length) return { itemBandTop: 0, itemBandBottom: Infinity };
  const ys = rows.map(l => l.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = Math.max(1, maxY - minY);

  const itemBandTop = minY + rangeY * 0.10;

  let billHeaderY = null;
  let seenAmountAbove = false;
  for (const r of rows) {
    if (!seenAmountAbove && matchAmounts(r.text).length) seenAmountAbove = true;
    if (seenAmountAbove && BILL_HDR_RE.test(r.text)) {
      billHeaderY = r.y;
      break;
    }
  }

  let itemBandBottom = maxY;
  if (billHeaderY != null) itemBandBottom = billHeaderY - 1;
  else if (totalY != null) itemBandBottom = totalY - 1;

  return { itemBandTop, itemBandBottom, minY, maxY, rangeY };
}

// ── Orchestrator ────────────────────────────────────────────────────────────
// Accepts either the raw ML Kit OCR result (object with `blocks`) or a
// pre-extracted line array. The latter lets the 4.21 fallback path merge
// ML Kit + Tesseract lines via mergeEngineResults() and re-parse without
// having to fabricate a fake ML Kit shape.
//
// Optional second argument supports two future-flex hooks:
//   options.template — a learned receipt_templates row (4.22). When present
//     AND the caller has gated on sample_count >= 3, the template overrides
//     format, item-band fractions, and column_map. The regression-safety
//     comparison (probe vs templated overall confidence) is the CALLER'S
//     job — parseReceipt itself is pure; it just produces the templated
//     parse if asked.
export function parseReceipt(ocrResultOrLines, options = {}) {
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const rawLines = Array.isArray(ocrResultOrLines)
    ? ocrResultOrLines
    : extractLines(ocrResultOrLines);
  if (!rawLines.length) {
    return {
      merchant: 'Unknown store',
      date: fallbackDate,
      _fallbackDate: fallbackDate,
      total: 0, subtotal: 0, tax: 0, currency: null,
      items: [], fees: [], discounts: [],
      format: 'generic', formatLabel: 'Generic', brand: null,
      formatConfidence: 0,
      confidence: { overall: 0, label: 'low', components: {}, flags: { needsReview: true } },
    };
  }

  const rows = mergeIntoRows(rawLines);
  const fullText = rows.map(r => r.text).join('\n');

  // ── Format ────────────────────────────────────────────────────────────
  let fd = detectFormat(rows);
  if (options.template?.format) {
    // 4.22 — template format override. We keep detectFormat's brand /
    // signal metadata but swap in the learned format + its config. The
    // formatConfidence floor (0.8) reflects "we've seen this merchant
    // ≥3 times, we trust the format".
    const cfg = FORMAT_CONFIGS[options.template.format] || fd.config;
    fd = {
      ...fd,
      format: options.template.format,
      label: cfg.label || fd.label,
      config: cfg,
      formatConfidence: Math.max(fd.formatConfidence, 0.8),
    };
  }
  const config = fd.config;

  // ── Bill totals (first pass — gives us totalY so we can clamp items) ─
  // We do a preliminary pass with no band constraints to find totalY.
  const totals = extractBillTotals(rows, config);

  // ── Bands ─────────────────────────────────────────────────────────────
  let { itemBandTop, itemBandBottom, minY, maxY, rangeY } = findBillBands(rows, totals.totalY);
  if (options.template) {
    // 4.22 — band override via learned header/footer fractions. Only swap
    // in when the values are sane (in [0, 0.5] each) and rangeY > 0;
    // otherwise quietly retain findBillBands' output.
    const hf = options.template.header_frac;
    const ff = options.template.footer_frac;
    if (rangeY > 0 && hf >= 0 && hf < 0.5 && ff >= 0 && ff < 0.5) {
      itemBandTop = minY + rangeY * hf;
      itemBandBottom = minY + rangeY * (1 - ff);
    }
  }

  // ── Merchant / currency / date / GSTIN / order id ────────────────────
  const merchant = extractMerchant(rows, fd.brand, minY, rangeY);
  const currency = detectCurrency(fullText);
  const date = findDate(fullText) || fallbackDate;
  const gstin = extractGstin(fullText);
  const orderId = extractOrderId(fullText);
  const invoiceNumber = extractInvoiceNumber(fullText);
  const taxBreakdown = extractTaxBreakdown(fullText);

  // ── Items ─────────────────────────────────────────────────────────────
  // 4.22 — pass through learned column_map so columnar extraction can pin
  // the layout instead of re-detecting per-receipt. Templates apply only
  // at sample_count >= 3 (caller-gated).
  const items = dispatchItems(
    config.itemStrategy,
    rows,
    { itemBandTop, itemBandBottom },
    { columnsOverride: options.template?.columnMapParsed || null }
  );

  // 4.17 — disambiguate per-item combined GST rates ("GST 5%") into
  // CGST/SGST or IGST using bill-level tax presence. Intrastate bills split
  // the combined rate symmetrically; interstate bills attribute it to IGST.
  // When neither component is present at the bill level, we can't tell and
  // leave the per-item rates NULL rather than guess.
  const intrastate = (taxBreakdown.cgst || 0) > 0 || (taxBreakdown.sgst || 0) > 0;
  const interstate = (taxBreakdown.igst || 0) > 0;
  for (const it of items) {
    const combined = it._combinedGstRate;
    if (combined != null && it.cgst_rate == null && it.sgst_rate == null && it.igst_rate == null) {
      if (intrastate) {
        it.cgst_rate = +(combined / 2).toFixed(2);
        it.sgst_rate = +(combined / 2).toFixed(2);
      } else if (interstate) {
        it.igst_rate = combined;
      }
      // else leave NULL — can't tell intrastate vs interstate from bill alone.
    }
    delete it._combinedGstRate;
  }

  // ── Fallback total: bottom-band scan if no total keyword found ───────
  let total = totals.total;
  if (!isFinite(total)) {
    const ys = rows.map(l => l.y);
    const maxY = Math.max(...ys);
    const bottomBand = rows.filter(l => (l.y - minY) / rangeY > 0.60);
    let best = 0;
    for (const l of bottomBand) {
      if (SUBTOTAL_RE.test(l.text)) continue;
      if (TAX_RE.test(l.text)) continue;
      const amt = pickAmount(l.text);
      if (isFinite(amt) && amt > best) best = amt;
    }
    if (best > 0) total = best;
  }
  if (!isFinite(total)) total = 0;

  // If still no total but we have items, sum them.
  if ((!total || total === 0) && items.length) {
    total = +items.reduce((s, it) => s + it.price, 0).toFixed(2);
  }

  const subtotal = isFinite(totals.subtotal) ? totals.subtotal : 0;
  const tax = isFinite(totals.tax) ? totals.tax : 0;

  const parsed = {
    merchant,
    date,
    _fallbackDate: fallbackDate,
    total: +total.toFixed(2),
    subtotal: +subtotal.toFixed(2),
    tax: +tax.toFixed(2),
    currency,
    items,
    fees: totals.fees,
    discounts: totals.discounts,
    format: fd.format,
    formatLabel: fd.label,
    brand: fd.brand,
    formatConfidence: fd.formatConfidence,
    formatSignals: fd.signals,
    gstin,
    orderId,
    invoiceNumber,
    cgst: taxBreakdown.cgst,
    sgst: taxBreakdown.sgst,
    igst: taxBreakdown.igst,
  };

  // 4.22 — capture-side material for templates.recordSample(). bands
  // expresses the item-section as fractions of total rangeY so future
  // re-parses can pin the same fractions. columns is the actual layout
  // we extracted with (template-override or per-receipt detection),
  // serialised as {x0,x1} pairs by the repo. Both are read by the Scan
  // capture path; harmless to downstream consumers that ignore them.
  if (rangeY > 0) {
    parsed.bands = {
      header_frac: +((itemBandTop - minY) / rangeY).toFixed(3),
      footer_frac: +((maxY - itemBandBottom) / rangeY).toFixed(3),
    };
  } else {
    parsed.bands = { header_frac: 0.15, footer_frac: 0.20 };
  }
  // Columns: prefer the override the caller supplied (so the captured
  // layout is exactly what was used); otherwise re-detect from the rows
  // we already merged. Either way we expose to the capture path.
  if (options.template?.columnMapParsed?.length) {
    parsed.columns = options.template.columnMapParsed.map(c => ({ x0: c.x0, x1: c.x1 }));
  } else {
    const bodyRowsForCap = rows.filter(r => r.y >= itemBandTop && r.y <= itemBandBottom);
    const { columns: detected } = detectColumns(bodyRowsForCap);
    parsed.columns = (detected || []).map(c => ({ x0: c.x0, x1: c.x1 }));
  }

  parsed.confidence = scoreConfidence(parsed);
  return parsed;
}

export function recalcItem(item) {
  const { canonical_qty, canonical_unit } = toCanonical(item.qty, item.unit);
  const unit_price = canonical_qty > 0 ? +(item.price / canonical_qty).toFixed(4) : item.price;
  return { ...item, canonical_qty, canonical_unit, unit_price };
}

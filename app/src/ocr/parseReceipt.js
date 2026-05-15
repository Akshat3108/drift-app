import { PRODUCE } from './produceList';
import { toCanonical } from './units';
import { normalizeName } from './normalizeName';
import { extractLines } from './textRecognition';

const AMOUNT_RE = /-?\d+(?:[.,]\d{2})\b/g;
const DATE_RE   = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_DATE_RE = new RegExp(
  '\\b(' + MONTHS.join('|') + ')[a-z]*\\s+(\\d{1,2}),?\\s*(\\d{2,4})?\\b', 'i'
);
const SKIP_RE = /\b(subtotal|sub total|tax|gst|vat|cgst|sgst|igst|discount|change|tendered|cash|card|tip|round|service|grand total|total|amount due|amt due|balance)\b/i;
const TOTAL_RE = /\b(grand total|amount due|amt due|balance|total)\b/i;
const SUBTOTAL_RE = /\bsub\s*total\b/i;
const TAX_RE = /\b(tax|gst|vat|cgst|sgst|igst)\b/i;
const CURRENCY_RE = /[₹$€£¥]/;

function parseAmount(str) {
  const v = parseFloat(String(str).replace(/[, ]/g, ''));
  return isFinite(v) ? +v.toFixed(2) : NaN;
}

function pickAmount(text) {
  const matches = text.match(AMOUNT_RE);
  if (!matches) return NaN;
  return parseAmount(matches[matches.length - 1]);
}

function normaliseDate(d, m, y) {
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  const month = String(parseInt(m, 10)).padStart(2, '0');
  const day = String(parseInt(d, 10)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function findDate(text) {
  const m = text.match(DATE_RE);
  if (m) return normaliseDate(m[1], m[2], m[3]);
  const m2 = text.match(MONTH_DATE_RE);
  if (m2) {
    const mi = MONTHS.indexOf(m2[1].toLowerCase().slice(0, 3));
    if (mi >= 0) {
      const year = m2[3] ? (parseInt(m2[3], 10) < 100 ? 2000 + parseInt(m2[3], 10) : parseInt(m2[3], 10)) : new Date().getFullYear();
      return `${year}-${String(mi + 1).padStart(2, '0')}-${String(m2[2]).padStart(2, '0')}`;
    }
  }
  return null;
}

export function parseReceipt(ocrResult) {
  const lines = extractLines(ocrResult);
  if (!lines.length) {
    return {
      merchant: 'Unknown store', date: new Date().toISOString().slice(0, 10),
      total: 0, subtotal: 0, tax: 0, currency: null, items: [],
    };
  }

  const ys = lines.map(l => l.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = Math.max(1, maxY - minY);

  // Merchant: top 20%
  const top = lines.filter(l => (l.y - minY) / rangeY < 0.20 && l.text.length > 1);
  let merchant = 'Unknown store';
  if (top.length) {
    top.sort((a, b) => b.text.length - a.text.length);
    merchant = top[0].text.replace(/\s+/g, ' ').slice(0, 60);
  }

  const fullText = lines.map(l => l.text).join('\n');
  const date = findDate(fullText) || new Date().toISOString().slice(0, 10);

  let currency = null;
  const cm = fullText.match(CURRENCY_RE);
  if (cm) currency = cm[0];

  let total = NaN, subtotal = NaN, tax = NaN;
  let totalLineY = null;
  for (const l of lines) {
    const amt = pickAmount(l.text);
    if (!isFinite(amt)) continue;
    if (SUBTOTAL_RE.test(l.text)) {
      if (!isFinite(subtotal) || amt > subtotal) subtotal = amt;
    } else if (TAX_RE.test(l.text)) {
      if (!isFinite(tax) || amt > tax) tax = amt;
    } else if (TOTAL_RE.test(l.text)) {
      if (!isFinite(total) || amt > total) {
        total = amt;
        totalLineY = l.y;
      }
    }
  }
  if (!isFinite(total)) {
    const bottomBand = lines.filter(l => (l.y - minY) / rangeY > 0.60);
    let best = 0;
    for (const l of bottomBand) {
      const amt = pickAmount(l.text);
      if (isFinite(amt) && amt > best) {
        best = amt;
        totalLineY = l.y;
      }
    }
    if (best > 0) total = best;
  }
  if (!isFinite(total)) total = 0;
  if (!isFinite(subtotal)) subtotal = 0;
  if (!isFinite(tax)) tax = 0;

  // Items: lines between merchant area and total line
  const items = [];
  const itemBandTop = minY + rangeY * 0.18;
  const itemBandBottom = totalLineY != null ? totalLineY - 1 : maxY;

  for (const l of lines) {
    if (l.y < itemBandTop) continue;
    if (l.y > itemBandBottom) continue;
    if (SKIP_RE.test(l.text)) continue;
    const amounts = l.text.match(AMOUNT_RE);
    if (!amounts) continue;
    const price = parseAmount(amounts[amounts.length - 1]);
    if (!isFinite(price) || price <= 0) continue;

    let nameText = l.text;
    const lastIdx = nameText.lastIndexOf(amounts[amounts.length - 1]);
    if (lastIdx > 0) nameText = nameText.slice(0, lastIdx).trim();
    nameText = nameText.replace(/[₹$€£¥]/g, '').replace(/\s+/g, ' ').trim();
    if (nameText.length < 2) continue;
    if (/^\d+$/.test(nameText)) continue;

    const { normalized_name, qty, unit } = normalizeName(nameText);
    if (!normalized_name) continue;
    const { canonical_qty, canonical_unit } = toCanonical(qty, unit);
    const unit_price = canonical_qty > 0 ? +(price / canonical_qty).toFixed(4) : price;
    const kind = PRODUCE.has(normalized_name) ? 'produce' : 'grocery';

    items.push({
      name: nameText.slice(0, 60),
      normalized_name,
      kind,
      qty: +qty.toFixed(3),
      unit,
      canonical_qty,
      canonical_unit,
      unit_price,
      price,
    });
  }

  if (items.length && (!isFinite(total) || total === 0)) {
    total = +items.reduce((s, it) => s + it.price, 0).toFixed(2);
  }

  return {
    merchant,
    date,
    total: +total.toFixed(2),
    subtotal: +subtotal.toFixed(2),
    tax: +tax.toFixed(2),
    currency,
    items,
  };
}

export function recalcItem(item) {
  const { canonical_qty, canonical_unit } = toCanonical(item.qty, item.unit);
  const unit_price = canonical_qty > 0 ? +(item.price / canonical_qty).toFixed(4) : item.price;
  return { ...item, canonical_qty, canonical_unit, unit_price };
}

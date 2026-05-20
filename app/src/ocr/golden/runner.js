// 4.19 — Golden-dataset harness. Pure runner — no React, no native deps,
// no FileSystem. The caller provides:
//
//   - `fixtures`: an array of `{ name, ocr, pots, expected }` objects, where
//     `ocr` is the structured ML Kit JSON the parser eats (the same shape
//     `recognize()` returns), `pots` is the user's categories at scan time,
//     and `expected` is the ground-truth values to compare against.
//
//   - `processReceipt`: typically `@features/scan/ScanService.processReceipt`,
//     passed in so the runner stays pure (no module-graph coupling to the
//     RN feature layer; the runner itself is importable from a Node test).
//
// Returns `{ passed, failed, total, results }`. Each result is per-fixture
// with field-level diffs so a future UI (or CLI) can highlight which fields
// regressed.

const AMOUNT_TOL = 0.01;

function compareMerchant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function compareAmount(a, b) {
  const x = Number(a), y = Number(b);
  if (!isFinite(x) && !isFinite(y)) return true;
  if (!isFinite(x) || !isFinite(y)) return false;
  return Math.abs(x - y) <= AMOUNT_TOL;
}

function compareDate(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return String(a).slice(0, 10) === String(b).slice(0, 10);
}

// Item-level comparison: tolerant on name (case-insensitive trim), tight on
// price. Returns per-index diffs. Missing items on either side are flagged
// as length mismatches.
function compareItems(parsed, expected) {
  const diffs = [];
  const a = parsed || [];
  const b = expected || [];
  if (a.length !== b.length) {
    diffs.push({ field: 'items.length', parsed: a.length, expected: b.length });
  }
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (!x || !y) {
      diffs.push({ field: `items[${i}]`, parsed: x ?? null, expected: y ?? null });
      continue;
    }
    if (!compareMerchant(x.name, y.name)) {
      diffs.push({ field: `items[${i}].name`, parsed: x.name, expected: y.name });
    }
    if (!compareAmount(x.price, y.price)) {
      diffs.push({ field: `items[${i}].price`, parsed: x.price, expected: y.price });
    }
  }
  return diffs;
}

export function runGolden({ fixtures, processReceipt }) {
  if (!Array.isArray(fixtures)) throw new Error('runGolden: fixtures must be an array');
  if (typeof processReceipt !== 'function') {
    throw new Error('runGolden: processReceipt must be passed in (injected dep)');
  }

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const fix of fixtures) {
    const { name = '<unnamed>', ocr, pots = [], expected = {} } = fix;
    let processed;
    try {
      processed = processReceipt(ocr, pots);
    } catch (e) {
      results.push({ name, ok: false, error: e.message || String(e), diffs: [] });
      failed++;
      continue;
    }
    const diffs = [];
    if (expected.merchant != null && !compareMerchant(processed.merchant, expected.merchant)) {
      diffs.push({ field: 'merchant', parsed: processed.merchant, expected: expected.merchant });
    }
    if (expected.date != null && !compareDate(processed.date, expected.date)) {
      diffs.push({ field: 'date', parsed: processed.date, expected: expected.date });
    }
    if (expected.total != null && !compareAmount(processed.total, expected.total)) {
      diffs.push({ field: 'total', parsed: processed.total, expected: expected.total });
    }
    if (expected.format != null && processed.format !== expected.format) {
      diffs.push({ field: 'format', parsed: processed.format, expected: expected.format });
    }
    if (expected.items != null) {
      diffs.push(...compareItems(processed.items, expected.items));
    }

    const ok = diffs.length === 0;
    if (ok) passed++; else failed++;
    results.push({ name, ok, diffs, parsed: processed });
  }

  return { total: fixtures.length, passed, failed, results };
}

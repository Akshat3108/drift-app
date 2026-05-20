// Format detection. Given merged OCR rows, return which bill type this
// receipt most likely is, along with a confidence score and the signals
// that fired. The orchestrator (parseReceipt.js) uses the detected format
// to pick the right per-format configuration.

import { FORMAT_SIGNATURES, matchBrand, KNOWN_BRANDS } from './patterns.js';

// Per-format extraction config. The base parser reads these to know which
// keywords identify the subtotal/total/skip rows for this format and how
// it should interpret items.
const FORMAT_CONFIGS = {
  quick_commerce: {
    label: 'Quick commerce',
    itemStrategy: 'card',     // name/qty/price often on adjacent lines
    feeWhitelist: ['handling', 'delivery', 'packaging', 'tip'],
    subtotalPriority: ['mrp', 'item total', 'sub total'],
    totalPriority: ['bill total', 'order total', 'grand total', 'amount payable'],
    expectItems: true,
    merchantHints: ['Blinkit', 'Zepto', 'Swiggy Instamart', 'BigBasket', 'BB Now', 'Dunzo'],
  },
  food_delivery: {
    label: 'Food delivery',
    itemStrategy: 'card',
    feeWhitelist: ['delivery', 'platform fee', 'restaurant charges', 'packaging', 'tip', 'gst'],
    subtotalPriority: ['item total', 'sub total', 'items total'],
    totalPriority: ['grand total', 'order total', 'total', 'amount payable'],
    expectItems: true,
    merchantHints: ['Zomato', 'Swiggy', 'Uber Eats'],
  },
  online_retail: {
    label: 'Online retail',
    itemStrategy: 'tabular',
    feeWhitelist: ['shipping', 'delivery', 'handling', 'packaging'],
    subtotalPriority: ['item subtotal', 'sub total', 'subtotal', 'items total', 'gross amount'],
    totalPriority: ['grand total', 'order total', 'total payable', 'total amount'],
    expectItems: true,
    merchantHints: ['Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa', 'Meesho', 'Snapdeal'],
  },
  restaurant: {
    label: 'Restaurant',
    itemStrategy: 'tabular',
    feeWhitelist: ['service charge', 'cover charge', 'tip', 'gratuity'],
    subtotalPriority: ['sub total', 'subtotal', 'gross amount', 'total before tax'],
    totalPriority: ['grand total', 'net amount', 'bill total', 'amount payable', 'total'],
    expectItems: true,
    merchantHints: [],
  },
  departmental: {
    label: 'Departmental',
    itemStrategy: 'tabular',
    feeWhitelist: [],
    subtotalPriority: ['sub total', 'mrp total', 'gross amount', 'total mrp'],
    totalPriority: ['net payable', 'grand total', 'total amount', 'amount payable'],
    expectItems: true,
    merchantHints: ['DMart', 'Reliance Smart', 'Reliance Fresh', "Spencer's", 'Star Bazaar', 'Big Bazaar', 'Vishal Mega Mart', 'Lulu'],
  },
  mandi: {
    label: 'Mandi / Wholesale produce',
    // Tabular strategy handles the QTY/WT @RATE AMT layout — deriveQtyFromRate
    // recognises the decimal-weight case and emits items with unit='kg'.
    itemStrategy: 'tabular',
    feeWhitelist: [],
    subtotalPriority: [],
    totalPriority: ['net rs', 'net amount', 'total'],
    expectItems: true,
    merchantHints: [],
  },
  pharmacy: {
    label: 'Pharmacy',
    // 4.23 — dedicated pharmacy extractor handles per-item batch/expiry/mfg
    // and strips those tokens from the row text before matchAmounts(), so
    // batch numbers like B/24/011 stop feeding `/011` into the amount list.
    itemStrategy: 'pharmacy',
    feeWhitelist: [],
    subtotalPriority: ['sub total', 'gross amount', 'mrp total'],
    totalPriority: ['net payable', 'grand total', 'total amount', 'amount payable'],
    expectItems: true,
    merchantHints: ['Apollo Pharmacy', 'MedPlus', '1mg', 'Netmeds', 'PharmEasy'],
  },
  fuel: {
    label: 'Fuel',
    itemStrategy: 'fuel',  // 4.16: liters × rate = amount, single item out
    feeWhitelist: [],
    subtotalPriority: [],
    totalPriority: ['amount', 'total', 'sale value', 'net amount'],
    expectItems: true,
    merchantHints: ['HP', 'BPCL', 'IOCL', 'Shell', 'Nayara'],
  },
  transport: {
    label: 'Transport',
    itemStrategy: 'totals-only',
    feeWhitelist: ['surge', 'toll', 'wait', 'tip'],
    subtotalPriority: ['sub total', 'fare', 'base fare'],
    totalPriority: ['total', 'total fare', 'amount paid', 'trip total'],
    expectItems: false,
    merchantHints: ['Uber', 'Ola', 'Rapido', 'BluSmart'],
  },
  utility: {
    label: 'Utility',
    itemStrategy: 'totals-only',
    feeWhitelist: [],
    subtotalPriority: ['current charges', 'energy charges', 'sub total'],
    totalPriority: ['amount payable', 'total amount payable', 'net amount', 'bill amount', 'total'],
    expectItems: false,
    merchantHints: [],
  },
  handwritten: {
    label: 'Handwritten',
    itemStrategy: 'permissive',
    feeWhitelist: [],
    subtotalPriority: ['sub total'],
    totalPriority: ['total', 'grand total', 'kul', 'amount'],
    expectItems: true,
    merchantHints: [],
  },
  generic: {
    label: 'Generic',
    itemStrategy: 'tabular',
    feeWhitelist: ['service charge', 'handling', 'delivery', 'shipping', 'packaging', 'tip', 'platform fee'],
    subtotalPriority: ['sub total', 'item total', 'subtotal', 'gross amount', 'mrp'],
    totalPriority: ['grand total', 'bill total', 'order total', 'net payable', 'amount payable', 'total'],
    expectItems: true,
    merchantHints: [],
  },
};

// Count how many of the given format's signature tests fire across the OCR text.
function scoreFormat(formatDef, fullText) {
  let hits = 0;
  const fired = [];
  for (const t of formatDef.tests) {
    if (t.test(fullText)) {
      hits++;
      fired.push(t.source);
    }
  }
  return { hits, fired };
}

// Crude "handwritten" detector: low row count + no GSTIN/FSSAI + few/no
// strong format signals + low overall keyword density.
function looksHandwritten(rows, signalsByFormat) {
  if (rows.length > 40) return false;
  const text = rows.map(r => r.text).join('\n');
  if (/GSTIN|FSSAI/i.test(text)) return false;
  const maxSignal = Math.max(0, ...Object.values(signalsByFormat).map(s => s.hits));
  // Strong format signals → not handwritten
  if (maxSignal >= 3) return false;
  // Very small bill with few rows and no strong signals → likely handwritten
  return rows.length <= 25 && maxSignal <= 1;
}

export function detectFormat(rows) {
  const fullText = rows.map(r => r.text).join('\n');
  const signals = {};
  for (const def of FORMAT_SIGNATURES) {
    signals[def.format] = scoreFormat(def, fullText);
  }

  // Pick the format with the most signature hits.
  let best = { format: 'generic', hits: 0, fired: [] };
  for (const def of FORMAT_SIGNATURES) {
    const s = signals[def.format];
    if (s.hits > best.hits) {
      best = { format: def.format, hits: s.hits, fired: s.fired };
    }
  }

  // No strong signals → handwritten or generic?
  if (best.hits < 2) {
    if (looksHandwritten(rows, signals)) {
      best = { format: 'handwritten', hits: best.hits, fired: best.fired };
    } else {
      best = { format: 'generic', hits: best.hits, fired: best.fired };
    }
  }

  const brand = matchBrand(fullText);
  const config = FORMAT_CONFIGS[best.format] || FORMAT_CONFIGS.generic;

  // Confidence in the format choice itself (0..1).
  // 3+ signals = high; 2 = medium; brand match alone = medium; else low.
  let formatConfidence = 0;
  if (best.hits >= 3) formatConfidence = 1;
  else if (best.hits === 2) formatConfidence = 0.75;
  else if (best.hits === 1) formatConfidence = 0.5;
  if (brand && config.merchantHints && config.merchantHints.includes(brand)) {
    formatConfidence = Math.max(formatConfidence, 0.8);
  }

  return {
    format: best.format,
    label: config.label,
    config,
    brand,
    formatConfidence,
    signals: best.fired,
    allSignals: signals,
  };
}

export { FORMAT_CONFIGS };

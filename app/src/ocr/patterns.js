// Shared regexes, keyword sets, and brand data for the receipt parser.
//
// Designed for the Indian receipt landscape but kept format-agnostic.
// Covered formats: dining/restaurant, quick commerce (Blinkit / Zepto /
// Instamart), food delivery (Zomato / Swiggy), online retail (Amazon /
// Flipkart / Myntra), departmental (DMart / Reliance / Spencer's),
// utility, fuel, transport, pharmacy, and handwritten kirana bills.

// ── Amount tokens ──────────────────────────────────────────────────────────
//
// Accepts either:
//   • currency-prefixed amount:  ₹72,  Rs. 1,200,  $12.99,  ₹9,  ₹1,748.00
//   • decimal-only amount:       12.99,  1090.00   (POS format with .XX cents)
//
// The first capture group holds the numeric portion of a currency-prefixed
// match; the second holds the numeric portion of a decimal-only match.
// Constraint: the integer side must be either a single run of digits
// (`\d+`) OR Indian/Western comma-thousands (`\d{1,3}(,\d{3})+`). Mixing
// these two forms — e.g. `109,0` from a stray comma — is rejected so we
// don't split `1090.00` into `109` and `0`.
export const PRICE_TOKEN_RE = /(?:₹|Rs\.?|INR\.?|\$|US\$|€|£|¥|A\$|C\$)\s*(-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)|(-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(?!\d)/gi;

export const CURRENCY_RE = /(₹|Rs\.?|INR\.?|\$|US\$|€|£|¥|A\$|C\$)/i;

// Map currency hits to a canonical symbol/code.
export function detectCurrency(text) {
  const m = String(text).match(CURRENCY_RE);
  if (!m) return null;
  const raw = m[1].toUpperCase();
  if (raw.includes('₹') || raw.startsWith('RS') || raw.startsWith('INR')) return '₹';
  if (raw.includes('$')) return '$';
  if (raw.includes('€')) return '€';
  if (raw.includes('£')) return '£';
  if (raw.includes('¥')) return '¥';
  return raw;
}

// ── Date patterns ──────────────────────────────────────────────────────────
export const DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTH_DATE_RE = new RegExp(
  '\\b(\\d{1,2})\\s+(' + MONTHS.join('|') + ')[a-z]*[,\\s]*(\\d{2,4})?\\b|\\b(' +
  MONTHS.join('|') + ')[a-z]*\\s+(\\d{1,2}),?\\s*(\\d{2,4})?\\b', 'i'
);
export const TIME_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b/;

// ── Identifiers (Indian) ────────────────────────────────────────────────────
// GSTIN: 15 chars, 2-digit state + 10-char PAN + 1 + 1 + 1
export const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]\b/i;
// FSSAI: 14-digit license number
export const FSSAI_RE = /\b(?:FSSAI[:\s]*)?(\d{14})\b/i;
// HSN/SAC codes: 4-8 digit numbers, often preceded by "HSN" or "SAC".
// Capture group 1 holds the digits for per-item extraction (4.8).
export const HSN_RE = /\b(?:HSN|SAC)[:\s]*(\d{4,8})\b/i;
// Order/invoice IDs
export const ORDER_ID_RE = /\b(?:order\s*id|invoice\s*(?:no\.?|number)?|bill\s*no\.?|receipt\s*no\.?|txn|transaction\s*id|ref\.?\s*no\.?)[:\s#]*([A-Z0-9\-_/]{5,})/i;
// Invoice-only ID (narrower than ORDER_ID_RE — used by 4.8 to populate the
// distinct invoice_number column. We keep order_id separate because retail
// receipts often have both: an order id (Amazon's internal) AND an invoice
// number (the GST document). When only one is present, the parser falls back.
export const INVOICE_NO_RE = /\binvoice\s*(?:no\.?|number|#)?[:\s#]*([A-Z0-9\-_/]{4,})/i;

// Per-component GST amounts. Each captures the numeric amount that follows
// the keyword (with optional "@rate%" before the amount). Used so 4.8 can
// split parsed.tax into cgst/sgst/igst columns.
//
//   "CGST @9%   ₹45.00"   -> 45.00
//   "SGST        45.00"   -> 45.00
//   "IGST 18%   180.00"   -> 180.00
//
// Amount regex chunk mirrors PRICE_TOKEN_RE but without the global flag.
// Rate prefix REQUIRES a trailing '%' — otherwise the optional group would
// happily swallow a real amount like "45.00" thinking it's the rate.
const TAX_RATE_PREFIX = '(?:\\s*@?\\s*\\d+(?:\\.\\d+)?\\s*%)?';
const TAX_AMOUNT_TAIL = '(?:[^\\d₹$€£¥+\\-]*?)(?:₹|Rs\\.?|INR\\.?)?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?';
export const CGST_AMOUNT_RE = new RegExp('\\bcgst\\b' + TAX_RATE_PREFIX + TAX_AMOUNT_TAIL, 'i');
export const SGST_AMOUNT_RE = new RegExp('\\bsgst\\b' + TAX_RATE_PREFIX + TAX_AMOUNT_TAIL, 'i');
export const IGST_AMOUNT_RE = new RegExp('\\bigst\\b' + TAX_RATE_PREFIX + TAX_AMOUNT_TAIL, 'i');

// Per-ITEM GST rates (4.17). Distinct from the *_AMOUNT_RE above — these
// match the rate (%) part of a per-row tax mention, NOT a bill-level amount.
// Used to populate receipt_items.{cgst,sgst,igst}_rate.
//
//   "CGST 2.5%"     -> 2.5
//   "SGST @ 2.5 %"  -> 2.5
//   "IGST 18%"      -> 18
//   "GST 5%"        -> 5     (combined; caller splits)
//   "GST @18%"      -> 18
//
// Bare "5%" without a CGST/SGST/IGST/GST keyword is intentionally NOT matched
// here — too many false positives (discount %, tip %, loyalty %). The columnar
// extractor handles the dedicated Tax% column case separately by reading the
// column header.
export const ITEM_CGST_RATE_RE = /\bcgst\b\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;
export const ITEM_SGST_RATE_RE = /\bsgst\b\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;
export const ITEM_IGST_RATE_RE = /\bigst\b\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;
// Generic combined GST rate. Captures the rate after a "GST" keyword that's
// NOT preceded by C/S/I (so we don't double-match the split forms above).
// The leading (?<!) is a negative-lookbehind on a single char + boundary.
export const ITEM_GST_RATE_RE  = /(?<![cisCIS])\bgst\b\s*@?\s*(\d+(?:\.\d+)?)\s*%/i;

// ── Pharmacy metadata (4.23) ────────────────────────────────────────────────
// Indian pharmacy receipts (Apollo, MedPlus, 1mg, PharmEasy, Netmeds) carry
// per-item batch / expiry / mfg date columns. The extractor consumes these
// and persists them on receipt_items.{batch_no, expiry_date, mfg_date}.
//
// Each regex is keyword-anchored — never matches a bare value — so non-
// pharmacy formats don't accidentally extract from random text. The capture
// group holds the value.
//
//   "Batch B/24/01"   -> B/24/01
//   "B.No: ABC123"    -> ABC123
//   "Lot No XYZ-12"   -> XYZ-12
// Token shape: starts with alphanumeric, allows /, -; 3..18 chars total
// after the leading char (so 4..19 captured). Caps trimmed in repo to 20.
export const BATCH_RE = /\b(?:batch|b\.?\s*no\.?|bn|lot(?:\s*no\.?)?)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\/\-]{2,17})/i;

//   "EXP 12/25"       -> 12/25
//   "Expiry: 12/2025" -> 12/2025
//   "Exp Dt 31/12/25" -> 31/12/25
//   "Exp. 02-2026"    -> 02-2026
// Captures the date in raw form; normaliseExpiry() in parseReceipt.js
// converts to YYYY-MM-DD (last-day-of-month if month/year only).
export const EXPIRY_RE = /\b(?:exp(?:iry)?(?:\s*dt)?|exp\.?)\s*[:.\-]?\s*((?:\d{1,2}[\/\-\.]){1,2}\d{2,4})/i;

//   "MFG 06/2024"     -> 06/2024
//   "M.Dt 15/06/24"   -> 15/06/24
//   "Mfd: 01/04/2024" -> 01/04/2024
// Same shape as EXPIRY_RE. Normalised to first-day-of-month if month/year only.
export const MFG_RE = /\b(?:mfg(?:\s*dt)?|m\.?\s*dt|mfd)\s*[:.\-]?\s*((?:\d{1,2}[\/\-\.]){1,2}\d{2,4})/i;

// ── Keyword sets ───────────────────────────────────────────────────────────
//
// Each keyword set is an array of phrase fragments. They are compiled into
// regex unions by `unionRe()` below — order matters there (longer phrases
// should come first to win the alternation).

export const TOTAL_KEYWORDS = [
  'grand\\s*total',
  'bill\\s*total',
  'order\\s*total',
  'final\\s*total',
  'net\\s*total',
  'net\\s*payable',
  'total\\s*payable',
  'amount\\s*payable',
  'payable\\s*amount',
  'amount\\s*due',
  'amt\\.?\\s*due',
  'total\\s*amount',
  'total\\s*due',
  'balance\\s*due',
  'you\\s*pay',
  'you\\s*owe',
  'final\\s*amount',
  'amount\\s*to\\s*pay',
  'net\\s*rs',
  'net\\s*amount',
  'total',
];

export const SUBTOTAL_KEYWORDS = [
  'sub\\s*total',
  'subtotal',
  'item\\s*total',
  'items\\s*total',
  'gross\\s*amount',
  'gross\\s*total',
  'basic\\s*amount',
  'total\\s*before\\s*tax',
  'mrp\\s*total',
  'mrp',
];

export const TAX_KEYWORDS = [
  'cgst', 'sgst', 'igst', 'ugst',
  'gst', 'vat',
  'service\\s*tax',
  'sales\\s*tax',
  'taxes\\s*(?:and|&)\\s*charges',
  'tax(?:es)?',
];

// Lines that look like an item line but are actually fees / surcharges.
// Tracked separately so the parser can report them and not treat as items.
export const FEE_KEYWORDS = [
  'service\\s*charge',
  'service\\s*fee',
  'handling\\s*(?:charge|fee)',
  'handling',
  'delivery\\s*(?:charges?|fee)',
  'delivery',
  'shipping\\s*(?:charges?|fee)?',
  'shipping',
  'packaging\\s*(?:charges?|fee)?',
  'packaging',
  'platform\\s*fee',
  'convenience\\s*fee',
  'processing\\s*fee',
  'restaurant\\s*charges',
  'tip',
  'gratuity',
  'surcharge',
  'fuel\\s*surcharge',
  'cover\\s*charge',
];

export const DISCOUNT_KEYWORDS = [
  'discount',
  'savings?',
  'you\\s*saved',
  'promo\\s*(?:applied|code)?',
  'coupon\\s*(?:applied|code)?',
  'offer\\s*applied',
  'cashback',
  '\\bsav\\b',
  '\\boff\\b',
];

// Metadata / non-line-item rows.
export const META_KEYWORDS = [
  'order\\s*id',
  'invoice\\s*(?:no\\.?|number)?',
  'bill\\s*(?:no\\.?|number)?',
  'receipt\\s*(?:no\\.?|number)?',
  'transaction\\s*id',
  'txn\\s*id',
  'ref\\.?\\s*no\\.?',
  'payment',
  'paid\\s*via',
  'paid\\s*by',
  'card\\s*ending',
  'cash',
  'credit\\s*card',
  'debit\\s*card',
  'upi',
  'wallet',
  'deliver\\s*to',
  'delivery\\s*address',
  'shipping\\s*address',
  'billing\\s*address',
  'customer\\s*name',
  'mobile',
  'phone',
  'email',
  'gstin',
  'fssai',
  'cin',
  'pan\\s*no',
  'hsn',
  'sac',
  'table\\s*(?:no\\.?|number)?',
  'server',
  'steward',
  'captain',
  'cashier',
  'cover',
  'kot',
  'host',
  'billing\\s*period',
  'due\\s*date',
  'account\\s*(?:no\\.?|number)?',
  'meter\\s*(?:no\\.?|number)?',
  'consumer\\s*(?:no\\.?|number)?',
  'order\\s*placed',
  'order\\s*details',
  'order\\s*summary',
  'order\\s*confirmed',
  'need\\s*help',
  'thank\\s*you',
  'visit\\s*again',
  'chat\\s*with\\s*us',
];

// Headers that mark the start of the bill section (above-this = items area).
export const BILL_HEADER_KEYWORDS = [
  'bill\\s*(?:details|summary|amount)',
  'payment\\s*details',
  'price\\s*details',
  'order\\s*summary',
  'invoice\\s*details',
  'tax\\s*invoice',
];

// ── Item-line patterns ─────────────────────────────────────────────────────
// Used to recognize whether a single OCR line itself is shaped like an
// "item name + price" line, vs. one of the above special-purpose rows.
// Quantity multipliers on items, e.g. "2 x", "x 2", "440 ml x 2".
export const QTY_MULTIPLIER_LEAD_RE = /^\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s+/i;
export const QTY_MULTIPLIER_TRAIL_RE = /\s+[x×*]\s*(\d+(?:[.,]\d+)?)\s*$/i;

// "Half" / "Full" portion words (restaurant menus)
export const PORTION_WORDS_RE = /\b(half|full|quarter|small|medium|large|reg(?:ular)?)\b/i;

// ── Brand recognition ──────────────────────────────────────────────────────
// Used to guess the merchant when receipts don't put a clear header line.
// Each entry: [canonical name, regex]. Order is irrelevant; we score by
// longest match.
export const KNOWN_BRANDS = [
  // Quick commerce
  ['Blinkit',          /\bblinkit\b/i],
  ['Zepto',            /\bzepto\b/i],
  ['Swiggy Instamart', /\binstamart\b/i],
  ['BigBasket',        /\bbig\s*basket\b/i],
  ['BB Now',           /\bbb\s*now\b/i],
  ['Dunzo',            /\bdunzo\b/i],
  // Food delivery
  ['Zomato',           /\bzomato\b/i],
  ['Swiggy',           /\bswiggy\b/i],
  ['Uber Eats',        /\buber\s*eats\b/i],
  ['EatSure',          /\beat\s*sure\b/i],
  // Online retail
  ['Amazon',           /\bamazon(?:\.in|\.com)?\b/i],
  ['Flipkart',         /\bflipkart\b/i],
  ['Myntra',           /\bmyntra\b/i],
  ['Ajio',             /\bajio\b/i],
  ['Tata CLiQ',        /\btata\s*cliq\b/i],
  ['Nykaa',            /\bnykaa\b/i],
  ['Meesho',           /\bmeesho\b/i],
  ['Snapdeal',         /\bsnapdeal\b/i],
  // Departmental / supermarket
  ['DMart',            /\bd[\s\-]?mart\b/i],
  ['Reliance Smart',   /\breliance\s*smart\b/i],
  ['Reliance Fresh',   /\breliance\s*fresh\b/i],
  ["Spencer's",        /\bspencer'?s\b/i],
  ['More',             /\bmore\s*(?:retail|supermarket)\b/i],
  ['Star Bazaar',      /\bstar\s*bazaar\b/i],
  ['Big Bazaar',       /\bbig\s*bazaar\b/i],
  ['Lulu',             /\blulu\b/i],
  ['Hypercity',        /\bhypercity\b/i],
  ['Vishal Mega Mart', /\bvishal\s*mega\s*mart\b/i],
  // Pharmacy
  ['Apollo Pharmacy',  /\bapollo\s*pharmacy\b/i],
  ['MedPlus',          /\bmed\s*plus\b/i],
  ['1mg',              /\b1\s*mg\b|\btata\s*1\s*mg\b/i],
  ['Netmeds',          /\bnetmeds\b/i],
  ['PharmEasy',        /\bpharm\s*easy\b/i],
  // Fuel
  ['HP',               /\bhindustan\s*petroleum\b|\bhpcl\b/i],
  ['BPCL',             /\bbharat\s*petroleum\b|\bbpcl\b/i],
  ['IOCL',             /\bindian\s*oil\b|\biocl\b/i],
  ['Shell',            /\bshell\b/i],
  ['Nayara',           /\bnayara\b/i],
  // Transport
  ['Uber',             /\buber\b(?!\s*eats)/i],
  ['Ola',              /\bola\s*(?:cabs|electric|auto)?\b/i],
  ['Rapido',           /\brapido\b/i],
  ['BluSmart',         /\bblu\s*smart\b/i],
  // Cafés / chains
  ['Starbucks',        /\bstarbucks\b/i],
  ['Café Coffee Day',  /\bcaf[eé]\s*coffee\s*day\b|\bccd\b/i],
  ["McDonald's",       /\bmc\s*donald'?s?\b/i],
  ['KFC',              /\bkfc\b/i],
  ['Domino’s',    /\bdomino'?s\b/i],
  ['Pizza Hut',        /\bpizza\s*hut\b/i],
  ['Subway',           /\bsubway\b/i],
  ['Burger King',      /\bburger\s*king\b/i],
];

// ── Format-detection signatures ────────────────────────────────────────────
// Each signature is a list of regex tests. The format with the most matches
// wins. Ties are broken by the order below (earlier = more specific).
export const FORMAT_SIGNATURES = [
  {
    format: 'quick_commerce',
    label: 'Quick commerce',
    tests: [
      /\bblinkit\b|\bzepto\b|\binstamart\b|\bbb\s*now\b|\bdunzo\b/i,
      /arriving\s+in\s+\d+\s*min/i,
      /\bitems?\s+in\s+this\s+order\b/i,
      /handling\s*charge/i,
      /\bmrp\b/i,
      /bill\s*details/i,
    ],
  },
  {
    format: 'food_delivery',
    label: 'Food delivery',
    tests: [
      /\bzomato\b|\bswiggy\b(?!\s*instamart)|\buber\s*eats\b/i,
      /item\s*total/i,
      /platform\s*fee/i,
      /restaurant\s*charges/i,
      /delivery\s*(?:fee|partner)/i,
      /taxes\s*(?:and|&)\s*charges/i,
    ],
  },
  {
    format: 'online_retail',
    label: 'Online retail',
    tests: [
      /\bamazon\b|\bflipkart\b|\bmyntra\b|\bajio\b|\bmeesho\b/i,
      /order\s*id/i,
      /\b(?:item\s*subtotal|items?\s*\(\d+\))/i,
      /(?:shipped|sold)\s*by/i,
      /shipping\s*charges?/i,
      /\bgrand\s*total\b/i,
      /tax\s*invoice/i,
    ],
  },
  {
    format: 'restaurant',
    label: 'Restaurant',
    tests: [
      /\b(?:steward|server|captain|waiter)\b/i,
      /\bkot\b/i,
      /\btable\s*(?:no\.?|number|#)?\s*\d/i,
      /service\s*charge/i,
      /\bcover\s*charge\b/i,
      /(?:cgst|sgst)\s*@?\s*\d/i,
      /\bfssai\b/i,
    ],
  },
  {
    format: 'mandi',
    label: 'Mandi / Wholesale produce',
    // Sabzi-mandi and wholesale-produce printers use a recognisable column
    // header — "ITEM NAME QTY/WT @RATE AMT Rs." — and weight-priced rows
    // (qty in kg, 3 decimals) with NET Rs. at the bottom. Distinguishing
    // them from departmental matters because the item extractor needs to
    // treat the decimal qty column as a weight (kg), not a count.
    tests: [
      /\bqty\s*\/\s*wt\b/i,
      /@\s*rate\b/i,
      /\bamt\s+rs\.?/i,
      /\bnet\s+rs\.?/i,
      /\bitem\s+name\b/i,
    ],
  },
  {
    format: 'departmental',
    label: 'Departmental',
    tests: [
      /\bd[\s\-]?mart\b|\breliance\s*(?:smart|fresh)\b|\bspencer'?s\b|\bbig\s*bazaar\b|\bvishal\s*mega\s*mart\b|\blulu\b/i,
      /\bitems?\s*[:#]\s*\d+\b/i,
      /\bhsn\b/i,
      /\bmrp\b.*\bnet\s*payable\b/is,
      /\bcashier\b/i,
      /\bloyalty\b/i,
    ],
  },
  {
    format: 'pharmacy',
    label: 'Pharmacy',
    tests: [
      /\bapollo\s*pharmacy\b|\bmed\s*plus\b|\bnetmeds\b|\bpharm\s*easy\b|\b1\s*mg\b/i,
      /\bbatch\b/i,
      /\bexp(?:iry)?\s*(?:date)?\b/i,
      /\bmfg\s*(?:date)?\b/i,
      /\bschedule\s*h\b/i,
    ],
  },
  {
    format: 'fuel',
    label: 'Fuel',
    tests: [
      /\b(?:petrol|diesel|cng|gasoline|fuel)\b/i,
      /\b(?:litres?|liters?)\b/i,
      /\brate\s*\/\s*l(?:tr|itre)?\b/i,
      /\bnozzle\b/i,
      /\bdensity\b/i,
      /\bhpcl\b|\bbpcl\b|\biocl\b|\bnayara\b|\bshell\b/i,
    ],
  },
  {
    format: 'transport',
    label: 'Transport',
    tests: [
      /\buber\b(?!\s*eats)|\bola\b|\brapido\b|\bblu\s*smart\b/i,
      /\btrip\b/i,
      /\bsurge\b/i,
      /\bbase\s*fare\b/i,
      /\bdistance\s*fare\b/i,
      /\btoll\b/i,
      /\bpickup\b/i,
    ],
  },
  {
    format: 'utility',
    label: 'Utility',
    tests: [
      /\bdue\s*date\b/i,
      /\bbilling\s*period\b/i,
      /\bprevious\s*(?:balance|reading)\b/i,
      /\benergy\s*charges?\b/i,
      /\bfixed\s*charges?\b/i,
      /\btariff\b/i,
      /\bconsumer\s*(?:no\.?|number)\b/i,
      /\bmeter\s*(?:no\.?|number)\b/i,
      /\bunits\s*consumed\b/i,
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
// Build a `\b(a|b|c)\b` regex (case-insensitive, longest-alternation-first).
export function unionRe(words, opts = {}) {
  const sorted = words.slice().sort((a, b) => b.length - a.length);
  const flags = opts.flags ?? 'i';
  return new RegExp(`\\b(?:${sorted.join('|')})\\b`, flags);
}

export const TOTAL_RE     = unionRe(TOTAL_KEYWORDS);
export const SUBTOTAL_RE  = unionRe(SUBTOTAL_KEYWORDS);
export const TAX_RE       = unionRe(TAX_KEYWORDS);
export const FEE_RE       = unionRe(FEE_KEYWORDS);
export const DISCOUNT_RE  = unionRe(DISCOUNT_KEYWORDS);
export const META_RE      = unionRe(META_KEYWORDS);
export const BILL_HDR_RE  = unionRe(BILL_HEADER_KEYWORDS);

// META_KEYWORDS members that show up as PER-ROW COLUMN LABELS on departmental,
// restaurant, and grocery receipts (e.g. "HSN.", "SAC." printed alongside each
// item's qty/rate/amt). These must NOT cause the entire item row to be skipped
// — otherwise every item on a SUPERMART / DMart / Reliance Smart bill gets
// dropped before extraction. They stay in META_KEYWORDS so META_RE /
// looksLikeMetaOnly still classify a STANDALONE "HSN: 04039000" row as
// metadata for totals / merchant detection.
const COLUMN_LABEL_META_KEYWORDS = new Set(['hsn', 'sac']);

// Identifies rows that should never become items.
// Catches: totals, subtotals, taxes, fees, discounts, metadata, bill headers.
export const SKIP_RE = new RegExp(
  '(?:' + [
    ...TOTAL_KEYWORDS,
    ...SUBTOTAL_KEYWORDS,
    ...TAX_KEYWORDS,
    ...FEE_KEYWORDS,
    ...DISCOUNT_KEYWORDS,
    ...META_KEYWORDS.filter(k => !COLUMN_LABEL_META_KEYWORDS.has(k)),
    ...BILL_HEADER_KEYWORDS,
  ].sort((a, b) => b.length - a.length).join('|') + ')',
  'i'
);

// Tries to match an OCR line against the known brand list. Returns the
// canonical brand name (longest match) or null.
export function matchBrand(text) {
  let best = null;
  let bestLen = 0;
  for (const [name, re] of KNOWN_BRANDS) {
    const m = String(text).match(re);
    if (m && m[0].length > bestLen) {
      best = name;
      bestLen = m[0].length;
    }
  }
  return best;
}

// ── Amount handling ────────────────────────────────────────────────────────
export function parseAmount(str) {
  const v = parseFloat(String(str).replace(/[, ]/g, '').replace(',', '.'));
  return isFinite(v) ? +v.toFixed(2) : NaN;
}

// Return all amount tokens found in `text` along with their positions.
export function matchAmounts(text) {
  PRICE_TOKEN_RE.lastIndex = 0;
  const out = [];
  let m;
  while ((m = PRICE_TOKEN_RE.exec(text))) {
    const num = m[1] ?? m[2];
    const v = parseAmount(num);
    if (isFinite(v)) {
      // Detect a "+" or "-" sign immediately before the match (e.g. "+₹9", "-₹50").
      let signedValue = v;
      const before = text.slice(Math.max(0, m.index - 2), m.index);
      if (/-\s*$/.test(before)) signedValue = -Math.abs(v);
      out.push({
        value: signedValue,
        absValue: Math.abs(v),
        start: m.index,
        end: m.index + m[0].length,
        raw: m[0],
      });
    }
  }
  return out;
}

export function pickAmount(text, { allowNegative = false } = {}) {
  const arr = matchAmounts(text);
  if (!arr.length) return NaN;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (allowNegative || arr[i].value > 0) return arr[i].value;
  }
  return arr[arr.length - 1].value;
}

// True when, after removing digits and common unit words, almost no letters
// remain. e.g. "1 ltr x 1", "440 ml x 2", "2 nos".
export function looksLikeQtyOnly(text) {
  const cleaned = String(text)
    .replace(/\d+(?:[.,]\d+)?/g, '')
    .replace(/\b(ltrs?|litres?|liters?|l|ml|kgs?|kilograms?|gms?|grams?|g|pcs?|pieces?|pack|packs?|each|x|nos?|dozens?|qty)\b/gi, '')
    .replace(/[xX×*+\-:@]/g, '')
    .replace(/\s+/g, '')
    .trim();
  return cleaned.length < 3;
}

// True when the row's text strongly looks like a metadata row (no real item).
export function looksLikeMetaOnly(text) {
  if (!text) return true;
  if (META_RE.test(text)) return true;
  if (GSTIN_RE.test(text)) return true;
  if (FSSAI_RE.test(text)) return true;
  return false;
}

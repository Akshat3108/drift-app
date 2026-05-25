// 7.15 — CSV statement parsers.
//
// Three Indian-bank formats:
//   - 'hdfc'      → HDFC Bank savings statement
//   - 'sbi'       → State Bank of India savings statement
//   - 'icici_cc'  → ICICI credit-card statement
//
// Each parser is a pure function: text → {rows, format, error}. `rows` is
// oldest→newest (parser preserves the file order). `detectFormat(text)`
// runs the header-signature regexes; unknown formats return 'unknown' with
// rows=[] and a human-readable error.
//
// Format churn risk: banks reorder/rename columns occasionally. The parser
// is signature-detected so old files still parse cleanly even when the
// bank ships a new layout; adding a new signature is a 5-line patch.

const FORMAT_SIGNATURES = [
  { format: 'hdfc',     pattern: /HDFC\s*BANK|HDFC0|narration.*chq.*value\s*dt.*withdrawal/i },
  { format: 'sbi',      pattern: /STATE\s*BANK\s*OF\s*INDIA|SBIN0|txn\s*date.*description.*ref\s*no|debit.*credit.*balance/i },
  { format: 'icici_cc', pattern: /ICICI.*CREDIT\s*CARD|transaction\s*date.*reference\s*number.*amount\s*\((inr|in\s*rs)\)/i },
];

// Header keywords (lowercased). Each parser uses these for two purposes:
//   - detect which line is the header (skip everything above)
//   - map header column index → field name
const HEADER_HINTS = {
  hdfc: {
    date: ['date'],
    description: ['narration', 'particulars'],
    withdrawal: ['withdrawal amt', 'withdrawal', 'debit'],
    deposit:    ['deposit amt', 'deposit', 'credit'],
    refno:      ['chq./ref.no', 'ref.no', 'chq', 'ref no'],
  },
  sbi: {
    date: ['txn date', 'date'],
    description: ['description', 'particulars'],
    debit: ['debit', 'withdrawal'],
    credit: ['credit', 'deposit'],
    refno: ['ref no', 'cheque no', 'ref'],
  },
  icici_cc: {
    date: ['transaction date', 'date'],
    description: ['transaction details', 'particulars', 'merchant'],
    amount: ['amount (inr)', 'amount (in rs)', 'amount'],
    type:   ['debit/credit', 'type'],
    refno:  ['reference number', 'ref no'],
  },
};

export function detectFormat(text) {
  if (!text || typeof text !== 'string') return 'unknown';
  // Look at the first 5000 chars only — header is always near the top.
  const head = text.slice(0, 5000);
  for (const sig of FORMAT_SIGNATURES) {
    if (sig.pattern.test(head)) return sig.format;
  }
  return 'unknown';
}

// CSV parse helper — handles quoted fields with embedded commas/quotes.
// Returns array-of-arrays. Skips trailing empty rows.
export function splitCsv(text) {
  const out = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'; i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); cell = '';
        if (row.some(c => c.trim() !== '')) out.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some(c => c.trim() !== '')) out.push(row);
  }
  return out;
}

// Normalize a date string into YYYY-MM-DD. Accepts dd/mm/yyyy, dd-MMM-yyyy,
// dd/MM/yy, etc. Returns null on parse failure.
const MONTHS_3 = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                   jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
export function normalizeDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  // dd-MMM-yyyy or dd-MMM-yy or dd MMM yyyy
  let m = /^(\d{1,2})[\s\-\/](\w{3})[\s\-\/](\d{2,4})$/.exec(str);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mo = MONTHS_3[m[2].toLowerCase()];
    if (!mo) return null;
    let yy = m[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? '19' : '20') + yy;
    return `${yy}-${mo}-${dd}`;
  }
  // dd/MM/yyyy or dd-MM-yyyy
  m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(str);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) yy = (Number(yy) > 50 ? '19' : '20') + yy;
    return `${yy}-${mo}-${dd}`;
  }
  // yyyy-MM-dd already
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (m) return str;
  return null;
}

// Strip rupee symbols, commas, parentheses (which sometimes wrap negatives)
// and trailing 'CR'/'DR' markers from an amount cell.
export function parseAmount(s) {
  if (s == null) return 0;
  let str = String(s).trim();
  if (!str) return 0;
  // Some banks wrap negatives in parens
  const negParen = /^\(.*\)$/.test(str);
  str = str.replace(/[₹,\s()]/g, '');
  // 'CR' / 'DR' trailing/leading markers
  let isCredit = false;
  if (/CR$/i.test(str)) { isCredit = true; str = str.replace(/CR$/i, ''); }
  else if (/DR$/i.test(str)) { str = str.replace(/DR$/i, ''); }
  const n = parseFloat(str);
  if (!Number.isFinite(n)) return 0;
  const v = negParen ? -Math.abs(n) : n;
  return { value: v, credit: isCredit };
}

// Map header row → column-index lookup using HEADER_HINTS for the given format.
function mapColumns(headerRow, format) {
  const hints = HEADER_HINTS[format] || {};
  const idx = {};
  for (let i = 0; i < headerRow.length; i += 1) {
    const cell = String(headerRow[i] || '').trim().toLowerCase();
    if (!cell) continue;
    for (const [field, options] of Object.entries(hints)) {
      if (idx[field] != null) continue;
      for (const opt of options) {
        if (cell === opt || cell.includes(opt)) { idx[field] = i; break; }
      }
    }
  }
  return idx;
}

// Find the row index that looks like the header for the given format.
function findHeaderIdx(grid, format) {
  const hints = HEADER_HINTS[format] || {};
  const targetFields = Object.keys(hints);
  let bestIdx = -1;
  let bestScore = 0;
  // Scan up to first 30 rows — banks include long preambles.
  for (let i = 0; i < Math.min(grid.length, 30); i += 1) {
    const map = mapColumns(grid[i], format);
    const score = Object.keys(map).length;
    if (score > bestScore && score >= Math.min(targetFields.length, 3)) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Pure parser — returns {rows, format, error?, header_skipped, total_lines}.
// Each row carries {date, amount (positive number), merchant, type, notes}.
// type is 'debit' for an outflow (money out of the user's account/card) and
// 'credit' for an inflow.  CSV import is for expenses, so the UI defaults
// to importing debits only; credits are flagged with type='credit' for the
// user to opt-in to import.
export function parseCSV(text) {
  const format = detectFormat(text);
  if (format === 'unknown') {
    return { rows: [], format, error: 'Unrecognised CSV format — supports HDFC, SBI, ICICI credit card.' };
  }
  const grid = splitCsv(text);
  if (grid.length === 0) {
    return { rows: [], format, error: 'Empty CSV.' };
  }
  const headerIdx = findHeaderIdx(grid, format);
  if (headerIdx < 0) {
    return { rows: [], format, error: 'Could not find a header row.' };
  }
  const columns = mapColumns(grid[headerIdx], format);
  const rows = [];
  for (let i = headerIdx + 1; i < grid.length; i += 1) {
    const r = grid[i];
    const parsed = parseRow(r, columns, format);
    if (parsed) rows.push(parsed);
  }
  return {
    rows, format,
    header_skipped: headerIdx,
    total_lines: grid.length,
  };
}

function parseRow(cells, idx, format) {
  const dateRaw = idx.date != null ? cells[idx.date] : null;
  const date = normalizeDate(dateRaw);
  if (!date) return null;
  const description = idx.description != null ? String(cells[idx.description] || '').trim() : '';
  if (!description) return null;

  if (format === 'icici_cc') {
    const amtRaw = idx.amount != null ? cells[idx.amount] : null;
    const parsed = parseAmount(amtRaw);
    if (parsed === 0) return null;
    const amt = Math.abs(parsed.value);
    const typeCell = idx.type != null ? String(cells[idx.type] || '').toLowerCase() : '';
    const isCredit = parsed.credit || /credit|cr|payment received/i.test(typeCell) || parsed.value < 0;
    return {
      date,
      amount: amt,
      merchant: cleanMerchant(description),
      type: isCredit ? 'credit' : 'debit',
      notes: description,
    };
  }

  // hdfc / sbi — debit + credit columns
  const debitRaw  = idx.debit  != null ? cells[idx.debit]  : (idx.withdrawal != null ? cells[idx.withdrawal] : null);
  const creditRaw = idx.credit != null ? cells[idx.credit] : (idx.deposit    != null ? cells[idx.deposit]    : null);
  const debit  = parseAmount(debitRaw);
  const credit = parseAmount(creditRaw);
  const debitV  = typeof debit  === 'object' ? Math.abs(debit.value)  : Math.abs(debit  || 0);
  const creditV = typeof credit === 'object' ? Math.abs(credit.value) : Math.abs(credit || 0);
  if (debitV === 0 && creditV === 0) return null;
  if (debitV > 0) {
    return {
      date, amount: debitV, merchant: cleanMerchant(description),
      type: 'debit', notes: description,
    };
  }
  return {
    date, amount: creditV, merchant: cleanMerchant(description),
    type: 'credit', notes: description,
  };
}

// Tighten the merchant string. Removes UPI prefixes like UPI/<txnid>/<vpa>,
// trailing transaction IDs, and reference numbers — what remains is closer
// to a recognisable merchant name.
export function cleanMerchant(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  // UPI: 'UPI/<txnid>/Cafe Cuba/...' → 'Cafe Cuba'
  const upi = /^UPI\/[^\/]+\/([^\/]+)/i.exec(s);
  if (upi) s = upi[1];
  // POS / NEFT prefixes
  s = s.replace(/^(POS|NEFT|RTGS|IMPS|ATW)[^A-Za-z]*/i, '');
  // Drop trailing transaction ids (long digit runs, often 8+)
  s = s.replace(/\s+\d{8,}\s*$/, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

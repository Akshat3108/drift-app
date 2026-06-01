// 5.7 — pure-JS export generators. No React, no DB, no native. Takes already-
// fetched row arrays + a `meta` block and emits text in CSV / JSON / HTML.
// The Export screen drives this; the 5.8 batch-export path piggybacks on the
// same generators by handing in an `ids`-filtered subset.

// RFC-4180 quoting. Wraps the value in double quotes if it contains comma,
// double-quote, CR, or LF; doubles up any embedded double-quotes. null /
// undefined render as empty cells.
export function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells) {
  return cells.map(escapeCSV).join(',');
}

// Bool → 'yes' / 'no' / ''. SQLite stores recurring as INTEGER 0/1; keep the
// CSV cell human-friendly.
function boolCell(v) {
  if (v === 1 || v === true) return 'yes';
  if (v === 0 || v === false) return 'no';
  return '';
}

const EXPENSES_HEADER = [
  'id', 'date', 'merchant', 'amount', 'category',
  'payment_method', 'mood', 'recurring', 'notes',
  'gstin', 'invoice_number', 'cgst', 'sgst', 'igst',
];

const ITEMS_HEADER = [
  'id', 'expense_id', 'purchase_date', 'merchant',
  'name', 'normalized_name', 'kind',
  'qty', 'unit', 'unit_price', 'price',
  'hsn', 'cgst_rate', 'sgst_rate', 'igst_rate',
  'batch_no', 'expiry_date', 'mfg_date',
  'category',
];

const INCOME_HEADER = [
  'id', 'date', 'source', 'amount', 'recurring', 'notes',
];

// PS-31 — investments sheet. Point-in-time holdings (not date-ranged), with the
// derived cost-basis / market-value / gain columns the app already computes.
const HOLDINGS_HEADER = [
  'id', 'kind', 'label', 'units', 'unit_cost', 'current_nav',
  'cost_basis', 'market_value', 'gain', 'last_updated', 'account_id', 'notes',
];

function holdingCols(h) {
  const units = Number(h.units) || 0;
  const cost = h.cost_basis != null ? Number(h.cost_basis) : units * (Number(h.unit_cost) || 0);
  const market = h.current_value != null ? Number(h.current_value) : units * (Number(h.current_nav) || 0);
  return { cost, market, gain: market - cost };
}

export function expensesToCSV(rows) {
  const lines = [csvRow(EXPENSES_HEADER)];
  for (const e of rows || []) {
    lines.push(csvRow([
      e.id,
      e.expense_date,
      e.merchant,
      e.amount,
      e.category_name || '',
      e.payment_method || '',
      e.mood || '',
      boolCell(e.recurring),
      e.notes || '',
      e.gstin || '',
      e.invoice_number || '',
      e.cgst ?? '',
      e.sgst ?? '',
      e.igst ?? '',
    ]));
  }
  return lines.join('\n');
}

export function itemsToCSV(rows) {
  const lines = [csvRow(ITEMS_HEADER)];
  for (const r of rows || []) {
    lines.push(csvRow([
      r.id,
      r.expense_id,
      r.purchase_date,
      r.merchant || '',
      r.name,
      r.normalized_name || '',
      r.kind || '',
      r.qty ?? '',
      r.unit || '',
      r.unit_price ?? '',
      r.price ?? '',
      r.hsn || '',
      r.cgst_rate ?? '',
      r.sgst_rate ?? '',
      r.igst_rate ?? '',
      r.batch_no || '',
      r.expiry_date || '',
      r.mfg_date || '',
      r.category_name || '',
    ]));
  }
  return lines.join('\n');
}

export function incomeToCSV(rows) {
  const lines = [csvRow(INCOME_HEADER)];
  for (const i of rows || []) {
    lines.push(csvRow([
      i.id,
      i.received_date,
      i.source,
      i.amount,
      boolCell(i.recurring),
      i.notes || '',
    ]));
  }
  return lines.join('\n');
}

export function holdingsToCSV(rows) {
  const lines = [csvRow(HOLDINGS_HEADER)];
  for (const h of rows || []) {
    const { cost, market, gain } = holdingCols(h);
    lines.push(csvRow([
      h.id, h.kind, h.label,
      h.units ?? '', h.unit_cost ?? '', h.current_nav ?? '',
      cost.toFixed(2), market.toFixed(2), gain.toFixed(2),
      h.last_updated || '', h.account_id ?? '', h.notes || '',
    ]));
  }
  return lines.join('\n');
}

// One concatenated text file with section dividers. Excel opens it as a
// single sheet with the dividers visible as malformed rows; humans can split
// on `# section:` to recover the CSVs. Keeps the share UX to a single file.
export function bundleToCSV({ expenses, items, income, holdings, meta }) {
  const parts = [];
  parts.push(`# Drift export · generated ${meta?.generatedAt || ''}`);
  if (meta?.rangeLabel) parts.push(`# Range: ${meta.rangeLabel}`);
  if (meta?.note)       parts.push(`# Note: ${meta.note}`);
  if (expenses) {
    parts.push('');
    parts.push(`# section: expenses (${expenses.length})`);
    parts.push(expensesToCSV(expenses));
  }
  if (items) {
    parts.push('');
    parts.push(`# section: items (${items.length})`);
    parts.push(itemsToCSV(items));
  }
  if (income) {
    parts.push('');
    parts.push(`# section: income (${income.length})`);
    parts.push(incomeToCSV(income));
  }
  if (holdings) {
    parts.push('');
    parts.push(`# section: investments (${holdings.length})`);
    parts.push(holdingsToCSV(holdings));
  }
  return parts.join('\n');
}

// One combined JSON object. Sections omitted entirely (not empty arrays) when
// the caller didn't include them; clear distinction between "no rows" and
// "didn't ask for this entity".
export function bundleToJSON({ expenses, items, income, holdings, meta }) {
  const out = {
    meta: {
      app: 'Drift',
      version: 1,
      generatedAt: meta?.generatedAt || new Date().toISOString(),
      rangeLabel: meta?.rangeLabel || 'All time',
      ...(meta?.note ? { note: meta.note } : {}),
    },
  };
  if (expenses) out.expenses = expenses;
  if (items)    out.items    = items;
  if (income)   out.income   = income;
  if (holdings) out.investments = holdings;
  return JSON.stringify(out, null, 2);
}

// HTML escape — used everywhere a row cell or merchant string lands inside
// the PDF template. Centralised so we never forget a field.
export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtAmount(n, sym) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  return `${sym}${Number(n).toFixed(2)}`;
}

function groupByMonth(rows) {
  const map = new Map();
  for (const e of rows) {
    const m = (e.expense_date || '').slice(0, 7) || 'unknown';
    if (!map.has(m)) map.set(m, []);
    map.get(m).push(e);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

// PS-14 — Compute an ITR-style summary from an expense slice + optional
// PS-11/PS-12 enrichments passed in via `meta.fyData`. Pure function so the
// /tmp/ validator can call it without React Native.
//
// Inputs:
//   expenses      — slice from expRepo.listForExport (date-range filtered)
//   fyData        — optional { policiesPaid, loanBenefit, fyStart, fyEnd }
//                   sourced by the Export screen for the FY presets.
//
// Returns:
//   {
//     bigSpends:    [{merchant, amount, expense_date, category_name}, …]   — > 50k
//     gstInput:     { totalGst }                                          — best-effort
//     section80C:   { amount, items: [{label, amount}] }                  — capped at 1.5L
//     section80D:   { amount, items: [{label, amount}] }                  — capped at 25k (display only; user-side adjustment)
//     section24B:   { amount, items: [{label, amount}] }                  — capped at 2L
//   }
//
// GST input credit: existing schema does NOT track GST per expense beyond
// what 5.11 may have persisted. We sum any column named `gst_amount` or
// `tax_amount` if the slice carries one; otherwise reports as 0. The PDF
// will note this clearly.
export function fyTaxSummary({ expenses, fyData, sym = '₹' }) {
  const expRows = expenses || [];
  const big = expRows
    .filter(e => Number(e.amount) > 50000)
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  let totalGst = 0;
  for (const e of expRows) {
    const g = Number(e.gst_amount) || Number(e.tax_amount) || 0;
    if (g > 0) totalGst += g;
  }

  // 80C: insurance premiums paid (life/term/health) + loan principal (kind:home, tax_eligible).
  // 80D: health insurance premiums paid.
  // 24B: home-loan interest (kind:home, tax_eligible).
  const policiesPaid = fyData?.policiesPaid || []; // [{ kind, label, paid }]
  const loanBenefit  = fyData?.loanBenefit  || []; // [{ name, principal, interest, eligible }]

  const section80C = { amount: 0, items: [] };
  const section80D = { amount: 0, items: [] };
  for (const p of policiesPaid) {
    if (p.kind === 'health') {
      section80D.items.push({ label: p.label, amount: p.paid });
      section80D.amount += p.paid;
    } else if (p.kind === 'life' || p.kind === 'term') {
      section80C.items.push({ label: p.label, amount: p.paid });
      section80C.amount += p.paid;
    }
  }
  const section24B = { amount: 0, items: [] };
  for (const l of loanBenefit) {
    if (!l.eligible) continue;
    if (l.principal > 0) {
      section80C.items.push({ label: `${l.name} (principal)`, amount: l.principal });
      section80C.amount += l.principal;
    }
    if (l.interest > 0) {
      section24B.items.push({ label: `${l.name} (interest)`, amount: l.interest });
      section24B.amount += l.interest;
    }
  }

  return {
    bigSpends:   big,
    gstInput:    { totalGst },
    section80C,
    section80D,
    section24B,
  };
}

// Statement-style PDF template. Inline CSS only (expo-print HTML mode doesn't
// run external requests). The @page rules give a roughly A4 layout with a
// repeated table header on page breaks. No images.
export function bundleToHTML({ expenses, items, income, holdings, meta, sym = '₹' }) {
  const generatedAt = meta?.generatedAt || new Date().toISOString();
  const range = meta?.rangeLabel || 'All time';
  const expRows = expenses || [];
  const itemRows = items || [];
  const incRows = income || [];
  const holdRows = holdings || [];
  const totalExp = expRows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalInc = incRows.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const net = totalInc - totalExp;

  const byCat = {};
  for (const e of expRows) {
    const k = e.category_name || 'Uncategorised';
    byCat[k] = (byCat[k] || 0) + (Number(e.amount) || 0);
  }
  const topCats = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const monthGroups = groupByMonth(expRows);

  const expenseTables = monthGroups.map(([month, rows]) => `
    <h3>${escapeHTML(month)} <span class="muted">(${rows.length} spend${rows.length === 1 ? '' : 's'} · ${fmtAmount(rows.reduce((s, e) => s + (Number(e.amount) || 0), 0), sym)})</span></h3>
    <table class="ledger">
      <thead><tr>
        <th class="date">Date</th><th>Merchant</th><th>Category</th>
        <th class="pay">Pay</th><th class="amt">Amount</th>
      </tr></thead>
      <tbody>
        ${rows.map(e => `
          <tr>
            <td class="date">${escapeHTML(e.expense_date)}</td>
            <td>${escapeHTML(e.merchant)}${e.notes ? `<div class="muted">${escapeHTML(e.notes)}</div>` : ''}</td>
            <td>${escapeHTML(e.category_name || '')}</td>
            <td class="pay">${escapeHTML(e.payment_method || '')}</td>
            <td class="amt">${fmtAmount(e.amount, sym)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `).join('');

  const incomeTable = incRows.length ? `
    <h2>Income</h2>
    <table class="ledger">
      <thead><tr>
        <th class="date">Date</th><th>Source</th>
        <th class="pay">Recurring</th><th class="amt">Amount</th>
      </tr></thead>
      <tbody>
        ${incRows.map(i => `
          <tr>
            <td class="date">${escapeHTML(i.received_date)}</td>
            <td>${escapeHTML(i.source)}${i.notes ? `<div class="muted">${escapeHTML(i.notes)}</div>` : ''}</td>
            <td class="pay">${i.recurring ? 'yes' : 'no'}</td>
            <td class="amt">${fmtAmount(i.amount, sym)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '';

  const itemsTable = itemRows.length ? `
    <h2>Items <span class="muted">(${itemRows.length})</span></h2>
    <table class="ledger compact">
      <thead><tr>
        <th class="date">Date</th><th>Item</th><th>Merchant</th>
        <th class="qty">Qty</th><th class="amt">Price</th>
      </tr></thead>
      <tbody>
        ${itemRows.map(r => `
          <tr>
            <td class="date">${escapeHTML(r.purchase_date)}</td>
            <td>${escapeHTML(r.name)}</td>
            <td>${escapeHTML(r.merchant || '')}</td>
            <td class="qty">${escapeHTML(r.qty != null ? `${r.qty} ${r.unit || ''}`.trim() : '')}</td>
            <td class="amt">${fmtAmount(r.price, sym)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '';

  // PS-31 — investments sheet.
  const holdTotals = holdRows.reduce((a, h) => {
    const { cost, market } = holdingCols(h);
    a.cost += cost; a.market += market; return a;
  }, { cost: 0, market: 0 });
  const holdingsTable = holdRows.length ? `
    <h2>Investments <span class="muted">(${holdRows.length} · ${fmtAmount(holdTotals.market, sym)})</span></h2>
    <table class="ledger compact">
      <thead><tr>
        <th>Holding</th><th>Kind</th><th class="amt">Cost</th>
        <th class="amt">Value</th><th class="amt">Gain</th>
      </tr></thead>
      <tbody>
        ${holdRows.map(h => {
          const { cost, market, gain } = holdingCols(h);
          return `
          <tr>
            <td>${escapeHTML(h.label)}</td>
            <td>${escapeHTML(h.kind)}</td>
            <td class="amt">${fmtAmount(cost, sym)}</td>
            <td class="amt">${fmtAmount(market, sym)}</td>
            <td class="amt">${fmtAmount(gain, sym)}</td>
          </tr>`;
        }).join('')}
        <tr>
          <td><b>Total</b></td><td></td>
          <td class="amt"><b>${fmtAmount(holdTotals.cost, sym)}</b></td>
          <td class="amt"><b>${fmtAmount(holdTotals.market, sym)}</b></td>
          <td class="amt"><b>${fmtAmount(holdTotals.market - holdTotals.cost, sym)}</b></td>
        </tr>
      </tbody>
    </table>
  ` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Drift Export</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: #1f1d1a; font-size: 11pt; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt 0; font-weight: 400; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt 0; font-weight: 600; border-bottom: 1pt solid #e9e3d8; padding-bottom: 4pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt 0; font-weight: 700; color: #6e6358; }
  .muted { color: #97897a; font-size: 9pt; font-weight: 400; }
  .meta { color: #6e6358; font-size: 10pt; margin-bottom: 12pt; }
  .summary { display: flex; gap: 14pt; margin: 12pt 0; }
  .summary .card { flex: 1; padding: 10pt 12pt; background: #f6efe2; border-radius: 6pt; }
  .summary .card .label { font-size: 9pt; color: #6e6358; text-transform: uppercase; letter-spacing: 0.06em; }
  .summary .card .value { font-size: 16pt; margin-top: 2pt; }
  .summary .card.neg .value { color: #c75a4d; }
  .summary .card.pos .value { color: #6b8e5e; }
  table.ledger { width: 100%; border-collapse: collapse; margin-bottom: 8pt; font-size: 9.5pt; }
  table.ledger thead th { text-align: left; padding: 4pt 6pt; border-bottom: 1pt solid #d8cfbf;
                          background: #fdfaf2; font-weight: 600; font-size: 8.5pt;
                          text-transform: uppercase; letter-spacing: 0.05em; color: #6e6358; }
  table.ledger tbody td { padding: 4pt 6pt; border-bottom: 1pt dotted #ece4d3; vertical-align: top; }
  table.ledger td.date, table.ledger th.date { width: 18%; white-space: nowrap; color: #6e6358; }
  table.ledger td.pay, table.ledger th.pay   { width: 10%; }
  table.ledger td.qty, table.ledger th.qty   { width: 12%; text-align: right; }
  table.ledger td.amt, table.ledger th.amt   { width: 16%; text-align: right; font-variant-numeric: tabular-nums; }
  table.ledger.compact tbody td { padding: 2pt 6pt; font-size: 9pt; }
  .top-cats { margin: 6pt 0 0; padding: 0; list-style: none; font-size: 10pt; }
  .top-cats li { padding: 2pt 0; }
  .top-cats .bar { display: inline-block; background: #e9d8b8; height: 6pt; vertical-align: middle;
                   margin: 0 6pt; border-radius: 2pt; }
  footer { margin-top: 18pt; padding-top: 8pt; border-top: 1pt solid #e9e3d8;
           text-align: center; font-size: 8.5pt; color: #97897a; }
</style></head>
<body>
  <h1>Drift Export</h1>
  <div class="meta">Range: ${escapeHTML(range)} · Generated ${escapeHTML(generatedAt)}</div>

  <div class="summary">
    <div class="card"><div class="label">Spends</div>
      <div class="value">${fmtAmount(totalExp, sym)}</div>
      <div class="muted">${expRows.length} transaction${expRows.length === 1 ? '' : 's'}</div>
    </div>
    ${incRows.length ? `
    <div class="card"><div class="label">Income</div>
      <div class="value">${fmtAmount(totalInc, sym)}</div>
      <div class="muted">${incRows.length} entr${incRows.length === 1 ? 'y' : 'ies'}</div>
    </div>
    <div class="card ${net >= 0 ? 'pos' : 'neg'}"><div class="label">Net</div>
      <div class="value">${fmtAmount(net, sym)}</div>
      <div class="muted">${net >= 0 ? 'saved' : 'over'}</div>
    </div>` : ''}
  </div>

  ${topCats.length ? `
    <h2>Top categories</h2>
    <ul class="top-cats">
      ${topCats.map(([k, v]) => {
        const pct = totalExp > 0 ? Math.round((v / totalExp) * 100) : 0;
        return `<li>${escapeHTML(k)} <span class="bar" style="width:${Math.max(2, pct * 1.5)}pt"></span> ${fmtAmount(v, sym)} <span class="muted">${pct}%</span></li>`;
      }).join('')}
    </ul>` : ''}

  ${meta?.fyData ? itrSectionsHTML({ expenses: expRows, fyData: meta.fyData, sym }) : ''}

  ${expRows.length ? `<h2>Spends</h2>${expenseTables}` : ''}
  ${incomeTable}
  ${itemsTable}
  ${holdingsTable}

  <footer>Drift · 100% offline · exported ${escapeHTML(generatedAt)}</footer>
</body></html>`;
}

// PS-14 — Render the ITR-summary block. Only invoked when meta.fyData is
// present (FY preset selected on Export). Caller passes fyData populated by
// the Export screen from useInsurance() + useEmi() + taxBenefitForFY().
function itrSectionsHTML({ expenses, fyData, sym }) {
  const summary = fyTaxSummary({ expenses, fyData, sym });
  const big = summary.bigSpends;
  const cap80C = Math.min(summary.section80C.amount, 150000);
  const cap80D = Math.min(summary.section80D.amount, 25000);
  const cap24B = Math.min(summary.section24B.amount, 200000);
  const savings = Math.round((cap80C + cap80D + cap24B) * 0.30);

  const sectionTable = (title, ref, sec, cap) => `
    <h3>${escapeHTML(title)} <span class="muted">(cap ${fmtAmount(cap, sym)})</span></h3>
    <table class="ledger compact">
      <thead><tr>
        <th>Item</th>
        <th class="amt">Amount paid</th>
      </tr></thead>
      <tbody>
        ${sec.items.length === 0
          ? `<tr><td colspan="2" class="muted">No eligible items recorded for this FY.</td></tr>`
          : sec.items.map(it => `
            <tr>
              <td>${escapeHTML(it.label)}</td>
              <td class="amt">${fmtAmount(it.amount, sym)}</td>
            </tr>
          `).join('') +
            `<tr><td><b>Total eligible</b></td><td class="amt"><b>${fmtAmount(sec.amount, sym)}</b></td></tr>` +
            `<tr><td><b>Capped at ${ref}</b></td><td class="amt"><b>${fmtAmount(Math.min(sec.amount, cap), sym)}</b></td></tr>`
        }
      </tbody>
    </table>`;

  return `
    <h2>ITR / FY summary</h2>
    <div class="meta">Section 80C principal+premium · Section 24B home-loan interest · Section 80D health premium.
      GST input credit is best-effort: only entries with an explicit GST amount are summed.</div>

    <div class="summary">
      <div class="card"><div class="label">Total spends &gt; ₹50,000</div>
        <div class="value">${big.length}</div>
        <div class="muted">itemised below</div>
      </div>
      <div class="card pos"><div class="label">Est. tax savings (30% slab)</div>
        <div class="value">${fmtAmount(savings, sym)}</div>
        <div class="muted">capped per Section limits</div>
      </div>
      <div class="card"><div class="label">GST input credit</div>
        <div class="value">${fmtAmount(summary.gstInput.totalGst, sym)}</div>
        <div class="muted">where recorded</div>
      </div>
    </div>

    ${sectionTable('Section 80C', '₹1,50,000', summary.section80C, 150000)}
    ${sectionTable('Section 80D', '₹25,000',  summary.section80D, 25000)}
    ${sectionTable('Section 24B', '₹2,00,000', summary.section24B, 200000)}

    ${big.length ? `
      <h3>Spends &gt; ₹50,000</h3>
      <table class="ledger compact">
        <thead><tr>
          <th class="date">Date</th><th>Merchant</th><th>Category</th><th class="amt">Amount</th>
        </tr></thead>
        <tbody>
          ${big.map(e => `
            <tr>
              <td class="date">${escapeHTML(e.expense_date)}</td>
              <td>${escapeHTML(e.merchant)}</td>
              <td>${escapeHTML(e.category_name || '')}</td>
              <td class="amt">${fmtAmount(e.amount, sym)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : ''}
  `;
}

// `drift-export-2025-06-to-2026-05.csv` — predictable, sortable, no spaces.
export function humanFilename({ format, rangeLabel, generatedAt }) {
  const ext = format === 'pdf' ? 'pdf' : format === 'json' ? 'json' : format === 'ics' ? 'ics' : 'csv';
  const ts = (generatedAt || new Date().toISOString())
    .replace(/[:T]/g, '-')
    .replace(/\..+$/, '')
    .slice(0, 19);
  const range = (rangeLabel || 'all-time').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `drift-export-${range}-${ts}.${ext}`;
}

export const MIME_TYPES = {
  csv:  'text/csv',
  json: 'application/json',
  pdf:  'application/pdf',
  ics:  'text/calendar',
};

// PS-48 — Single-receipt PDF (reimbursement flow). One expense + its items +
// GST breakdown + the embedded receipt image on a single page. `receiptDataUri`
// is a `data:image/...;base64,...` string built by the caller (Detail screen)
// from the receipt file; null when there's no receipt. Pure — generated
// locally, nothing leaves the device.
export function singleReceiptHTML({ expense, items = [], receiptDataUri = null, sym = '₹' }) {
  const e = expense || {};
  const itemRows = (items || []).filter((it) => !it.deleted_at);
  const hasGst = e.gstin || e.invoice_number ||
    Number(e.cgst) || Number(e.sgst) || Number(e.igst);

  const itemsTable = itemRows.length ? `
    <h2>Items</h2>
    <table class="tbl">
      <thead><tr><th>Item</th><th class="q">Qty</th><th class="a">Unit</th><th class="a">Amount</th></tr></thead>
      <tbody>
        ${itemRows.map((it) => `
          <tr>
            <td>${escapeHTML(it.name)}${it.hsn ? `<div class="muted">HSN ${escapeHTML(it.hsn)}</div>` : ''}</td>
            <td class="q">${escapeHTML(it.qty != null ? `${it.qty} ${it.unit || ''}`.trim() : '')}</td>
            <td class="a">${fmtAmount(it.unit_price, sym)}</td>
            <td class="a">${fmtAmount(it.price, sym)}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '';

  const gstBlock = hasGst ? `
    <h2>Tax / GST</h2>
    <table class="tbl">
      <tbody>
        ${e.gstin ? `<tr><td>GSTIN</td><td class="a">${escapeHTML(e.gstin)}</td></tr>` : ''}
        ${e.invoice_number ? `<tr><td>Invoice no.</td><td class="a">${escapeHTML(e.invoice_number)}</td></tr>` : ''}
        ${Number(e.cgst) ? `<tr><td>CGST</td><td class="a">${fmtAmount(e.cgst, sym)}</td></tr>` : ''}
        ${Number(e.sgst) ? `<tr><td>SGST</td><td class="a">${fmtAmount(e.sgst, sym)}</td></tr>` : ''}
        ${Number(e.igst) ? `<tr><td>IGST</td><td class="a">${fmtAmount(e.igst, sym)}</td></tr>` : ''}
      </tbody>
    </table>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 16mm; }
    body { font-family: -apple-system, system-ui, sans-serif; color: #1f1d1a; font-size: 11pt; }
    h1 { font-size: 20pt; margin: 0 0 2pt; font-weight: 500; }
    h2 { font-size: 12pt; margin: 16pt 0 6pt; border-bottom: 1pt solid #e9e3d8; padding-bottom: 3pt; }
    .muted { color: #97897a; font-size: 9pt; }
    .hero { background: #f6efe2; border-radius: 8pt; padding: 14pt; margin: 12pt 0; }
    .hero .amt { font-size: 26pt; font-weight: 500; }
    .meta { color: #6e6358; font-size: 10pt; margin-top: 2pt; }
    table.tbl { width: 100%; border-collapse: collapse; font-size: 10pt; }
    table.tbl th { text-align: left; padding: 4pt 6pt; border-bottom: 1pt solid #d8cfbf;
      font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #6e6358; }
    table.tbl td { padding: 4pt 6pt; border-bottom: 1pt dotted #ece4d3; vertical-align: top; }
    table.tbl td.a, table.tbl th.a { text-align: right; font-variant-numeric: tabular-nums; }
    table.tbl td.q, table.tbl th.q { text-align: right; width: 16%; }
    .receipt { margin-top: 14pt; }
    .receipt img { max-width: 100%; max-height: 360pt; border: 1pt solid #e9e3d8; border-radius: 4pt; }
    footer { margin-top: 18pt; padding-top: 8pt; border-top: 1pt solid #e9e3d8;
      text-align: center; font-size: 8.5pt; color: #97897a; }
  </style></head><body>
    <h1>${escapeHTML(e.merchant || 'Receipt')}</h1>
    <div class="meta">${escapeHTML(e.expense_date || '')}${e.category_name ? ` · ${escapeHTML(e.category_name)}` : ''}${e.payment_method ? ` · ${escapeHTML(e.payment_method)}` : ''}</div>
    <div class="hero">
      <div class="amt">${fmtAmount(e.amount, sym)}</div>
      ${e.notes ? `<div class="meta">${escapeHTML(e.notes)}</div>` : ''}
    </div>
    ${itemsTable}
    ${gstBlock}
    ${receiptDataUri ? `<div class="receipt"><h2>Receipt</h2><img src="${receiptDataUri}"/></div>` : ''}
    <footer>Generated by Drift · ${escapeHTML(new Date().toISOString().slice(0, 10))} · 100% offline</footer>
  </body></html>`;
}

// PS-24 — Single-page Year-in-Review PDF template. Takes the rollup directly
// (no expense ledger; this is a curated summary, not a statement).
export function yearInReviewHTML(rollup, sym = '₹') {
  const r = rollup || {};
  const cats = (r.top_categories || []).map((c, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${escapeHTML(c.emoji || '')} ${escapeHTML(c.name)}</td>
      <td class="amt">${fmtAmount(c.total, sym)}</td>
      <td class="pct">${c.share_pct ?? 0}%</td>
    </tr>`).join('');
  const merchs = (r.top_merchants || []).map((m, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${escapeHTML(m.name)}</td>
      <td class="amt">${fmtAmount(m.total, sym)}</td>
      <td class="pct">${m.txn_count} visit${m.txn_count === 1 ? '' : 's'}</td>
    </tr>`).join('');
  const items = (r.top_items || []).map((it, i) => `
    <tr>
      <td class="rank">${i + 1}</td>
      <td>${escapeHTML(it.display_name || it.normalized_name)}</td>
      <td class="amt">${fmtAmount(it.spend_sum, sym)}</td>
      <td class="pct">${(it.qty_sum || 0).toFixed(1)}×</td>
    </tr>`).join('');
  const yoy = r.yoy
    ? `<p class="muted">vs ${r.yoy.prior_year}: ${r.yoy.direction === 'up' ? '+' : ''}${r.yoy.delta_pct}% (${fmtAmount(r.yoy.prior_total, sym)})</p>`
    : '<p class="muted">No prior-year comparison yet</p>';
  const splurge = r.biggest_splurge
    ? `<p><strong>Biggest single spend:</strong> ${fmtAmount(r.biggest_splurge.amount, sym)} at ${escapeHTML(r.biggest_splurge.merchant)} on ${escapeHTML(r.biggest_splurge.expense_date)}${r.biggest_splurge.category_name ? ` (${escapeHTML(r.biggest_splurge.category_name)})` : ''}</p>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm; }
    body { font-family: -apple-system, system-ui, sans-serif; color: #1c1814; font-size: 11px; }
    h1 { font-size: 28px; margin: 0 0 4px; font-weight: 400; }
    h2 { font-size: 14px; margin: 16px 0 6px; color: #6b5a4e; text-transform: uppercase; letter-spacing: 1px; }
    .muted { color: #7d6e62; font-size: 10px; }
    .hero { background: #faf3ec; padding: 18px; border-radius: 14px; margin-bottom: 16px; }
    .three { display: flex; gap: 12px; margin: 12px 0; }
    .three div { flex: 1; background: #fff; border: 1px solid #ece2d6; border-radius: 10px; padding: 10px; }
    .three .lbl { font-size: 9px; color: #7d6e62; text-transform: uppercase; letter-spacing: 0.7px; }
    .three .val { font-size: 18px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #ece2d6; text-align: left; }
    td.rank { width: 24px; color: #7d6e62; }
    td.amt { text-align: right; font-weight: 600; width: 90px; }
    td.pct { text-align: right; color: #7d6e62; width: 70px; }
    .footer { margin-top: 24px; font-size: 9px; color: #7d6e62; text-align: center; }
  </style></head><body>
    <h1>${escapeHTML(r.year_label || '')} <span class="muted">— Year in Review</span></h1>
    <div class="hero">
      <div class="three">
        <div><div class="lbl">Spent</div><div class="val">${fmtAmount(r.total_spend || 0, sym)}</div></div>
        <div><div class="lbl">Income</div><div class="val">${fmtAmount(r.total_income || 0, sym)}</div></div>
        <div><div class="lbl">Savings rate</div><div class="val">${r.savings_rate_pct ?? 0}%</div></div>
      </div>
      ${yoy}
      ${splurge}
      ${r.longest_streak?.best ? `<p><strong>Longest in-budget streak:</strong> ${r.longest_streak.best} days</p>` : ''}
    </div>
    ${cats ? `<h2>Top categories</h2><table>${cats}</table>` : ''}
    ${merchs ? `<h2>Top merchants</h2><table>${merchs}</table>` : ''}
    ${items ? `<h2>Top items</h2><table>${items}</table>` : ''}
    <div class="footer">Generated by Drift · ${escapeHTML(new Date().toISOString().slice(0, 10))}</div>
  </body></html>`;
}

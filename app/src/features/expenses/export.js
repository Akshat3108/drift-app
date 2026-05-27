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

// One concatenated text file with section dividers. Excel opens it as a
// single sheet with the dividers visible as malformed rows; humans can split
// on `# section:` to recover three CSVs. Keeps the share UX to a single file.
export function bundleToCSV({ expenses, items, income, meta }) {
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
  return parts.join('\n');
}

// One combined JSON object. Sections omitted entirely (not empty arrays) when
// the caller didn't include them; clear distinction between "no rows" and
// "didn't ask for this entity".
export function bundleToJSON({ expenses, items, income, meta }) {
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
export function bundleToHTML({ expenses, items, income, meta, sym = '₹' }) {
  const generatedAt = meta?.generatedAt || new Date().toISOString();
  const range = meta?.rangeLabel || 'All time';
  const expRows = expenses || [];
  const itemRows = items || [];
  const incRows = income || [];
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
  const ext = format === 'pdf' ? 'pdf' : format === 'json' ? 'json' : 'csv';
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
};

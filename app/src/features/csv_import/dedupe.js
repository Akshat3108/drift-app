// 7.15 — CSV-import dedupe gate.
//
// Flags parsed rows that probably duplicate an existing live expense:
//   - date is within ±dayTolerance of the parsed date
//   - amount matches exactly (rounded to 2 decimal places)
//   - merchant canonical contains-or-is-contained-in the parsed merchant
//     (case-insensitive)
//
// Pure function — exported for /tmp/ validation.

function canonical(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dayDiff(aIso, bIso) {
  if (!aIso || !bIso) return Infinity;
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Infinity;
  return Math.abs((a.getTime() - b.getTime()) / 86400000);
}

function eqAmount(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

// Return: parsed rows with a `dedupe` field appended. Shape:
//   { match_id, match_date, match_merchant, reason: 'date+amount+merchant' }
//   or null when no match found.
export function markDuplicates(parsedRows, existingExpenses, { dayTolerance = 3 } = {}) {
  if (!Array.isArray(parsedRows)) return [];
  const expenses = Array.isArray(existingExpenses) ? existingExpenses : [];
  const indexed = expenses
    .filter(e => !e.deleted_at)
    .map(e => ({
      id: e.id,
      date: e.expense_date,
      amount: Number(e.amount) || 0,
      merchant_canonical: canonical(e.merchant),
      merchant: e.merchant,
    }));
  return parsedRows.map((r) => {
    const candidate = canonical(r.merchant);
    let match = null;
    for (const ex of indexed) {
      if (!eqAmount(r.amount, ex.amount)) continue;
      if (dayDiff(r.date, ex.date) > dayTolerance) continue;
      if (!candidate || !ex.merchant_canonical) continue;
      if (ex.merchant_canonical.includes(candidate) || candidate.includes(ex.merchant_canonical)) {
        match = {
          match_id: ex.id,
          match_date: ex.date,
          match_merchant: ex.merchant,
          reason: 'date+amount+merchant',
        };
        break;
      }
    }
    return { ...r, dedupe: match };
  });
}

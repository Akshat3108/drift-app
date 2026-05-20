// Date validation + normalisation for the OCR date parser.
//
// validateDateParts returns true only when (d, m, y) describe a real calendar
// date that is plausible for a receipt. Plausibility window: years in
// [2000, currentYear + 1]. The +1 head-room covers end-of-year ambiguity
// (e.g. a Dec 31 timestamp clocked as Jan 1 next year).
//
// normaliseDateParts is the canonical "YYYY-MM-DD" formatter; returns null
// when validateDateParts rejects. Consumers can chain it with `??` to a
// fallback date.

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(m, y) {
  if (m === 2 && isLeapYear(y)) return 29;
  return MONTH_LENGTHS[m - 1];
}

function expandYear(y) {
  // Two-digit year → 20YY. The OCR layer doesn't see receipts from the 1900s.
  if (y < 100) return 2000 + y;
  return y;
}

export function validateDateParts(d, m, y) {
  const day = Number(d);
  const month = Number(m);
  let year = Number(y);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  year = expandYear(year);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(month, year)) return false;
  const maxYear = new Date().getFullYear() + 1;
  if (year < 2000 || year > maxYear) return false;
  return true;
}

export function normaliseDateParts(d, m, y) {
  if (!validateDateParts(d, m, y)) return null;
  const year = expandYear(Number(y));
  const month = String(Number(m)).padStart(2, '0');
  const day   = String(Number(d)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

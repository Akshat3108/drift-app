// 7.5 — EMI amortization helpers. Pure JS, no React / DB / Metro deps so
// the validation harness can `import` directly without shims.
//
// Standard reducing-balance EMI formula:
//   EMI = P × r × (1 + r)^n / ((1 + r)^n − 1)
// where P = principal, r = monthly_rate (annual / 12 / 100), n = tenure months.
//
// Real Indian banks differ on rounding by ₹0.01 – ₹2.00 per installment;
// `buildSchedule({ override })` lets the caller pin the user's actual bank
// EMI so the schedule matches their statement.
//
// Per the docs/09-roadmap risk register line 842, the bank-by-bank drift is
// the load-bearing reason for the override field; the schedule's last
// installment is always adjusted so the closing balance lands on exactly 0
// regardless of which EMI value was used (computed or override).

function monthlyRate(annualRatePct) {
  return (Number(annualRatePct) || 0) / 12 / 100;
}

// Round to 2 decimals consistently (avoid IEEE-754 float drift surfacing in UI).
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Standard reducing-balance EMI.
 * Returns 0 for non-positive principal/tenure; falls back to P/n for zero rate.
 */
export function computeEMI(principal, annualRatePct, tenureMonths) {
  const P = Number(principal) || 0;
  const n = Number(tenureMonths) || 0;
  if (P <= 0 || n <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return r2(P / n);
  const f = Math.pow(1 + r, n);
  const emi = (P * r * f) / (f - 1);
  return r2(emi);
}

function parseISODate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// Cap day at 28 to match the schema CHECK, and clamp again on each target
// month so weird user inputs don't crash the date math.
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(baseYear, baseMonthIndex, anchorDay, deltaMonths) {
  const total = baseMonthIndex + deltaMonths;
  const ny = baseYear + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const day = Math.min(anchorDay, daysInMonth(ny, nm));
  return new Date(ny, nm, day);
}

/**
 * Build the full installment schedule.
 * Returns an array of length tenureMonths, each entry:
 *   { installmentNumber, dueDate (YYYY-MM-DD), opening_balance, principal_paid,
 *     interest_paid, payment, closing_balance }
 *
 * - `payment` is the EMI used (override if non-null and >0, else computed).
 * - The last installment's `payment` is adjusted so closing_balance = 0
 *   exactly (mops up the cumulative rounding drift across the schedule).
 * - `dueDate` is anchored at the loan's `billDay` of each month starting from
 *   startDate's month; capped at the month's last day if billDay > daysInMonth.
 */
export function buildSchedule({ principal, annualRatePct, tenureMonths, startDate, billDay = 1, override = null }) {
  const P = Number(principal) || 0;
  const n = Number(tenureMonths) || 0;
  if (P <= 0 || n <= 0) return [];
  const sd = parseISODate(startDate);
  if (!sd) return [];
  const r = monthlyRate(annualRatePct);
  const rawEmi = override != null && Number(override) > 0
    ? r2(Number(override))
    : computeEMI(P, annualRatePct, n);

  const anchorDay = Math.max(1, Math.min(28, Number(billDay) || 1));
  const baseYear = sd.getFullYear();
  const baseMonthIndex = sd.getMonth();

  const rows = [];
  let balance = P;
  for (let i = 1; i <= n; i++) {
    const due = addMonthsClamped(baseYear, baseMonthIndex, anchorDay, i - 1);
    const opening = r2(balance);
    const interest = r2(balance * r);
    let payment = rawEmi;
    let principal_paid = r2(payment - interest);

    // Last installment: snap so closing_balance = 0 exactly.
    if (i === n) {
      principal_paid = r2(balance);              // pay off the remaining balance
      payment = r2(principal_paid + interest);   // EMI = principal + interest for the final month
    }

    const closing = r2(balance - principal_paid);
    rows.push({
      installmentNumber: i,
      dueDate: isoDate(due),
      opening_balance: opening,
      principal_paid,
      interest_paid: interest,
      payment,
      closing_balance: closing,
    });
    balance = closing;
  }
  return rows;
}

/**
 * Derive the loan's current state at an as-of date.
 *
 * Inputs:
 *   loan: { principal, annual_rate_pct, tenure_months, start_date, bill_day,
 *           installments_paid, emi_override }
 *   opts.asOf: Date (default: now). Used to project nextDueDate.
 *
 * Returns:
 *   {
 *     ready,                  // false if loan invalid
 *     emiAmount,              // override or computed
 *     schedule,               // full schedule (same as buildSchedule)
 *     installmentsPaid,       // from loan.installments_paid (user-controlled)
 *     installmentsRemaining,  // tenure - installments_paid (floor 0)
 *     outstandingPrincipal,   // closing_balance after installmentsPaid installments
 *     nextDueDate,            // YYYY-MM-DD of next unpaid installment, or null when done
 *     totalInterest,          // Σ interest_paid across the full schedule
 *     totalPaid,              // Σ payment across the full schedule
 *   }
 */
export function projectState(loan, { asOf = new Date() } = {}) {
  if (!loan) return { ready: false };
  const schedule = buildSchedule({
    principal:      loan.principal,
    annualRatePct:  loan.annual_rate_pct,
    tenureMonths:   loan.tenure_months,
    startDate:      loan.start_date,
    billDay:        loan.bill_day,
    override:       loan.emi_override,
  });
  if (schedule.length === 0) return { ready: false };

  const emiAmount = schedule[0].payment;
  const paid = Math.max(0, Math.min(loan.installments_paid || 0, schedule.length));
  const remaining = schedule.length - paid;
  const outstandingPrincipal = paid >= schedule.length ? 0 : schedule[paid - 1]?.closing_balance ?? loan.principal;
  // If `paid` is 0, outstanding is the full principal (the formula above would
  // index -1 which we defended against with the ?? fallback).
  const next = paid >= schedule.length ? null : schedule[paid];
  const nextDueDate = next ? next.dueDate : null;

  let totalInterest = 0;
  let totalPaid = 0;
  for (const row of schedule) {
    totalInterest += row.interest_paid;
    totalPaid     += row.payment;
  }

  return {
    ready: true,
    emiAmount,
    schedule,
    installmentsPaid: paid,
    installmentsRemaining: remaining,
    outstandingPrincipal: r2(outstandingPrincipal),
    nextDueDate,
    totalInterest: r2(totalInterest),
    totalPaid: r2(totalPaid),
    // also surface for the EditEMI hint copy
    asOf: isoDate(asOf),
  };
}

// Tiny helper for the EditEMI sub-label "= X years Y months"
export function tenureLabel(tenureMonths) {
  const n = Number(tenureMonths) || 0;
  if (n <= 0) return '';
  const years = Math.floor(n / 12);
  const months = n % 12;
  if (years === 0) return `${months} month${months === 1 ? '' : 's'}`;
  if (months === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years}y ${months}mo`;
}

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

// PS-12 — Simulate a one-time extra principal payment after
// `extraAfterInstallment` regular installments. The simulator keeps the
// EMI fixed at the original amount and lets the schedule shorten as the
// balance falls faster than the formula expected. Returns the modified
// schedule + summary (savedInterest, monthsSaved).
//
// Caller passes the LOAN row (same shape used by projectState). When the
// extra payment would zero out or overshoot the balance, the schedule is
// truncated to the partial-pay month and the final payment closes the
// loan exactly.
export function simulatePrepayment(loan, { extraPrincipal, extraAfterInstallment = 0 } = {}) {
  if (!loan) return { ready: false };
  const baseline = projectState(loan);
  if (!baseline.ready) return { ready: false };
  const extra = Number(extraPrincipal) || 0;
  if (extra <= 0) {
    return {
      ready: true,
      baseline,
      modifiedSchedule: baseline.schedule,
      savedInterest: 0,
      monthsSaved: 0,
      newTenure: baseline.schedule.length,
    };
  }

  const r = monthlyRate(loan.annual_rate_pct);
  const emi = baseline.emiAmount;
  const startIdx = Math.max(0, Math.min(extraAfterInstallment, baseline.schedule.length - 1));
  // Keep the head of the baseline schedule untouched (installments already
  // scheduled before the prepayment). Recompute from startIdx onward.
  const modified = baseline.schedule.slice(0, startIdx).map(row => ({ ...row }));
  let balance = startIdx === 0 ? loan.principal : modified[startIdx - 1].closing_balance;

  // Apply the lump-sum AT the boundary between startIdx and startIdx+1.
  balance = r2(balance - extra);
  if (balance < 0) balance = 0;

  // Continue paying EMI until balance hits 0; cap at baseline tenure length
  // as a safety against floating-point drift.
  for (let i = startIdx; i < baseline.schedule.length && balance > 0.01; i++) {
    const opening = balance;
    const interest = r2(balance * r);
    let payment = emi;
    let principal_paid = r2(payment - interest);
    if (principal_paid >= balance || i === baseline.schedule.length - 1) {
      principal_paid = r2(balance);
      payment = r2(principal_paid + interest);
    }
    const closing = r2(balance - principal_paid);
    // Date inheriting from baseline schedule when possible (we kept rows aligned).
    const baseRow = baseline.schedule[i] || {};
    modified.push({
      installmentNumber: i + 1,
      dueDate: baseRow.dueDate || null,
      opening_balance: opening,
      principal_paid,
      interest_paid: interest,
      payment,
      closing_balance: closing,
      // Mark the prepayment installment so the chart can highlight it.
      prepayment: i === startIdx ? r2(extra) : 0,
    });
    balance = closing;
  }

  const baselineInterest = baseline.totalInterest;
  let modifiedInterest = 0;
  for (const row of modified) modifiedInterest += row.interest_paid;
  modifiedInterest = r2(modifiedInterest);

  return {
    ready: true,
    baseline,
    modifiedSchedule: modified,
    savedInterest: r2(baselineInterest - modifiedInterest),
    monthsSaved: baseline.schedule.length - modified.length,
    newTenure: modified.length,
    modifiedTotalInterest: modifiedInterest,
  };
}

// PS-12 — Tax-benefit aggregation for a single financial year.
//
// fyStart / fyEnd are YYYY-MM-DD strings bracketing the FY (Apr 1 .. Mar 31).
// `loan` carries the loan row; the function projects the FY's schedule slice
// using `start_date` + `bill_day` (the same canonical schedule projectState
// uses). Tax eligibility follows the rule:
//   - tax_eligible === 1 → eligible
//   - tax_eligible === 0 → ineligible
//   - NULL / undefined  → fall back to (kind === 'home')
// Returns:
//   {
//     ready,
//     principalPaidFY,
//     interestPaidFY,
//     eligible80C,            // principal (cap 1.5L at PS-14 export stage)
//     eligible24B,            // interest (cap 2L at PS-14 export stage)
//     savingsAt30Pct,         // rough cash savings if user is in 30% slab
//   }
export function taxBenefitForFY(loan, fyStart, fyEnd) {
  if (!loan) return { ready: false };
  const state = projectState(loan);
  if (!state.ready) return { ready: false };
  const fyStartT = Date.parse(fyStart);
  const fyEndT   = Date.parse(fyEnd);
  if (!Number.isFinite(fyStartT) || !Number.isFinite(fyEndT)) {
    return { ready: false };
  }
  let principalPaidFY = 0;
  let interestPaidFY  = 0;
  for (const row of state.schedule) {
    const t = Date.parse(row.dueDate);
    if (!Number.isFinite(t)) continue;
    if (t < fyStartT) continue;
    if (t >= fyEndT) continue;
    principalPaidFY += row.principal_paid;
    interestPaidFY  += row.interest_paid;
  }
  const eligible = loan.tax_eligible == null
    ? (loan.kind === 'home')
    : !!loan.tax_eligible;
  const eligible80C = eligible ? r2(principalPaidFY) : 0;
  const eligible24B = eligible ? r2(interestPaidFY)  : 0;
  // 30% slab is a rough thumb; PS-14 export will let the user adjust.
  const savingsAt30Pct = r2((Math.min(eligible80C, 150000) + Math.min(eligible24B, 200000)) * 0.30);
  return {
    ready: true,
    principalPaidFY: r2(principalPaidFY),
    interestPaidFY:  r2(interestPaidFY),
    eligible80C, eligible24B,
    savingsAt30Pct,
    eligible,
  };
}

// PS-12 — Helper exposed to the FY export. Returns the current FY's
// canonical bracket (Apr 1 of the current FY → Apr 1 of the next FY).
// e.g. on 2026-05-27 returns ['2026-04-01', '2027-04-01'].
export function fyBracketFor(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  const fyStartYear = m >= 3 ? y : y - 1;
  return [`${fyStartYear}-04-01`, `${fyStartYear + 1}-04-01`];
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

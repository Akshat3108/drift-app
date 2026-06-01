// PS-31 — pure return maths for a holding. No DB / React imports so it is unit
// testable from a standalone node script (project convention for helpers).
//
// We have one dated cost-basis point (the holding's avg unit_cost stamped at
// `created_at` / the earliest NAV snapshot) and the current market value today.
// That is < 2 contributions, so per the spec the headline figure is CAGR. A
// general `xirr()` is exported too — once a real per-purchase contributions
// ledger lands (goal_contributions-style), `holdingReturns` can feed it the
// full cashflow series without any caller change.

const MS_PER_YEAR = 365 * 24 * 3600 * 1000; // actual/365 day-count

function yearsBetween(t0, t1) {
  return (t1 - t0) / MS_PER_YEAR;
}

// Compound annual growth rate from a single in→out pair over `years`.
export function cagr(costBasis, currentValue, years) {
  if (!(costBasis > 0) || !(currentValue > 0) || !(years > 0)) return null;
  return Math.pow(currentValue / costBasis, 1 / years) - 1;
}

// Internal rate of return for irregularly-dated cashflows.
// flows: [{ amount, date }]  (outflows negative, inflows positive).
// Newton-Raphson with a bisection fallback; returns the annual rate or null.
export function xirr(flows, guess = 0.1) {
  if (!Array.isArray(flows) || flows.length < 2) return null;
  const fs = flows
    .map((f) => ({ amount: Number(f.amount), t: new Date(f.date).getTime() }))
    .filter((f) => Number.isFinite(f.amount) && Number.isFinite(f.t))
    .sort((a, b) => a.t - b.t);
  if (fs.length < 2) return null;
  if (!fs.some((f) => f.amount > 0) || !fs.some((f) => f.amount < 0)) return null;

  const t0 = fs[0].t;
  const npv = (r) => fs.reduce((s, f) => s + f.amount / Math.pow(1 + r, yearsBetween(t0, f.t)), 0);
  const dnpv = (r) => fs.reduce((s, f) => {
    const yf = yearsBetween(t0, f.t);
    return s - (yf * f.amount) / Math.pow(1 + r, yf + 1);
  }, 0);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const v = npv(rate);
    const d = dnpv(rate);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    let next = rate - v / d;
    if (!Number.isFinite(next)) break;
    if (next <= -0.9999) next = -0.9999 + 1e-6;
    if (Math.abs(next - rate) < 1e-7) return next > -0.9999 ? next : null;
    rate = next;
  }

  // Bracketed bisection fallback over a sane rate band.
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-9) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

const MIN_DAYS_FOR_ANNUALISED = 30; // annualising a few days' return is noise

// Headline returns for one holding given its (asc-sorted) NAV history.
// Returns null when there is no cost basis / no value to compare.
export function holdingReturns(holding, navHistory = []) {
  if (!holding) return null;
  const units = Number(holding.units) || 0;
  const cost = units * (Number(holding.unit_cost) || 0);
  const value = units * (Number(holding.current_nav) || 0);
  if (!(cost > 0) || !(value > 0)) return null;

  const startStr = navHistory[0]?.recorded_at || holding.created_at || null;
  const start = startStr ? new Date(String(startStr).slice(0, 10)) : null;
  const now = new Date();
  const years = start ? yearsBetween(start.getTime(), now.getTime()) : 0;

  const absolute = (value - cost) / cost;
  let annualised = null;
  if (years >= MIN_DAYS_FOR_ANNUALISED / 365) {
    annualised = cagr(cost, value, years);
    if (annualised == null && start) {
      annualised = xirr([{ amount: -cost, date: start }, { amount: value, date: now }]);
    }
  }

  return {
    cost_basis: cost,
    current_value: value,
    gain: value - cost,
    absolute,            // simple total return, e.g. 0.18 = +18%
    annualised,          // CAGR, null when holding is < 30 days old
    years,
    method: 'cagr',
    has_series: navHistory.length >= 2,
  };
}

// Phase 3 analytics — public surface.
//
// 6.1–6.8 (engine first batch) and 6.9–6.11 (engine second batch) re-exported
// here. The unimplemented stubs (anomaly, patterns) will start exporting
// their real surface as future tasks land.

export { getCached, invalidate, invalidateKey, evictExpired, stats, SCOPES }
  from './cache';

export { spendingVelocity }      from './spend';
export {
  cheapestMerchantPerItem,
  reorderQueue,
  inflationBasket,
  pricePrediction,
  priceElasticity,
} from './items';
export { lifestyleInflation }    from './lifestyle';
export {
  subscriptionLeakage,
  periodToMonthly,
} from './subscriptions';

// 6.9 (+ 5.A.01 completes the 5-model ensemble inside cashflowForecast)
// 5.A.02 — approxNormalCDF + probabilityOverBudget
// 5.A.03 — cashflowLookahead3
export {
  cashflowForecast,
  probabilityOverBudget,
  cashflowLookahead3,
  approxNormalCDF,
} from './forecast';
// 6.10
export {
  seasonalCalendar,
  dayOfWeekPattern,
  dayOfMonthHistogram,
} from './seasonal';
// 6.11
export { categoryVarianceMatrix } from './variance';

// 7.11 — Recurring expense detection. `detectRecurringCandidates` is the pure
// helper exercised by the /tmp/ harness; `recurringCandidates` is the
// DB-backed convenience wrapper used by the Home tile.
export { recurringCandidates, detectRecurringCandidates } from './patterns';

// 8.13 — Per-category anomaly detection (µ ± 2σ on the 90-day rolling
// expense window). `categoryAnomalyStats` runs the SQL + caching; the pure
// `classifyExpenseAnomaly(amount, stats)` is the consumer for Detail.js.
export { categoryAnomalyStats, classifyExpenseAnomaly } from './anomaly';

// 5.A.06 — Carbon model. Pure helpers (no DB); Add.js calls per-keystroke.
// PS-03 — `carbonDashboard` is the DB-backed aggregator that the dashboard
// screen consumes; it lives in the same file because it shares the factor
// constants and is a thin extension of the same domain.
export { CARBON_FACTORS, estimateCarbon, carbonImpactLabel, carbonDashboard } from './carbon';

// 5.A.07 — Pearson correlation between monthly category totals; surfaces
// substitution + co-movement pairs.
export { categorySubstitution } from './substitution';

// PS-01 — Sankey-ready income/budget → category aggregator.
export { moneyFlow } from './flow';

// PS-02 — Mood × spend aggregator (per-mood totals + per-(cat,mood) deltas).
export { moodAggregates } from './mood';

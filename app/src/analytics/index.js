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
} from './items';
export { lifestyleInflation }    from './lifestyle';
export {
  subscriptionLeakage,
  periodToMonthly,
} from './subscriptions';

// 6.9
export { cashflowForecast }      from './forecast';
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

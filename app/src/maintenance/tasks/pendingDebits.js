// PS-30 — daily auto-create of recurring debits the user opted into.
//
// For each enabled recurring_autocreate rule whose pattern is due this month
// and not yet logged, insert a pending (is_pending=1) expense the user can
// confirm or dismiss from the Pending screen. `last_created_month` makes it
// fire at most once per month per pattern — even if the user dismisses the
// row, we don't re-create it the same month (no nagging).
//
// Cheap no-op when no rules are enabled (the common case), so it's safe in the
// ≥24h maintenance loop.

import { autocreateRepo } from '../../features/expenses/autocreate.repo';
import { expenses as expRepo } from '../../features/expenses/repo';
import { recurringCandidates } from '../../analytics';
import { lightNormMerchant } from '@core/utils/strings';

export default {
  name: 'pendingDebits',
  async run() {
    const rules = await autocreateRepo.listEnabled();
    if (!rules.length) return;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = `${monthKey}-${String(now.getDate()).padStart(2, '0')}`;

    let res;
    try { res = await recurringCandidates({ asOf: now }); }
    catch { return; }
    const candidates = (res && res.ready) ? (res.candidates || []) : [];
    const byKey = new Map(candidates.map((c) => [lightNormMerchant(c.merchant), c]));

    let created = 0;
    for (const rule of rules) {
      if (rule.last_created_month === monthKey) continue;       // already created this month
      const cand = byKey.get(rule.merchant_key);
      if (!cand) continue;                                      // pattern not active this month
      if (cand.logged_this_month_id != null) continue;         // user already logged it
      const due = cand.projected_date_this_month;
      if (typeof due === 'string' && due > todayStr) continue; // not due yet

      const amount = Number(rule.expected_amount) || Number(cand.expected_amount) || 0;
      if (amount <= 0) continue;
      const category_id = rule.category_id ?? cand.expected_category_id ?? null;

      await expRepo.createPending({ category_id, merchant: rule.merchant, amount, expense_date: due });
      await autocreateRepo.markCreated(rule.merchant_key, monthKey);
      created += 1;
    }
    return { created };
  },
};

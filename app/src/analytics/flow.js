// PS-01 — moneyFlow()
//
// Sankey-ready aggregator: one left-side node (income for the active month,
// or total budget when income is zero) and N right-side nodes (one per
// category with positive spend). Long-tail categories beyond the top 8
// collapse into a synthetic 'Other' flow so phone-width Sankey diagrams
// stay legible. The shape is intentionally rendering-agnostic — the screen
// computes geometry; this module only owns aggregation.
//
// Fallback ladder for the left node:
//   income > 0          → left = income           (fallback: 'income')
//   else Σ budget > 0   → left = Σ budget         (fallback: 'budget')
//   else                → no data                 (fallback: 'none')
//
// Pure-aggregation; reads `expenses.pots(month)` (3.11 rollup-backed) and
// `income.monthlyTotal(month)`. No cache wrapper this round — pots is
// already a monthly_summary roll-up read and the income query is one row.

import { expenses as expRepo } from '@features/expenses/repo';
import { income as incRepo } from '@features/income/repo';

const TOP_N = 8;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export async function moneyFlow({ month } = {}) {
  const m = month || currentMonth();

  // `summaryByCategory` returns rows shaped like `{id, name, emoji, color,
  // budget, spent, rollover_in}` — the same shape Home/PotDetail consume.
  // The provider-exposed `pots` is the same data minus the React adapter
  // fields; reading the repo directly keeps `moneyFlow` independent of the
  // ExpensesProvider mount.
  const [pots, incomeTotal] = await Promise.all([
    expRepo.summaryByCategory(m),
    incRepo.monthlyTotal(m),
  ]);

  const totalBudget = (pots || []).reduce((s, p) => s + (p.budget || 0), 0);

  let fallback;
  let leftLabel;
  let leftValue;
  if (incomeTotal > 0) {
    fallback = 'income';
    leftLabel = 'Income';
    leftValue = incomeTotal;
  } else if (totalBudget > 0) {
    fallback = 'budget';
    leftLabel = 'Budget';
    leftValue = totalBudget;
  } else {
    fallback = 'none';
    leftLabel = '—';
    leftValue = 0;
  }

  const positive = (pots || [])
    .filter((p) => (p.spent || 0) > 0)
    .map((p) => ({
      category_id: p.id,
      name: p.name,
      emoji: p.emoji || '',
      color: p.color || null,
      value: p.spent,
    }))
    .sort((a, b) => b.value - a.value);

  const total = positive.reduce((s, f) => s + f.value, 0);

  let flows = [];
  let collapsed = [];
  if (positive.length <= TOP_N) {
    flows = positive;
  } else {
    flows = positive.slice(0, TOP_N);
    collapsed = positive.slice(TOP_N);
    const otherValue = collapsed.reduce((s, f) => s + f.value, 0);
    flows.push({
      category_id: null,
      name: 'Other',
      emoji: '·',
      color: null,
      value: otherValue,
      collapsed: collapsed.map((c) => ({
        category_id: c.category_id,
        name: c.name,
        emoji: c.emoji,
        value: c.value,
      })),
    });
  }

  flows = flows.map((f) => ({
    ...f,
    share: total > 0 ? f.value / total : 0,
  }));

  return {
    month: m,
    income: incomeTotal,
    totalBudget,
    fallback,
    leftLabel,
    leftValue,
    flows,
    collapsed,
    total,
  };
}

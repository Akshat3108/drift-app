// 5.A.06 — Real carbon footprint model.
//
// Replaces the hardcoded 0.4 kg placeholder that Add.js stamped on every
// expense. A flat per-category kg CO₂e per ₹ factor is multiplied by the
// expense amount at save time.
//
// Factors below are rough lifecycle-emission estimates expressed as kg per
// ₹100 of spend, normalised to per-₹ for the multiply. They are NOT certified
// — the right long-term source is India's CEA grid factor (transport/bills)
// + DEFRA / Lancet-Planetary EAT food category estimates rescaled to INR.
// When that dataset lands on disk this table swaps; the function signature
// is the contract.
//
// Keyed by lowercased + trimmed category name. The user can rename a category
// ("Groceries" → "Sabzi") and the lookup will fall to `default`. That is
// intentional: we'd rather understate carbon than apply a wildly wrong factor
// because the user repurposed a category. Emoji-based fallback was considered
// (see decision log) but rejected — users frequently swap default emojis.
//
// Pure module — no DB, no async, no cache. Add.js calls per-keystroke during
// the live preview, so this stays O(1).

export const CARBON_FACTORS = Object.freeze({
  // High-impact: animal protein, packaged + processed food, dining out.
  'food & drink':  0.0032,
  // Mixed basket — staples + produce + dairy + occasional meat.
  groceries:       0.0018,
  // ICE vehicle fuel + ride-hail dominate; train/metro pull the avg down.
  transport:       0.0042,
  // Electricity-weighted; India grid factor ≈ 0.82 kg CO₂e per kWh.
  bills:           0.0025,
  // Streaming, events, dining-adjacent leisure.
  fun:             0.0010,
  // Medicines + clinics — low embodied carbon per ₹.
  health:          0.0008,
  // Software/streaming subscriptions — server-side electricity only.
  subscriptions:   0.0005,
  // Unknown / user-renamed bucket. Midway between bills and groceries.
  default:         0.0015,
});

const round2 = (n) => Math.round(n * 100) / 100;

// Accepts either a category object ({ name, emoji, ... }) or a plain string.
// Returns the estimated kg CO₂e for `amount` (₹) attributable to that category.
// Returns 0 for non-finite / non-positive amounts so callers can stamp the
// `carbon` column unconditionally.
export function estimateCarbon(categoryOrName, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const name = typeof categoryOrName === 'string'
    ? categoryOrName
    : (categoryOrName && typeof categoryOrName.name === 'string' ? categoryOrName.name : '');
  const key = name.trim().toLowerCase();
  const factor = CARBON_FACTORS[key] ?? CARBON_FACTORS.default;
  return round2(factor * amount);
}

// Tier label used by the Add.js tile. Tiers chosen to match the order of
// magnitude that a single Indian household expense actually lands in:
//   < 1 kg   — a quick meal, a small bill, a low-amount transport hop
//   1..5 kg  — typical weekly groceries, mid-size bill, fuel fill
//   ≥ 5 kg   — large grocery shop, electronics, big transport ticket
export function carbonImpactLabel(kg) {
  if (!Number.isFinite(kg) || kg <= 0) return '';
  if (kg < 1)   return 'low impact ✿';
  if (kg < 5)   return 'moderate impact ◐';
  return 'high impact ▲';
}

// PS-03 — dashboard aggregator. Five window-bounded SQL passes; the receipt-
// items pass uses proportional allocation (item kg = parent.carbon × item.price
// ÷ parent.amount) because we don't have a per-item carbon factor table yet.
// All passes scope by month_key (indexed) + deleted_at IS NULL.
//
//   `ready` is false when no carbon data exists in the window — the screen
//   then shows an empty state. Pure aggregation; no cache wrapper.

import { all, one } from '../db';

export async function carbonDashboard({ months = 12 } = {}) {
  const range = await one(`
    SELECT strftime('%Y-%m', date('now','-' || ? || ' months')) AS m_from,
           strftime('%Y-%m', date('now'))                       AS m_to,
           strftime('%Y-01', date('now'))                       AS yr_from
  `, [months - 1]);

  const monthRow = await one(`
    SELECT month_key, COALESCE(SUM(carbon), 0) AS kg
      FROM expenses
     WHERE deleted_at IS NULL AND month_key = ?
  `, [range.m_to]);

  const ytdRow = await one(`
    SELECT COALESCE(SUM(carbon), 0) AS kg
      FROM expenses
     WHERE deleted_at IS NULL AND month_key >= ?
  `, [range.yr_from]);

  const trendRows = await all(`
    SELECT month_key, COALESCE(SUM(carbon), 0) AS kg
      FROM expenses
     WHERE deleted_at IS NULL AND month_key BETWEEN ? AND ?
     GROUP BY month_key
     ORDER BY month_key
  `, [range.m_from, range.m_to]);

  // Fill missing months with kg=0 so the trend chart always has `months` slots.
  const byMonth = new Map(trendRows.map((r) => [r.month_key, r.kg]));
  const monthlyTrend = [];
  const [tyStr, tmStr] = range.m_to.split('-');
  let ty = parseInt(tyStr, 10), tm = parseInt(tmStr, 10);
  const slots = [];
  for (let i = 0; i < months; i++) {
    const mk = `${ty}-${String(tm).padStart(2, '0')}`;
    slots.unshift(mk);
    tm -= 1;
    if (tm === 0) { tm = 12; ty -= 1; }
  }
  for (const mk of slots) monthlyTrend.push({ month_key: mk, kg: byMonth.get(mk) ?? 0 });

  const catRows = await all(`
    SELECT e.category_id,
           COALESCE(c.name, 'Uncategorised') AS name,
           c.emoji,
           c.color,
           SUM(e.carbon) AS kg
      FROM expenses e
      LEFT JOIN categories c ON c.id = e.category_id AND c.deleted_at IS NULL
     WHERE e.deleted_at IS NULL
       AND e.month_key BETWEEN ? AND ?
       AND e.carbon > 0
     GROUP BY e.category_id
     ORDER BY kg DESC
     LIMIT 5
  `, [range.m_from, range.m_to]);
  const catTotal = catRows.reduce((s, r) => s + (r.kg || 0), 0);
  const topCategories = catRows.map((r) => ({
    category_id: r.category_id,
    name: r.name,
    emoji: r.emoji || '·',
    color: r.color || null,
    kg: Math.round(r.kg * 100) / 100,
    share: catTotal > 0 ? r.kg / catTotal : 0,
  }));

  const itemRows = await all(`
    SELECT i.id          AS item_id,
           i.normalized_name AS name,
           i.expense_id  AS expense_id,
           i.price       AS item_price,
           e.amount      AS expense_amount,
           e.carbon      AS expense_carbon,
           (e.carbon * (i.price * 1.0 / NULLIF(e.amount, 0))) AS kg
      FROM receipt_items i
      JOIN expenses e ON e.id = i.expense_id
     WHERE i.deleted_at IS NULL
       AND e.deleted_at IS NULL
       AND e.carbon > 0
       AND e.amount > 0
       AND i.price  > 0
       AND e.month_key BETWEEN ? AND ?
     ORDER BY kg DESC
     LIMIT 5
  `, [range.m_from, range.m_to]);

  const topItems = itemRows
    .filter((r) => Number.isFinite(r.kg) && r.kg > 0)
    .map((r) => ({
      item_id: r.item_id,
      name: r.name,
      expense_id: r.expense_id,
      itemPrice: r.item_price,
      expenseAmount: r.expense_amount,
      kg: Math.round(r.kg * 100) / 100,
    }));

  const totalYTD = Math.round((ytdRow?.kg || 0) * 100) / 100;
  const monthCurrent = {
    month_key: range.m_to,
    kg: Math.round((monthRow?.kg || 0) * 100) / 100,
  };
  const ready = monthlyTrend.some((m) => m.kg > 0);

  return {
    ready,
    window: { months, from: range.m_from, to: range.m_to },
    monthCurrent,
    totalYTD,
    monthlyTrend,
    topCategories,
    topItems,
  };
}

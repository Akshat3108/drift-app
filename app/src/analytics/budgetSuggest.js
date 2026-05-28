// PS-26 — Budget recommendation engine.
//
// For each live category with any spending in the trailing 6 months, suggests
//   suggestion = ceilTo100(p75(monthly totals) * seasonalMultiplier)
// where `seasonalMultiplier` = `seasonalCalendar.cells[thisMonth].avg /
// mean(non-null cells)`, clamped to [0.85, 1.25] to avoid extreme spikes.
//
// Categories with 1–2 months of data are returned with `low_confidence: true`
// so the UI can chip them; categories with zero observations are skipped.
//
// User reviews and applies — this module never writes.

import { all } from '../db';
import { NOT_DELETED_C } from '../db/predicates';
import { seasonalCalendar } from './seasonal';

const LOOKBACK_MONTHS = 6;
const MIN_CONFIDENT_SAMPLES = 3;
const MULTIPLIER_LOW  = 0.85;
const MULTIPLIER_HIGH = 1.25;

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// p75 via linear interpolation between adjacent order statistics — matches
// SQL `PERCENTILE_CONT(0.75)` behaviour without requiring the extension.
export function p75(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = 0.75 * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

export function ceilToHundred(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 100) * 100;
}

export function clampedMultiplier(rawMultiplier) {
  if (!Number.isFinite(rawMultiplier) || rawMultiplier <= 0) return 1;
  return Math.max(MULTIPLIER_LOW, Math.min(MULTIPLIER_HIGH, rawMultiplier));
}

// Builds a human-readable rationale chip. Kept tight to fit on a single
// 280-px row in BudgetSetup.
export function rationaleFor({ sampleMonths, multiplier, lowConfidence }) {
  const monthLabel = sampleMonths === 1 ? '1 month' : `${sampleMonths} mo`;
  if (lowConfidence) return `p75 of ${monthLabel} (low confidence)`;
  if (multiplier === 1) return `p75 of last ${monthLabel}`;
  const pct = Math.round(Math.abs(multiplier - 1) * 100);
  const direction = multiplier > 1 ? '+' : '−';
  return `p75 of last ${monthLabel} · ${direction}${pct}% seasonal`;
}

export async function suggestBudgets({ monthKey } = {}) {
  const mk = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : thisMonthKey();
  const currentMonth = parseInt(mk.slice(5, 7), 10);

  // 1) Seasonal multiplier (whole-app, not per-category — same model the
  // spec calls for via the existing seasonalCalendar() ratios).
  let multiplier = 1;
  let multiplierSource = 'flat';
  let seasonalReady = false;
  try {
    const seasonal = await seasonalCalendar({ months: 36 });
    if (seasonal?.ready && Array.isArray(seasonal.cells)) {
      seasonalReady = true;
      const present = seasonal.cells.filter((c) => c.avg_spend != null);
      if (present.length > 0) {
        const meanAvg = present.reduce((s, c) => s + c.avg_spend, 0) / present.length;
        const thisCell = seasonal.cells.find((c) => c.month === currentMonth);
        if (meanAvg > 0 && thisCell?.avg_spend != null) {
          const raw = thisCell.avg_spend / meanAvg;
          multiplier = clampedMultiplier(raw);
          multiplierSource = Math.abs(raw - multiplier) > 1e-6 ? 'clamped' : 'seasonal';
        }
      }
    }
  } catch (_) { /* leave multiplier=1, source='flat' */ }

  // 2) Per-category 6-month totals from monthly_summary.
  // The monthly_summary rollup is soft-delete-aware via v12 triggers, so no
  // NOT_DELETED_E predicate is needed here.
  const rows = await all(
    `SELECT c.id   AS category_id,
            c.name AS name,
            c.emoji AS emoji,
            c.budget AS current_budget,
            ms.month_key AS month_key,
            ms.total     AS total
       FROM categories c
       LEFT JOIN monthly_summary ms
              ON ms.category_id = c.id
             AND ms.month_key >= strftime('%Y-%m', date('now', '-' || ? || ' month'))
             AND ms.month_key < ?
      WHERE ${NOT_DELETED_C}
      ORDER BY c.id`,
    [LOOKBACK_MONTHS, mk]
  );

  // Group by category.
  const byCat = new Map();
  for (const r of rows) {
    let entry = byCat.get(r.category_id);
    if (!entry) {
      entry = {
        category_id: r.category_id,
        name: r.name,
        emoji: r.emoji,
        current_budget: Number(r.current_budget) || 0,
        totals: [],
      };
      byCat.set(r.category_id, entry);
    }
    if (r.month_key && r.total != null) {
      entry.totals.push(Number(r.total) || 0);
    }
  }

  const suggestions = [];
  for (const entry of byCat.values()) {
    if (entry.totals.length === 0) continue; // never spent — no signal
    const baseP75 = p75(entry.totals);
    const lowConfidence = entry.totals.length < MIN_CONFIDENT_SAMPLES;
    const suggestion = ceilToHundred(baseP75 * multiplier);
    suggestions.push({
      category_id: entry.category_id,
      name: entry.name,
      emoji: entry.emoji,
      current_budget: entry.current_budget,
      p75: +baseP75.toFixed(2),
      multiplier,
      sample_months: entry.totals.length,
      low_confidence: lowConfidence,
      suggestion,
      rationale: rationaleFor({
        sampleMonths: entry.totals.length,
        multiplier,
        lowConfidence,
      }),
    });
  }

  // Sort biggest suggestion first — matches the BudgetSetup default ordering.
  suggestions.sort((a, b) => b.suggestion - a.suggestion);

  return {
    ready: suggestions.length > 0,
    month_key: mk,
    multiplier,
    multiplier_source: multiplierSource,
    seasonal_ready: seasonalReady,
    lookback_months: LOOKBACK_MONTHS,
    suggestions,
  };
}

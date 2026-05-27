// PS-02 — moodAggregates()
//
// Per-mood spend stats over the last N months + "biggest mood deltas"
// callout per (category, mood) cell. Mood is stored as the literal emoji
// string ('😍'|'😌'|'😐'|'😬'|'😞') in expenses.mood; no FK, nullable, no
// index. Window-bounded queries scope by `month_key` which IS indexed.
//
// Gate (ready=false → screen shows empty-state):
//   n < 30  OR  fewer than 3 of the 5 moods have at least one expense.
//
// Two SQL passes, both filtered through `deleted_at IS NULL`:
//   1. per-mood totals (n / total / avg)
//   2. per-(category, mood) cells joined with each category's baseline avg
//
// Top-5 deltas computed in JS from the cells (cheap — at most 5 × Ncats
// rows). Filter `n_cell >= 3` so a single outlier never dominates.

import { all, one } from '../db';

const MOODS = [
  { mood: '😍', label: 'Loved it' },
  { mood: '😌', label: 'Worth it' },
  { mood: '😐', label: 'Neutral'  },
  { mood: '😬', label: 'Unsure'   },
  { mood: '😞', label: 'Regret'   },
];

const MIN_TOTAL_N      = 30;
const MIN_NON_EMPTY    = 3;
const MIN_CELL_N       = 3;
const MAX_DELTAS       = 5;

export async function moodAggregates({ months = 6 } = {}) {
  const range = await one(`
    SELECT strftime('%Y-%m', date('now','-' || ? || ' months')) AS m_from,
           strftime('%Y-%m', date('now'))                       AS m_to
  `, [months]);

  const perMoodRows = await all(`
    SELECT mood,
           COUNT(*)       AS count,
           SUM(amount)    AS total,
           AVG(amount)    AS avg
      FROM expenses
     WHERE deleted_at IS NULL
       AND mood IS NOT NULL
       AND month_key BETWEEN ? AND ?
     GROUP BY mood
  `, [range.m_from, range.m_to]);

  const byMood = new Map(perMoodRows.map((r) => [r.mood, r]));
  const perMood = MOODS.map((m) => {
    const r = byMood.get(m.mood);
    return {
      mood: m.mood,
      label: m.label,
      count: r?.count ?? 0,
      total: r?.total ?? 0,
      avg:   r?.avg   ?? null,
    };
  });

  const n = perMood.reduce((s, r) => s + r.count, 0);
  const nonEmpty = perMood.filter((p) => p.count > 0).length;
  const ready = n >= MIN_TOTAL_N && nonEmpty >= MIN_NON_EMPTY;

  // Cells: per (category, mood). Baseline = the same category's mood-tagged
  // window avg (so we're comparing apples to apples — both numerator and
  // denominator only count rows where the user logged a mood).
  const cellRows = await all(`
    SELECT e.category_id,
           COALESCE(c.name, 'Uncategorised') AS name,
           e.mood,
           COUNT(*)    AS n_cell,
           AVG(e.amount) AS mood_avg
      FROM expenses e
      LEFT JOIN categories c ON c.id = e.category_id AND c.deleted_at IS NULL
     WHERE e.deleted_at IS NULL
       AND e.mood IS NOT NULL
       AND e.month_key BETWEEN ? AND ?
     GROUP BY e.category_id, e.mood
  `, [range.m_from, range.m_to]);

  const baselineRows = await all(`
    SELECT e.category_id,
           AVG(e.amount) AS base_avg,
           COUNT(*)      AS base_n
      FROM expenses e
     WHERE e.deleted_at IS NULL
       AND e.mood IS NOT NULL
       AND e.month_key BETWEEN ? AND ?
     GROUP BY e.category_id
  `, [range.m_from, range.m_to]);
  const baseByCat = new Map(baselineRows.map((r) => [r.category_id, r]));

  const labelByMood = new Map(MOODS.map((m) => [m.mood, m.label]));

  const deltas = cellRows
    .filter((c) => c.n_cell >= MIN_CELL_N)
    .map((c) => {
      const base = baseByCat.get(c.category_id);
      const baselineAvg = base?.base_avg ?? null;
      const deltaAbs = baselineAvg != null ? (c.mood_avg - baselineAvg) : 0;
      const deltaPct = baselineAvg && baselineAvg !== 0 ? deltaAbs / baselineAvg : 0;
      return {
        category_id: c.category_id,
        name: c.name,
        mood: c.mood,
        label: labelByMood.get(c.mood) || c.mood,
        n_cell: c.n_cell,
        moodAvg: c.mood_avg,
        baselineAvg,
        deltaAbs,
        deltaPct,
      };
    })
    .filter((d) => d.baselineAvg != null)
    .sort((a, b) => Math.abs(b.deltaAbs * b.n_cell) - Math.abs(a.deltaAbs * a.n_cell))
    .slice(0, MAX_DELTAS);

  return {
    ready,
    reason: ready ? null : 'insufficient',
    n,
    window: { months, from: range.m_from, to: range.m_to },
    perMood,
    deltas,
  };
}
